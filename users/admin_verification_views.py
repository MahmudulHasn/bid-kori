"""Admin-only seller verification review endpoints."""

from __future__ import annotations

from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from notifications.models import Notification
from notifications.realtime import broadcast_notification_created

from .models import SellerVerification
from .seller_verification_serializers import (
    AdminVerificationListSerializer,
    AdminVerificationRejectSerializer,
)


def _get_verification(verification_id: int) -> SellerVerification:
    try:
        return (
            SellerVerification.objects
            .select_related('user')
            .get(pk=verification_id)
        )
    except SellerVerification.DoesNotExist as exc:
        raise NotFound('Verification request not found.') from exc


class AdminVerificationListView(APIView):
    """List all seller verification requests with optional status filter."""

    permission_classes = [IsAdminUser]
    http_method_names = ['get', 'head', 'options']

    def get(self, request):
        queryset = (
            SellerVerification.objects
            .select_related('user')
            .order_by('-created_at')
        )

        status_filter = request.query_params.get('status')
        if status_filter:
            status_upper = status_filter.strip().upper()
            if status_upper in SellerVerification.Status.values:
                queryset = queryset.filter(status=status_upper)

        data = AdminVerificationListSerializer(queryset, many=True).data
        return Response(data)


class AdminVerificationDetailView(APIView):
    """View a single verification request with all details."""

    permission_classes = [IsAdminUser]
    http_method_names = ['get', 'head', 'options']

    def get(self, request, verification_id: int):
        verification = _get_verification(verification_id)
        data = AdminVerificationListSerializer(verification).data
        return Response(data)


class AdminVerificationApproveView(APIView):
    """Approve a seller verification request."""

    permission_classes = [IsAdminUser]
    http_method_names = ['post', 'head', 'options']

    def post(self, request, verification_id: int):
        verification = _get_verification(verification_id)

        if verification.status == SellerVerification.Status.APPROVED:
            return Response(
                {'detail': 'Already approved.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        verification.status = SellerVerification.Status.APPROVED
        verification.reviewed_by = request.user
        verification.reviewed_at = timezone.now()
        verification.admin_note = ''
        verification.save(
            update_fields=['status', 'reviewed_by', 'reviewed_at', 'admin_note', 'updated_at']
        )

        try:
            notif = Notification.objects.create(
                user=verification.user,
                type=Notification.Type.SELLER_VERIFICATION_APPROVED,
                title='Seller Verification Approved',
                message='Congratulations! Your seller verification has been approved. You can now create product listings.',
            )
            broadcast_notification_created(notif)
        except Exception:
            pass

        data = AdminVerificationListSerializer(verification).data
        return Response(data)


class AdminVerificationRejectView(APIView):
    """Reject a seller verification request with optional note."""

    permission_classes = [IsAdminUser]
    http_method_names = ['post', 'head', 'options']

    def post(self, request, verification_id: int):
        verification = _get_verification(verification_id)

        if verification.status == SellerVerification.Status.REJECTED:
            return Response(
                {'detail': 'Already rejected.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AdminVerificationRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        verification.status = SellerVerification.Status.REJECTED
        verification.reviewed_by = request.user
        verification.reviewed_at = timezone.now()
        admin_note = serializer.validated_data.get('admin_note', '')
        verification.admin_note = admin_note
        verification.save(
            update_fields=['status', 'reviewed_by', 'reviewed_at', 'admin_note', 'updated_at']
        )

        try:
            reject_msg = 'Your seller verification request was not approved.'
            if admin_note:
                reject_msg += f' Reason: {admin_note}'
            else:
                reject_msg += ' Please review your documents and resubmit.'
            notif = Notification.objects.create(
                user=verification.user,
                type=Notification.Type.SELLER_VERIFICATION_REJECTED,
                title='Seller Verification Rejected',
                message=reject_msg,
            )
            broadcast_notification_created(notif)
        except Exception:
            pass

        data = AdminVerificationListSerializer(verification).data
        return Response(data)

