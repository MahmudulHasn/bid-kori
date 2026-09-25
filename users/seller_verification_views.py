"""Seller-facing verification submit and status endpoints."""

from __future__ import annotations

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from notifications.models import Notification
from notifications.realtime import broadcast_notification_created

from .models import SellerVerification, resolve_user_role
from .seller_verification_serializers import (
    SellerVerificationStatusSerializer,
    SellerVerificationSubmitSerializer,
)


def _require_seller(user):
    """Raise 403 if the authenticated user is not a SELLER."""
    role = resolve_user_role(user)
    if role != 'SELLER':
        raise ValidationError(
            {'detail': 'Only sellers can access verification.'}
        )


class SellerVerificationStatusView(APIView):
    """Check the current seller's verification status."""

    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'head', 'options']

    def get(self, request):
        _require_seller(request.user)
        verification = SellerVerification.objects.filter(user=request.user).first()
        if verification is None:
            return Response({'status': None})
        return Response(SellerVerificationStatusSerializer(verification).data)


class SellerVerificationSubmitView(APIView):
    """Submit verification documents (NID/Passport, WhatsApp, location)."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    http_method_names = ['post', 'head', 'options']

    def post(self, request):
        _require_seller(request.user)

        existing = SellerVerification.objects.filter(user=request.user).first()
        if existing is not None:
            if existing.status == SellerVerification.Status.PENDING:
                raise ValidationError(
                    {'detail': 'Verification already submitted and pending review.'}
                )
            if existing.status == SellerVerification.Status.APPROVED:
                raise ValidationError(
                    {'detail': 'Your account is already verified.'}
                )
            # REJECTED — allow resubmission by updating the existing record.
            serializer = SellerVerificationSubmitSerializer(
                existing, data=request.data
            )
            serializer.is_valid(raise_exception=True)
            serializer.save(
                status=SellerVerification.Status.PENDING,
                admin_note='',
                reviewed_by=None,
                reviewed_at=None,
            )
            self._notify_admins(request.user)
            return Response(
                SellerVerificationStatusSerializer(existing).data,
                status=status.HTTP_200_OK,
            )

        # First-time submission.
        serializer = SellerVerificationSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        verification = serializer.save(user=request.user)
        self._notify_admins(request.user)
        return Response(
            SellerVerificationStatusSerializer(verification).data,
            status=status.HTTP_201_CREATED,
        )


    @staticmethod
    def _notify_admins(seller_user):
        """Create a notification for all staff users about the new request."""
        staff_users = User.objects.filter(is_staff=True, is_active=True)
        for admin_user in staff_users:
            try:
                notif = Notification.objects.create(
                    user=admin_user,
                    type=Notification.Type.SELLER_VERIFICATION_SUBMITTED,
                    title='New Seller Verification Request',
                    message=f'{seller_user.username} has submitted verification documents for review.',
                )
                broadcast_notification_created(notif)
            except Exception:
                pass
