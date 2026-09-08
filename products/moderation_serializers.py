"""Shared Admin moderation action serializers (MOD-B01)."""

from rest_framework import serializers

MODERATION_REASON_MAX_LENGTH = 500


class ModerationReasonSerializer(serializers.Serializer):
    """Optional reason body for Admin hide actions."""

    reason = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MODERATION_REASON_MAX_LENGTH,
        trim_whitespace=True,
        default='',
    )


class ModerationStateSerializer(serializers.Serializer):
    """Compact hide/restore response."""

    id = serializers.IntegerField()
    is_hidden = serializers.BooleanField()
    moderation_reason = serializers.CharField(allow_blank=True)
    moderated_at = serializers.DateTimeField(allow_null=True)
