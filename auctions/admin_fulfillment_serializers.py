"""Admin fulfillment audit serializers (ADMIN-W01).

Dedicated read-only serializers for staff fulfillment visibility.
Explicitly excludes all Buyer PII (phone, email, address, delivery_note).
Never reuses Buyer or Seller winner-details serializers.
"""

from rest_framework import serializers


class AdminFulfillmentListSerializer(serializers.Serializer):
    """Safe metadata-only list row for Admin fulfillment audit table.

    Explicitly EXCLUDES: phone, email, full_name, address_line, area,
    district, division, postal_code, delivery_note.
    """

    auction_id = serializers.IntegerField()
    auction_title = serializers.CharField()
    product_title = serializers.CharField()
    seller_id = serializers.IntegerField()
    seller_username = serializers.CharField()
    winner_id = serializers.IntegerField(allow_null=True)
    winner_username = serializers.CharField(allow_null=True)
    fulfillment_status = serializers.CharField()
    unlock_status = serializers.CharField(allow_null=True)
    unlock_fee = serializers.CharField(allow_null=True)
    currency = serializers.CharField(allow_null=True)
    submitted_at = serializers.DateTimeField(allow_null=True)
    unlocked_at = serializers.DateTimeField(allow_null=True)
    updated_at = serializers.DateTimeField(allow_null=True)
    integrity_status = serializers.CharField()


class AdminFulfillmentDetailSerializer(serializers.Serializer):
    """Safe metadata-only detail for a single fulfillment audit record.

    Extends list fields with unlock payment details, integrity findings,
    and notification audit metadata. Still EXCLUDES all Buyer PII.
    """

    # Auction identity
    auction_id = serializers.IntegerField()
    auction_title = serializers.CharField()
    auction_status = serializers.CharField()
    product_title = serializers.CharField()

    # Seller
    seller_id = serializers.IntegerField()
    seller_username = serializers.CharField()

    # Winner (username only — no PII)
    winner_id = serializers.IntegerField(allow_null=True)
    winner_username = serializers.CharField(allow_null=True)

    # Fulfillment lifecycle metadata
    fulfillment_id = serializers.IntegerField(allow_null=True)
    fulfillment_status = serializers.CharField()
    completed_step = serializers.IntegerField(allow_null=True)
    submitted_at = serializers.DateTimeField(allow_null=True)
    fulfillment_created_at = serializers.DateTimeField(allow_null=True)
    fulfillment_updated_at = serializers.DateTimeField(allow_null=True)

    # Unlock record metadata
    unlock_id = serializers.IntegerField(allow_null=True)
    unlock_status = serializers.CharField(allow_null=True)
    fee_amount = serializers.CharField(allow_null=True)
    currency = serializers.CharField(allow_null=True)
    payment_reference = serializers.CharField(allow_null=True)
    payment_method = serializers.CharField(allow_null=True, required=False)
    val_id = serializers.CharField(allow_null=True, required=False)
    bank_tran_id = serializers.CharField(allow_null=True, required=False)
    card_type = serializers.CharField(allow_null=True, required=False)
    paid_at = serializers.DateTimeField(allow_null=True)
    unlocked_at = serializers.DateTimeField(allow_null=True)

    # Integrity
    integrity_status = serializers.CharField()
    integrity_issues = serializers.ListField(
        child=serializers.CharField(), allow_empty=True,
    )

    # Notification audit
    notification_audit = serializers.DictField(allow_null=True)


class AdminFulfillmentSummarySerializer(serializers.Serializer):
    """Aggregate fulfillment counts and unlock revenue for Admin summary cards."""

    total_requiring_fulfillment = serializers.IntegerField()
    not_started = serializers.IntegerField()
    draft = serializers.IntegerField()
    completed_locked = serializers.IntegerField()
    unlocked = serializers.IntegerField()
    unlock_revenue = serializers.CharField()
    unlock_count = serializers.IntegerField()
    recent_unlocks_7d = serializers.IntegerField()
    disclosure = serializers.CharField()
