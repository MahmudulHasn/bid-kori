"""Admin fulfillment audit views (ADMIN-W01).

Staff-only, read-only visibility into winner fulfillment status,
seller unlock activity, unlock revenue, and data integrity.
No Buyer PII exposure. No mutations.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import (
    Case,
    CharField,
    Count,
    F,
    Q,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema, OpenApiParameter
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from notifications.models import Notification

from .admin_fulfillment_serializers import (
    AdminFulfillmentDetailSerializer,
    AdminFulfillmentListSerializer,
    AdminFulfillmentSummarySerializer,
)
from .models import Auction, WinnerDetailsUnlock, WinnerFulfillmentDetails
from .pagination import AdminFulfillmentPagination

ZERO = Decimal('0.00')

# ---------------------------------------------------------------------------
# Derived state helpers
# ---------------------------------------------------------------------------

FULFILLMENT_STATES = ('NOT_STARTED', 'DRAFT', 'COMPLETED_LOCKED', 'UNLOCKED')


def derive_fulfillment_status(wfd_status, unlock_status):
    """Derive display state from WinnerFulfillmentDetails + WinnerDetailsUnlock."""
    if wfd_status is None:
        return 'NOT_STARTED'
    if wfd_status == WinnerFulfillmentDetails.Status.DRAFT:
        return 'DRAFT'
    if wfd_status == WinnerFulfillmentDetails.Status.COMPLETED:
        if unlock_status == WinnerDetailsUnlock.Status.PAID:
            return 'UNLOCKED'
        return 'COMPLETED_LOCKED'
    return 'NOT_STARTED'


def money_str(value):
    """Format Decimal as 2dp string, never float."""
    amount = ZERO if value is None else Decimal(value)
    return f'{amount.quantize(ZERO):.2f}'


# ---------------------------------------------------------------------------
# Integrity checks
# ---------------------------------------------------------------------------

def check_integrity(auction, wfd, unlock):
    """Run deterministic integrity checks and return (status, issues list)."""
    issues = []

    if wfd is not None and auction.winning_bidder_id is not None:
        if wfd.buyer_id != auction.winning_bidder_id:
            issues.append('Fulfillment buyer does not match auction winner.')

    if unlock is not None:
        seller_id = auction.product.seller_id if auction.product else None
        if seller_id and unlock.seller_id != seller_id:
            issues.append('Unlock seller does not match auction product seller.')

        if unlock.status == WinnerDetailsUnlock.Status.PAID:
            if unlock.unlocked_at is None:
                issues.append('PAID unlock is missing unlocked_at timestamp.')
            if wfd is None:
                issues.append('PAID unlock exists but no winner fulfillment details.')

        if auction.status == Auction.Status.CANCELLED:
            issues.append('Unlock record exists for a CANCELLED auction.')

    return ('WARNING' if issues else 'OK', issues)


# ---------------------------------------------------------------------------
# Notification audit helpers
# ---------------------------------------------------------------------------

def get_notification_audit(auction_id):
    """Derive notification lifecycle indicators from persistent Notification rows."""
    notifs = Notification.objects.filter(auction_id=auction_id).values_list(
        'type', flat=True,
    )
    types_set = set(notifs)

    ready_sent = Notification.Type.SELLER_WINNER_DETAILS_READY in types_set
    unlocked_sent = Notification.Type.WINNER_DETAILS_UNLOCKED in types_set

    updated_qs = Notification.objects.filter(
        auction_id=auction_id,
        type=Notification.Type.SELLER_WINNER_DETAILS_UPDATED,
    )
    updated_count = updated_qs.count()
    updated_latest = (
        updated_qs.order_by('-created_at').values_list('created_at', flat=True).first()
    )

    return {
        'details_ready_notified': ready_sent,
        'unlock_notified': unlocked_sent,
        'details_updated_count': updated_count,
        'details_updated_latest': updated_latest,
    }


# ---------------------------------------------------------------------------
# Summary View
# ---------------------------------------------------------------------------

class AdminFulfillmentSummaryView(APIView):
    """Aggregate fulfillment status counts and unlock revenue (staff only)."""

    permission_classes = [IsAdminUser]

    @extend_schema(
        tags=['Admin Fulfillment'],
        summary='Fulfillment audit summary (staff only)',
        responses={200: AdminFulfillmentSummarySerializer},
    )
    def get(self, request):
        now = timezone.now()

        # Base: closed auctions with a winner
        base = Auction.objects.filter(
            status=Auction.Status.CLOSED,
            winning_bidder__isnull=False,
        )
        total = base.count()

        # WFD status counts
        with_wfd = base.filter(winner_fulfillment_details__isnull=False)
        without_wfd = total - with_wfd.count()

        draft_count = with_wfd.filter(
            winner_fulfillment_details__status=WinnerFulfillmentDetails.Status.DRAFT,
        ).count()

        completed = with_wfd.filter(
            winner_fulfillment_details__status=WinnerFulfillmentDetails.Status.COMPLETED,
        )

        unlocked_count = completed.filter(
            winner_details_unlock__status=WinnerDetailsUnlock.Status.PAID,
        ).count()

        completed_locked_count = completed.count() - unlocked_count

        # Unlock revenue — exact Decimal SUM of PAID fee_amount
        revenue_agg = WinnerDetailsUnlock.objects.filter(
            status=WinnerDetailsUnlock.Status.PAID,
        ).aggregate(
            total_revenue=Coalesce(Sum('fee_amount'), ZERO),
            unlock_count=Count('id'),
        )

        recent_unlocks_7d = WinnerDetailsUnlock.objects.filter(
            status=WinnerDetailsUnlock.Status.PAID,
            paid_at__gte=now - timedelta(days=7),
        ).count()

        payload = {
            'total_requiring_fulfillment': total,
            'not_started': without_wfd,
            'draft': draft_count,
            'completed_locked': completed_locked_count,
            'unlocked': unlocked_count,
            'unlock_revenue': money_str(revenue_agg['total_revenue']),
            'unlock_count': revenue_agg['unlock_count'] or 0,
            'recent_unlocks_7d': recent_unlocks_7d,
            'disclosure': (
                'Winner Details unlock revenue from mock/internal payments. '
                'Separate from seller successful-sale platform fees. '
                'Not bank settlement.'
            ),
        }
        serializer = AdminFulfillmentSummarySerializer(payload)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# List View
# ---------------------------------------------------------------------------

class AdminFulfillmentListView(APIView):
    """Paginated, filterable fulfillment audit list (staff only).

    No Buyer PII. Uses select_related/annotations for query efficiency.
    """

    permission_classes = [IsAdminUser]

    @extend_schema(
        tags=['Admin Fulfillment'],
        summary='Fulfillment audit list (staff only)',
        parameters=[
            OpenApiParameter('status', str, description='Filter by derived status: NOT_STARTED, DRAFT, COMPLETED_LOCKED, UNLOCKED'),
            OpenApiParameter('unlock_status', str, description='Filter by unlock payment status: PAID, PENDING, FAILED'),
            OpenApiParameter('seller', str, description='Filter by seller username'),
            OpenApiParameter('winner', str, description='Filter by winner username'),
            OpenApiParameter('search', str, description='Search auction title or product title'),
            OpenApiParameter('ordering', str, description='Sort: -updated_at (default), -submitted_at, -unlocked_at'),
            OpenApiParameter('page', int, description='Page number'),
        ],
        responses={200: AdminFulfillmentListSerializer(many=True)},
    )
    def get(self, request):
        qs = (
            Auction.objects.filter(
                status__in=[Auction.Status.CLOSED, Auction.Status.CANCELLED],
                winning_bidder__isnull=False,
            )
            .select_related(
                'product',
                'product__seller',
                'winning_bidder',
                'winner_fulfillment_details',
                'winner_details_unlock',
            )
        )

        # --- Server-side filtering ---
        status_filter = request.query_params.get('status')
        if status_filter:
            status_filter = status_filter.upper()
            if status_filter == 'NOT_STARTED':
                qs = qs.filter(winner_fulfillment_details__isnull=True)
            elif status_filter == 'DRAFT':
                qs = qs.filter(
                    winner_fulfillment_details__status=WinnerFulfillmentDetails.Status.DRAFT,
                )
            elif status_filter == 'COMPLETED_LOCKED':
                qs = qs.filter(
                    winner_fulfillment_details__status=WinnerFulfillmentDetails.Status.COMPLETED,
                ).exclude(
                    winner_details_unlock__status=WinnerDetailsUnlock.Status.PAID,
                )
            elif status_filter == 'UNLOCKED':
                qs = qs.filter(
                    winner_fulfillment_details__status=WinnerFulfillmentDetails.Status.COMPLETED,
                    winner_details_unlock__status=WinnerDetailsUnlock.Status.PAID,
                )

        unlock_filter = request.query_params.get('unlock_status')
        if unlock_filter:
            qs = qs.filter(winner_details_unlock__status=unlock_filter.upper())

        seller_filter = request.query_params.get('seller')
        if seller_filter:
            qs = qs.filter(product__seller__username__icontains=seller_filter)

        winner_filter = request.query_params.get('winner')
        if winner_filter:
            qs = qs.filter(winning_bidder__username__icontains=winner_filter)

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(product__title__icontains=search)
                | Q(product__seller__username__icontains=search)
                | Q(winning_bidder__username__icontains=search)
            )

        # --- Ordering ---
        ordering = request.query_params.get('ordering', '-created_at')
        valid_orderings = {
            '-updated_at': '-created_at',
            '-submitted_at': '-winner_fulfillment_details__submitted_at',
            '-unlocked_at': '-winner_details_unlock__unlocked_at',
            '-created_at': '-created_at',
        }
        qs = qs.order_by(valid_orderings.get(ordering, '-created_at'), '-id')

        # --- Paginate ---
        paginator = AdminFulfillmentPagination()
        page = paginator.paginate_queryset(qs, request)
        items = page if page is not None else qs

        # --- Serialize (manual projection — no PII) ---
        results = []
        for auction in items:
            wfd = getattr(auction, 'winner_fulfillment_details', None)
            unlock = getattr(auction, 'winner_details_unlock', None)

            wfd_status = wfd.status if wfd else None
            u_status = unlock.status if unlock else None

            integrity_status, _ = check_integrity(auction, wfd, unlock)

            results.append({
                'auction_id': auction.id,
                'auction_title': auction.product.title if auction.product else '',
                'product_title': auction.product.title if auction.product else '',
                'seller_id': auction.product.seller_id if auction.product else None,
                'seller_username': auction.product.seller.username if auction.product and auction.product.seller else '',
                'winner_id': auction.winning_bidder_id,
                'winner_username': auction.winning_bidder.username if auction.winning_bidder else None,
                'fulfillment_status': derive_fulfillment_status(wfd_status, u_status),
                'unlock_status': u_status,
                'unlock_fee': money_str(unlock.fee_amount) if unlock else None,
                'currency': unlock.currency if unlock else None,
                'submitted_at': wfd.submitted_at if wfd else None,
                'unlocked_at': unlock.unlocked_at if unlock else None,
                'updated_at': wfd.updated_at if wfd else None,
                'integrity_status': integrity_status,
            })

        serializer = AdminFulfillmentListSerializer(results, many=True)
        if page is not None:
            return paginator.get_paginated_response(serializer.data)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Detail View
# ---------------------------------------------------------------------------

class AdminFulfillmentDetailView(APIView):
    """Single fulfillment audit detail with integrity and notification metadata (staff only)."""

    permission_classes = [IsAdminUser]

    @extend_schema(
        tags=['Admin Fulfillment'],
        summary='Fulfillment audit detail (staff only)',
        responses={200: AdminFulfillmentDetailSerializer},
    )
    def get(self, request, auction_id):
        auction = get_object_or_404(
            Auction.objects.select_related(
                'product',
                'product__seller',
                'winning_bidder',
                'winner_fulfillment_details',
                'winner_details_unlock',
            ),
            pk=auction_id,
        )

        wfd = getattr(auction, 'winner_fulfillment_details', None)
        unlock = getattr(auction, 'winner_details_unlock', None)

        wfd_status = wfd.status if wfd else None
        u_status = unlock.status if unlock else None

        integrity_status, integrity_issues = check_integrity(auction, wfd, unlock)

        # Notification audit
        notif_audit = get_notification_audit(auction.id)

        # Notification consistency checks
        if wfd and wfd.status == WinnerFulfillmentDetails.Status.COMPLETED:
            if not notif_audit['details_ready_notified']:
                integrity_issues.append(
                    'Details COMPLETED but no SELLER_WINNER_DETAILS_READY notification found.'
                )
                integrity_status = 'WARNING'

        if unlock and unlock.status == WinnerDetailsUnlock.Status.PAID:
            if not notif_audit['unlock_notified']:
                integrity_issues.append(
                    'Unlock PAID but no WINNER_DETAILS_UNLOCKED notification found.'
                )
                integrity_status = 'WARNING'

        payload = {
            'auction_id': auction.id,
            'auction_title': auction.product.title if auction.product else '',
            'auction_status': auction.status,
            'product_title': auction.product.title if auction.product else '',
            'seller_id': auction.product.seller_id if auction.product else None,
            'seller_username': auction.product.seller.username if auction.product and auction.product.seller else '',
            'winner_id': auction.winning_bidder_id,
            'winner_username': auction.winning_bidder.username if auction.winning_bidder else None,
            'fulfillment_id': wfd.id if wfd else None,
            'fulfillment_status': derive_fulfillment_status(wfd_status, u_status),
            'completed_step': wfd.completed_step if wfd else None,
            'submitted_at': wfd.submitted_at if wfd else None,
            'fulfillment_created_at': wfd.created_at if wfd else None,
            'fulfillment_updated_at': wfd.updated_at if wfd else None,
            'unlock_id': unlock.id if unlock else None,
            'unlock_status': u_status,
            'fee_amount': money_str(unlock.fee_amount) if unlock else None,
            'currency': unlock.currency if unlock else None,
            'payment_reference': unlock.payment_reference if unlock else None,
            'payment_method': getattr(unlock, 'payment_method', None) if unlock else None,
            'val_id': getattr(unlock, 'val_id', None) if unlock else None,
            'bank_tran_id': getattr(unlock, 'bank_tran_id', None) if unlock else None,
            'card_type': getattr(unlock, 'card_type', None) if unlock else None,
            'paid_at': unlock.paid_at if unlock else None,
            'unlocked_at': unlock.unlocked_at if unlock else None,
            'integrity_status': integrity_status,
            'integrity_issues': integrity_issues,
            'notification_audit': notif_audit,
        }

        serializer = AdminFulfillmentDetailSerializer(payload)
        return Response(serializer.data)
