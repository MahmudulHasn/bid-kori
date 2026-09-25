"""Seller winner-details status, mock unlock payment, and post-unlock read views (UNLOCK-B01)."""

from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import WinnerDetailsUnlock
from .services import (
    WinnerDetailsUnlockForbidden,
    WinnerDetailsUnlockValidationError,
    WinnerDetailsUnlockService,
)
from .winner_fulfillment_serializers import (
    WinnerDetailsUnlockResponseSerializer,
    WinnerDetailsUnlockStatusSerializer,
    WinnerFulfillmentSellerUnlockedSerializer,
)


class SellerWinnerDetailsStatusView(APIView):
    """Check winner-details completion readiness and unlock status for an owned auction.

    Accessible only to the authenticated Seller who owns the auction.
    Guarantees zero Buyer PII leakage before (and during) status queries.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Seller Winner Details'],
        summary='Check winner details unlock status for owned auction',
        description=(
            'Returns readiness of buyer fulfillment details, configured unlock fee, '
            'and whether the seller has unlocked them. Does not return Buyer PII.'
        ),
        responses={
            200: WinnerDetailsUnlockStatusSerializer,
            400: {'type': 'object', 'properties': {'error': {'type': 'string'}}},
            401: {'type': 'object', 'properties': {'detail': {'type': 'string'}}},
            403: {'type': 'object', 'properties': {'error': {'type': 'string'}}},
            404: {'type': 'object', 'properties': {'detail': {'type': 'string'}}},
        },
    )
    def get(self, request, auction_id=None, pk=None):
        target_id = auction_id if auction_id is not None else pk
        try:
            status_data = WinnerDetailsUnlockService.get_status_for_seller(
                target_id,
                request.user,
            )
        except WinnerDetailsUnlockForbidden as exc:
            return Response({'error': exc.message}, status=status.HTTP_403_FORBIDDEN)
        except WinnerDetailsUnlockValidationError as exc:
            return Response({'error': exc.message}, status=status.HTTP_400_BAD_REQUEST)

        serializer = WinnerDetailsUnlockStatusSerializer(status_data)
        return Response(serializer.data, status=status.HTTP_200_OK)


class SellerWinnerDetailsUnlockView(APIView):
    """Pay unlock fee (mock/internal payment) and gain persistent access entitlement.

    Accessible only to the authenticated Seller who owns the auction.
    Guarantees idempotency and concurrency protection against double charge.
    All authoritative values (fee, seller, status, timestamps) are server-controlled.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Seller Winner Details'],
        summary='Unlock winner fulfillment details via mock payment',
        description=(
            'Records mock payment and creates a persistent access entitlement. '
            'Idempotent: repeating unlock on an already paid record does not double-charge.'
        ),
        request=None,
        responses={
            200: WinnerDetailsUnlockResponseSerializer,
            400: {'type': 'object', 'properties': {'error': {'type': 'string'}}},
            401: {'type': 'object', 'properties': {'detail': {'type': 'string'}}},
            403: {'type': 'object', 'properties': {'error': {'type': 'string'}}},
            404: {'type': 'object', 'properties': {'detail': {'type': 'string'}}},
        },
    )
    def post(self, request, auction_id=None, pk=None):
        target_id = auction_id if auction_id is not None else pk
        gateway = (request.data or {}).get('gateway', 'mock')

        try:
            if gateway == 'sslcommerz':
                payload = WinnerDetailsUnlockService.initiate_sslcommerz_unlock(
                    target_id,
                    request.user,
                )
            else:
                unlock, created = WinnerDetailsUnlockService.unlock_for_seller(
                    target_id,
                    request.user,
                )
                payload = {
                    'auction_id': unlock.auction_id,
                    'status': unlock.status,
                    'is_unlocked': bool(unlock.status == WinnerDetailsUnlock.Status.PAID),
                    'already_unlocked': not created,
                    'fee_amount': unlock.fee_amount,
                    'currency': unlock.currency,
                    'payment_reference': unlock.payment_reference,
                    'unlocked_at': unlock.unlocked_at,
                    'gateway': 'mock',
                    'gateway_url': None,
                }
        except WinnerDetailsUnlockForbidden as exc:
            return Response({'error': exc.message}, status=status.HTTP_403_FORBIDDEN)
        except WinnerDetailsUnlockValidationError as exc:
            return Response({'error': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = WinnerDetailsUnlockResponseSerializer(payload)
        return Response(serializer.data, status=status.HTTP_200_OK)


class SellerWinnerDetailsView(APIView):
    """Retrieve full Buyer fulfillment details after paying the unlock fee.

    Read-only view for the authenticated auction Seller holding a valid PAID unlock.
    Returns 403 Forbidden if not yet unlocked.
    Returns latest details even if Buyer made post-unlock edits (no second charge).
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Seller Winner Details'],
        summary='Retrieve unlocked winner fulfillment details',
        description='Fetches buyer fulfillment details after paid unlock entitlement. Read-only.',
        responses={
            200: WinnerFulfillmentSellerUnlockedSerializer,
            400: {'type': 'object', 'properties': {'error': {'type': 'string'}}},
            401: {'type': 'object', 'properties': {'detail': {'type': 'string'}}},
            403: {'type': 'object', 'properties': {'error': {'type': 'string'}}},
            404: {'type': 'object', 'properties': {'detail': {'type': 'string'}}},
        },
    )
    def get(self, request, auction_id=None, pk=None):
        target_id = auction_id if auction_id is not None else pk
        try:
            details = WinnerDetailsUnlockService.get_unlocked_details(
                target_id,
                request.user,
            )
        except WinnerDetailsUnlockForbidden as exc:
            return Response({'error': exc.message}, status=status.HTTP_403_FORBIDDEN)
        except WinnerDetailsUnlockValidationError as exc:
            return Response({'error': exc.message}, status=status.HTTP_400_BAD_REQUEST)

        serializer = WinnerFulfillmentSellerUnlockedSerializer(details)
        return Response(serializer.data, status=status.HTTP_200_OK)
