"""Serializers for the BidKori support chatbot."""

from rest_framework import serializers

SUPPORT_CHAT_MESSAGE_MAX_LENGTH = 1500


class SupportChatSerializer(serializers.Serializer):
    """Stateless chat request with optional page pathname and client context."""

    message = serializers.CharField(
        required=True,
        allow_blank=False,
        trim_whitespace=True,
        max_length=SUPPORT_CHAT_MESSAGE_MAX_LENGTH,
    )
    pathname = serializers.CharField(
        required=False,
        allow_blank=True,
        default='',
        max_length=255,
    )
    context = serializers.DictField(
        required=False,
        default=dict,
    )

    def validate_message(self, value: str) -> str:
        cleaned = (value or '').strip()
        if not cleaned:
            raise serializers.ValidationError('Message cannot be empty.')
        return cleaned
