"""
Private per-user notification push helpers (Channels).

Persistent Notification rows remain the source of truth. Push is best-effort
delivery after a row exists; failures never delete or roll back rows.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

if TYPE_CHECKING:
    from .models import Notification

logger = logging.getLogger(__name__)

NOTIFICATION_CREATED_EVENT = 'notification.created'


def user_notification_group_name(user_id: int | str) -> str:
    """Deterministic private Channels group for one user's inbox stream."""
    return f'user_{int(user_id)}'


def build_notification_created_payload(notification: Notification) -> dict:
    """Public-safe notification.created payload (matches REST serializer fields)."""
    created_at = ''
    if getattr(notification, 'created_at', None) is not None:
        created_at = notification.created_at.isoformat()
    return {
        'type': NOTIFICATION_CREATED_EVENT,
        'notification': {
            'id': notification.pk,
            'type': notification.type,
            'title': notification.title,
            'message': notification.message,
            'auction_id': notification.auction_id,
            'is_read': bool(notification.is_read),
            'created_at': created_at,
        },
    }


def broadcast_notification_created(notification: Notification) -> None:
    """Send notification.created to the recipient's private group. Never raises."""
    user_id = getattr(notification, 'user_id', None)
    if user_id is None:
        logger.warning('notification.created broadcast skipped: missing user_id')
        return
    if getattr(notification, 'pk', None) is None:
        logger.warning(
            'notification.created broadcast skipped: missing notification pk '
            'user_id=%s',
            user_id,
        )
        return

    channel_layer = get_channel_layer()
    if channel_layer is None:
        logger.warning(
            'notification.created broadcast skipped: CHANNEL_LAYERS is not configured'
        )
        return

    payload = build_notification_created_payload(notification)
    group = user_notification_group_name(user_id)
    try:
        async_to_sync(channel_layer.group_send)(
            group,
            {
                # Consumer method: notification_created
                'type': 'notification.created',
                'payload': payload,
            },
        )
    except Exception:
        # Row already persisted — push failure must not affect authority.
        logger.exception(
            'Failed to broadcast notification.created notification_id=%s user_id=%s',
            notification.pk,
            user_id,
        )
