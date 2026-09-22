import re
from rest_framework import serializers

from .models import WinnerFulfillmentDetails

# Bangladesh phone regex: allows optional +88 or +880 prefix, followed by 013-019 and 8 digits
BD_PHONE_REGEX = re.compile(r'^(\+?880|0)?1[3-9]\d{8}$')


def normalize_bd_phone(value: str) -> str:
    """Normalize whitespace and hyphens from phone number and validate Bangladesh mobile pattern."""
    if not value:
        return ''
    cleaned = re.sub(r'[\s\-()]', '', value)
    if not BD_PHONE_REGEX.match(cleaned):
        raise serializers.ValidationError(
            'Enter a valid Bangladeshi phone number (e.g. 017XXXXXXXX or +88017XXXXXXXX).'
        )
    # Ensure consistent presentation starting with 01 or +8801
    if cleaned.startswith('880'):
        cleaned = '+' + cleaned
    return cleaned


class WinnerFulfillmentDetailsSerializer(serializers.ModelSerializer):
    """Full representation of winner fulfillment details for the winning buyer."""

    auction_id = serializers.IntegerField(source='auction.pk', read_only=True)
    buyer_id = serializers.IntegerField(source='buyer.pk', read_only=True)
    buyer_username = serializers.CharField(source='buyer.username', read_only=True)

    class Meta:
        model = WinnerFulfillmentDetails
        fields = [
            'id',
            'auction_id',
            'buyer_id',
            'buyer_username',
            'full_name',
            'phone',
            'email',
            'address_line',
            'area',
            'district',
            'division',
            'postal_code',
            'preferred_contact_method',
            'delivery_note',
            'status',
            'completed_step',
            'submitted_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class WinnerFulfillmentDraftSerializer(serializers.ModelSerializer):
    """Serializer for saving incremental draft progress across steps.

    Permits partial step data while strictly forbidding mass assignment of
    server-controlled fields (auction, buyer, status, submitted_at).
    """

    class Meta:
        model = WinnerFulfillmentDetails
        fields = [
            'full_name',
            'phone',
            'email',
            'address_line',
            'area',
            'district',
            'division',
            'postal_code',
            'preferred_contact_method',
            'delivery_note',
            'completed_step',
        ]

    def validate_phone(self, value):
        if not value:
            return ''
        return normalize_bd_phone(value)

    def validate_completed_step(self, value):
        if value < 0 or value > 3:
            raise serializers.ValidationError('Draft completed_step must be between 0 and 3.')
        return value

    def validate_delivery_note(self, value):
        if value and len(value) > 500:
            raise serializers.ValidationError('Delivery note cannot exceed 500 characters.')
        return value


class WinnerFulfillmentSubmitSerializer(serializers.Serializer):
    """Strict validation of all required fulfillment fields upon final submission."""

    full_name = serializers.CharField(max_length=150, min_length=2, required=True)
    phone = serializers.CharField(max_length=32, required=True)
    email = serializers.EmailField(max_length=254, required=False, allow_blank=True, default='')
    address_line = serializers.CharField(max_length=255, min_length=5, required=True)
    area = serializers.CharField(max_length=100, min_length=2, required=True)
    district = serializers.CharField(max_length=100, min_length=2, required=True)
    division = serializers.CharField(max_length=100, min_length=2, required=True)
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    preferred_contact_method = serializers.ChoiceField(
        choices=WinnerFulfillmentDetails.ContactMethod.choices,
        required=True,
    )
    delivery_note = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
        default='',
    )

    def validate_phone(self, value):
        return normalize_bd_phone(value)

    def validate(self, attrs):
        preferred = attrs.get('preferred_contact_method')
        email = attrs.get('email', '')
        if preferred == WinnerFulfillmentDetails.ContactMethod.EMAIL:
            if not email or not email.strip():
                raise serializers.ValidationError({
                    'email': 'Email is required when preferred contact method is Email.'
                })
        return attrs
