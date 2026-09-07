"""Serializers for the BidKori support chatbot."""

from rest_framework import serializers

SUPPORT_CHAT_MESSAGE_MAX_LENGTH = 1500


class SupportChatSerializer(serializers.Serializer):
    """Stateless chat request — only ``message`` is accepted as input data."""

    message = serializers.CharField(
        required=True,
        allow_blank=False,
        trim_whitespace=True,
        max_length=SUPPORT_CHAT_MESSAGE_MAX_LENGTH,
    )

    def validate_message(self, value: str) -> str:
        cleaned = (value or '').strip()
        if not cleaned:
            raise serializers.ValidationError('Message cannot be empty.')
        return cleaned
