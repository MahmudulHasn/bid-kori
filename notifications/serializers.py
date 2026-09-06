from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    """Read-oriented notification payload for the authenticated inbox."""

    class Meta:
        model = Notification
        fields = (
            'id',
            'type',
            'title',
            'message',
            'auction_id',
            'is_read',
            'created_at',
        )
        read_only_fields = fields
