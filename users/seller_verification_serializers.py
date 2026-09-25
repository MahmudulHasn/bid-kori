"""Serializers for seller verification submit and admin review."""

from rest_framework import serializers

from .models import SellerVerification


class SellerVerificationSubmitSerializer(serializers.ModelSerializer):
    """Multipart form for sellers to submit verification documents."""

    class Meta:
        model = SellerVerification
        fields = ['nid_passport_image', 'whatsapp_number', 'location']

    def validate_whatsapp_number(self, value):
        cleaned = value.strip()
        if len(cleaned) < 10 or len(cleaned) > 20:
            raise serializers.ValidationError(
                'WhatsApp number must be between 10 and 20 characters.'
            )
        return cleaned

    def validate_location(self, value):
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise serializers.ValidationError(
                'Location must be at least 2 characters.'
            )
        return cleaned


class SellerVerificationStatusSerializer(serializers.ModelSerializer):
    """Read-only status response for sellers checking their verification."""

    submitted_at = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = SellerVerification
        fields = [
            'id',
            'status',
            'whatsapp_number',
            'location',
            'admin_note',
            'submitted_at',
            'reviewed_at',
        ]
        read_only_fields = fields


class AdminVerificationListSerializer(serializers.ModelSerializer):
    """Admin list view of verification requests."""

    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    submitted_at = serializers.DateTimeField(source='created_at', read_only=True)
    nid_passport_image = serializers.ImageField(read_only=True)

    class Meta:
        model = SellerVerification
        fields = [
            'id',
            'user_id',
            'username',
            'email',
            'whatsapp_number',
            'location',
            'status',
            'admin_note',
            'nid_passport_image',
            'submitted_at',
            'reviewed_at',
        ]
        read_only_fields = fields


class AdminVerificationRejectSerializer(serializers.Serializer):
    """Optional admin note when rejecting a verification."""

    admin_note = serializers.CharField(
        required=False,
        allow_blank=True,
        default='',
        max_length=1000,
    )
