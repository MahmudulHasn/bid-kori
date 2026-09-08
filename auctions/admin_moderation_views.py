"""Admin Auction hide/restore visibility + cancel lifecycle (MOD-B01/B02)."""

from __future__ import annotations

from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from products.moderation_serializers import (
    ModerationReasonSerializer,
    ModerationStateSerializer,
)

from .models import Auction
from .serializers import AuctionSerializer
from .services import AuctionLifecycleService


def _moderation_state(auction: Auction) -> dict:
    return {
        'id': auction.pk,
        'is_hidden': auction.is_hidden,
        'moderation_reason': auction.moderation_reason,
        'moderated_at': auction.moderated_at,
    }


def hide_auction(*, auction: Auction, reason: str, moderator) -> Auction:
    """Hide Auction for public surfaces without mutating lifecycle/economics."""
    auction.is_hidden = True
    if reason:
        auction.moderation_reason = reason
    auction.moderated_at = timezone.now()
    auction.moderated_by = moderator
    auction.save(
        update_fields=[
            'is_hidden',
            'moderation_reason',
            'moderated_at',
            'moderated_by',
        ]
    )
    return auction


def restore_auction(*, auction: Auction) -> Auction:
    """Clear Auction visibility moderation only. Does not reopen lifecycle."""
    auction.is_hidden = False
    auction.moderation_reason = ''
    auction.moderated_at = None
    auction.moderated_by = None
    auction.save(
        update_fields=[
            'is_hidden',
            'moderation_reason',
            'moderated_at',
            'moderated_by',
        ]
    )
    return auction


class AdminAuctionHideView(APIView):
    """POST /api/admin/auctions/<id>/hide/ — staff only."""

    permission_classes = [IsAdminUser]
    http_method_names = ['post', 'head', 'options']

    def post(self, request, auction_id):
        auction = get_object_or_404(
            Auction.objects.select_related('product', 'product__seller'),
            pk=auction_id,
        )
        serializer = ModerationReasonSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get('reason') or ''
        auction = hide_auction(
            auction=auction,
            reason=reason,
            moderator=request.user,
        )
        return Response(ModerationStateSerializer(_moderation_state(auction)).data)


class AdminAuctionRestoreView(APIView):
    """POST /api/admin/auctions/<id>/restore/ — staff only."""

    permission_classes = [IsAdminUser]
    http_method_names = ['post', 'head', 'options']

    def post(self, request, auction_id):
        auction = get_object_or_404(
            Auction.objects.select_related('product', 'product__seller'),
            pk=auction_id,
        )
        auction = restore_auction(auction=auction)
        return Response(ModerationStateSerializer(_moderation_state(auction)).data)


class AdminAuctionCancelView(APIView):
    """POST /api/admin/auctions/<id>/cancel/ — staff only (MOD-B02).

    ACTIVE unpaid auctions only via AuctionLifecycleService. Does not hide,
    reopen, mutate economics, or delete bids/payments.
    """

    permission_classes = [IsAdminUser]
    http_method_names = ['post', 'head', 'options']

    def post(self, request, auction_id):
        # Ensure 404 before optional body validation when auction is missing.
        get_object_or_404(Auction.objects.only('id'), pk=auction_id)

        serializer = ModerationReasonSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get('reason') or ''

        try:
            auction, _cancelled = AuctionLifecycleService.cancel_auction(
                auction_id,
                reason=reason or None,
                moderator=request.user,
                enforce_unpaid=True,
            )
        except ValidationError as exc:
            return Response(
                {'error': exc.messages[0] if exc.messages else str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        auction = Auction.objects.select_related(
            'product',
            'product__seller',
            'product__category',
            'winning_bidder',
        ).prefetch_related('bids__bidder', 'images').get(pk=auction.pk)

        return Response(
            AuctionSerializer(auction, context={'request': request}).data,
            status=status.HTTP_200_OK,
        )
