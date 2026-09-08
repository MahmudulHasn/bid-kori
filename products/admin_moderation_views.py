"""Admin Product hide/restore visibility moderation (MOD-B01)."""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Product
from .moderation_serializers import (
    ModerationReasonSerializer,
    ModerationStateSerializer,
)


def _moderation_state(product: Product) -> dict:
    return {
        'id': product.pk,
        'is_hidden': product.is_hidden,
        'moderation_reason': product.moderation_reason,
        'moderated_at': product.moderated_at,
    }


def hide_product(*, product: Product, reason: str, moderator) -> Product:
    """Hide Product for public surfaces. Idempotent; updates reason when supplied."""
    product.is_hidden = True
    if reason:
        product.moderation_reason = reason
    product.moderated_at = timezone.now()
    product.moderated_by = moderator
    product.save(
        update_fields=[
            'is_hidden',
            'moderation_reason',
            'moderated_at',
            'moderated_by',
            'updated_at',
        ]
    )
    return product


def restore_product(*, product: Product) -> Product:
    """Clear current moderation visibility state. Idempotent."""
    product.is_hidden = False
    product.moderation_reason = ''
    product.moderated_at = None
    product.moderated_by = None
    product.save(
        update_fields=[
            'is_hidden',
            'moderation_reason',
            'moderated_at',
            'moderated_by',
            'updated_at',
        ]
    )
    return product


class AdminProductHideView(APIView):
    """POST /api/admin/products/<id>/hide/ — staff only."""

    permission_classes = [IsAdminUser]
    http_method_names = ['post', 'head', 'options']

    def post(self, request, product_id):
        product = get_object_or_404(
            Product.objects.select_related('seller'),
            pk=product_id,
        )
        serializer = ModerationReasonSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get('reason') or ''
        product = hide_product(
            product=product,
            reason=reason,
            moderator=request.user,
        )
        return Response(ModerationStateSerializer(_moderation_state(product)).data)


class AdminProductRestoreView(APIView):
    """POST /api/admin/products/<id>/restore/ — staff only."""

    permission_classes = [IsAdminUser]
    http_method_names = ['post', 'head', 'options']

    def post(self, request, product_id):
        product = get_object_or_404(
            Product.objects.select_related('seller'),
            pk=product_id,
        )
        product = restore_product(product=product)
        return Response(ModerationStateSerializer(_moderation_state(product)).data)
