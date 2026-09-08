"""Seller-facing successful-sale ledger reads (MON-F01)."""

from __future__ import annotations

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import resolve_user_role

from .financial import (
    payment_has_fee_snapshot,
    seller_completed_payments,
    seller_earnings_summary,
)
from .pagination import SellerSalesPagination
from .serializers import SellerEarningsSerializer, SellerSaleSerializer


class IsSellerRole(BasePermission):
    """Allow only marketplace SELLER role (not Buyer; Admin uses admin APIs)."""

    message = 'Action forbidden: Seller earnings are available to Sellers only.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return resolve_user_role(request.user) == 'SELLER'


class SellerEarningsView(APIView):
    """Exact Seller earnings aggregates from owned COMPLETED Payments."""

    permission_classes = [IsAuthenticated, IsSellerRole]

    @extend_schema(
        tags=['Seller Finance'],
        summary='Seller earnings summary (mock checkout ledger)',
        responses={200: SellerEarningsSerializer},
    )
    def get(self, request):
        payload = seller_earnings_summary(request.user)
        serializer = SellerEarningsSerializer(payload)
        return Response(serializer.data)


class SellerSalesListView(APIView):
    """Paginated completed sales for the authenticated Seller only."""

    permission_classes = [IsAuthenticated, IsSellerRole]
    pagination_class = SellerSalesPagination

    @extend_schema(
        tags=['Seller Finance'],
        summary='Seller completed sales ledger',
        parameters=[
            OpenApiParameter(
                name='page',
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                required=False,
                description='Page number (page size 20).',
            ),
        ],
        responses={200: SellerSaleSerializer(many=True)},
    )
    def get(self, request):
        queryset = seller_completed_payments(request.user).order_by(
            '-created_at',
            '-id',
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        rows = []
        for payment in page:
            product = payment.auction.product
            title = (product.title or '').strip() or 'Untitled listing'
            has_snapshot = payment_has_fee_snapshot(
                fee_rate=payment.fee_rate,
                platform_fee=payment.platform_fee,
                seller_net_amount=payment.seller_net_amount,
            )
            rows.append(
                {
                    'payment_id': payment.pk,
                    'auction_id': payment.auction_id,
                    'auction_title': title,
                    'buyer_username': payment.user.username,
                    'amount': payment.amount,
                    'fee_rate': payment.fee_rate,
                    'platform_fee': payment.platform_fee,
                    'seller_net_amount': payment.seller_net_amount,
                    'status': payment.status,
                    'created_at': payment.created_at,
                    'has_fee_snapshot': has_snapshot,
                }
            )
        serializer = SellerSaleSerializer(rows, many=True)
        return paginator.get_paginated_response(serializer.data)
