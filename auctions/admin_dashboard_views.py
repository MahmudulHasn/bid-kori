"""Admin-facing platform dashboard summary (ADMIN-X01).

Provides authoritative, read-only aggregate platform status for the Next.js
Admin Command Center in a single staff-only request.
"""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import User
from django.db import connection
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from auctions.financial import admin_financial_summary
from auctions.models import Auction, Bid, Payment, WinnerDetailsUnlock, WinnerFulfillmentDetails
from products.models import Product
from users.models import UserProfile


def _check_database_health() -> str:
    try:
        connection.ensure_connection()
        return 'healthy'
    except Exception:
        return 'unreachable'


def _check_redis_health(url: str) -> str:
    if not url:
        return 'not_configured'
    try:
        from redis import Redis

        client = Redis.from_url(url, socket_connect_timeout=1)
        return 'healthy' if client.ping() is True else 'unreachable'
    except Exception:
        return 'unreachable'


class AdminDashboardSummaryView(APIView):
    """Platform-wide management status and KPI summary (staff only)."""

    permission_classes = [IsAdminUser]

    @extend_schema(
        tags=['Admin Dashboard'],
        summary='Platform command center summary (staff only)',
        responses={200: dict},
    )
    def get(self, request):
        now = timezone.now()

        # 1. User statistics
        total_users = User.objects.count()
        active_users = User.objects.filter(is_active=True).count()
        suspended_users = User.objects.filter(is_active=False).count()
        admin_users = User.objects.filter(Q(is_staff=True) | Q(is_superuser=True)).count()
        non_admin = Q(is_staff=False) & Q(is_superuser=False)
        buyer_users = User.objects.filter(
            non_admin & (Q(profile__role=UserProfile.Role.BUYER) | Q(profile__isnull=True))
        ).count()
        seller_users = User.objects.filter(
            non_admin & Q(profile__role=UserProfile.Role.SELLER)
        ).count()

        # 2. Auction statistics & lifecycle breakdown
        total_auctions = Auction.objects.count()
        upcoming_auctions = Auction.objects.filter(
            status=Auction.Status.ACTIVE,
            start_time__gt=now,
        ).count()
        live_auctions = Auction.objects.filter(
            status=Auction.Status.ACTIVE,
            start_time__lte=now,
            end_time__gt=now,
        ).count()
        closed_auctions = Auction.objects.filter(status=Auction.Status.CLOSED).count()
        cancelled_auctions = Auction.objects.filter(status=Auction.Status.CANCELLED).count()
        hidden_auctions = Auction.objects.filter(is_hidden=True).count()

        # 3. Product statistics
        total_products = Product.objects.count()
        hidden_products = Product.objects.filter(is_hidden=True).count()

        # 4. Bid statistics
        total_bids = Bid.objects.count()

        # 5. Financial statistics (from Payment ledger)
        finance_summary = admin_financial_summary()

        # 6. Moderation attention items
        moderation_stats = {
            'hidden_products_count': hidden_products,
            'hidden_auctions_count': hidden_auctions,
            'cancelled_auctions_count': cancelled_auctions,
            'suspended_users_count': suspended_users,
            'total_attention_required': (
                hidden_products + hidden_auctions + cancelled_auctions + suspended_users
            ),
        }

        # 7. Recent activity (capped at 5 items each, newest first)
        recent_users = [
            {
                'id': u.id,
                'username': u.username,
                'email': u.email,
                'role': (
                    'ADMIN'
                    if u.is_staff or u.is_superuser
                    else getattr(getattr(u, 'profile', None), 'role', 'BUYER') or 'BUYER'
                ),
                'is_active': u.is_active,
                'date_joined': u.date_joined.isoformat() if u.date_joined else None,
            }
            for u in User.objects.select_related('profile').order_by('-date_joined', '-id')[:5]
        ]

        recent_products = [
            {
                'id': p.id,
                'title': p.title,
                'seller_username': p.seller.username,
                'category_name': p.category.name if p.category else 'Uncategorized',
                'is_hidden': p.is_hidden,
                'created_at': p.created_at.isoformat() if p.created_at else None,
            }
            for p in Product.objects.select_related('seller', 'category').order_by('-created_at', '-id')[:5]
        ]

        recent_auctions = [
            {
                'id': a.id,
                'title': a.product.title if a.product else '',
                'seller_username': a.product.seller.username if a.product and a.product.seller else 'Unknown',
                'status': a.status,
                'current_price': str(a.current_highest_bid or a.starting_bid),
                'is_hidden': a.is_hidden,
                'created_at': a.created_at.isoformat() if a.created_at else None,
            }
            for a in Auction.objects.select_related('product', 'product__seller').order_by('-created_at', '-id')[:5]
        ]

        recent_bids = [
            {
                'id': b.id,
                'auction_id': b.auction_id,
                'auction_title': b.auction.product.title if b.auction and b.auction.product else '',
                'amount': str(b.amount),
                'bidder_username': b.bidder.username if b.bidder else 'Unknown',
                'timestamp': b.timestamp.isoformat() if b.timestamp else None,
            }
            for b in Bid.objects.select_related('bidder', 'auction', 'auction__product').order_by('-timestamp', '-id')[:5]
        ]

        recent_payments = [
            {
                'id': pay.id,
                'auction_id': pay.auction_id,
                'auction_title': pay.auction.product.title if pay.auction and pay.auction.product else '',
                'amount': str(pay.amount),
                'platform_fee': str(pay.platform_fee) if pay.platform_fee is not None else None,
                'buyer_username': pay.user.username if pay.user else 'Unknown',
                'created_at': pay.created_at.isoformat() if pay.created_at else None,
            }
            for pay in Payment.objects.filter(status=Payment.Status.COMPLETED).select_related('user', 'auction', 'auction__product').order_by('-created_at', '-id')[:5]
        ]

        # 8. Safe system health status
        redis_url = getattr(settings, 'REDIS_URL', '')
        broker_url = getattr(settings, 'CELERY_BROKER_URL', '')
        system_health = {
            'database': _check_database_health(),
            'redis': _check_redis_health(redis_url),
            'celery_broker': _check_redis_health(broker_url),
            'api': 'healthy',
        }

        # 9. Fulfillment snapshot (ADMIN-W01)
        closed_with_winner = Auction.objects.filter(
            status=Auction.Status.CLOSED,
            winning_bidder__isnull=False,
        )
        completed_wfd = closed_with_winner.filter(
            winner_fulfillment_details__status=WinnerFulfillmentDetails.Status.COMPLETED,
        )
        unlocked_auctions = completed_wfd.filter(
            winner_details_unlock__status=WinnerDetailsUnlock.Status.PAID,
        ).count()
        completed_locked_auctions = completed_wfd.count() - unlocked_auctions
        recent_unlocks_7d = WinnerDetailsUnlock.objects.filter(
            status=WinnerDetailsUnlock.Status.PAID,
            paid_at__gte=now - timedelta(days=7),
        ).count()

        payload = {
            'users': {
                'total': total_users,
                'buyers': buyer_users,
                'sellers': seller_users,
                'admins': admin_users,
                'active': active_users,
                'suspended': suspended_users,
            },
            'auctions': {
                'total': total_auctions,
                'upcoming': upcoming_auctions,
                'live': live_auctions,
                'closed': closed_auctions,
                'cancelled': cancelled_auctions,
                'hidden': hidden_auctions,
            },
            'products': {
                'total': total_products,
                'hidden': hidden_products,
            },
            'bids': {
                'total': total_bids,
            },
            'finance': finance_summary,
            'fulfillment': {
                'completed_locked': completed_locked_auctions,
                'unlocked': unlocked_auctions,
                'recent_unlocks_7d': recent_unlocks_7d,
            },
            'moderation': moderation_stats,
            'recent_activity': {
                'users': recent_users,
                'products': recent_products,
                'auctions': recent_auctions,
                'bids': recent_bids,
                'payments': recent_payments,
            },
            'system_health': system_health,
        }

        return Response(payload)
