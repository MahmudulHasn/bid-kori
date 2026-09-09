from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers

from config.db_locking import apply_select_for_update
from products.models import Product
from users.models import resolve_user_role
from .image_validation import (
    validate_auction_image,
    validate_auction_image_quota,
)
from .models import Auction, AuctionImage, Bid, Payment
from .mutation_policy import (
    CONFIGURATION_EDIT_FROZEN_MESSAGE,
    PROTECTED_CONFIGURATION_FIELDS,
    AuctionMutationPolicy,
)

class ProductSerializer(serializers.ModelSerializer):
    """Serializes the core details of a product listing.

    ``seller`` is read-only so clients can determine ownership for UX;
    write paths still assign the seller from the authenticated user.
    """

    class Meta:
        model = Product
        fields = ['id', 'title', 'description', 'condition', 'category', 'seller']
        read_only_fields = ['id', 'seller']


class AuctionImageField(serializers.FileField):
    """Upload field that validates image *content* via Pillow (not extension)."""

    def to_internal_value(self, data):
        file_obj = super().to_internal_value(data)
        try:
            validate_auction_image(file_obj)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        return file_obj


class AuctionImageSerializer(serializers.ModelSerializer):
    """Serializes an uploaded auction listing image."""

    class Meta:
        model = AuctionImage
        fields = ['id', 'image', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_at']


class AuctionSerializer(serializers.ModelSerializer):
    """Serializes an auction with nested product (read) and dual create modes.

    Create accepts either:

    * ``product`` as an existing Product primary key (Seller flow), or
    * ``product`` as a nested object / legacy flat title fields (legacy create).

    Existing-product create does not create or mutate Product rows.
    """

    product = ProductSerializer(read_only=True)
    images = AuctionImageSerializer(many=True, read_only=True)
    uploaded_images = serializers.ListField(
        child=AuctionImageField(max_length=None, allow_empty_file=False),
        write_only=True,
        required=False,
        help_text='One or more image files (multipart/form-data field name: images).',
    )

    # Write-only: sellers may set a reserve on create/update, but the value is
    # not returned on public auction payloads (avoids informing bidders).
    reserve_price = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        allow_null=True,
        write_only=True,
    )

    # Response-only clock for client countdown offset (RT-B03). Not a model field.
    server_time = serializers.SerializerMethodField(
        help_text=(
            'Authoritative server timestamp (timezone-aware ISO-8601) at '
            'response generation. Use with end_time for countdown sync; '
            'not writable and not persisted.'
        ),
    )

    class Meta:
        model = Auction
        fields = [
            'id',
            'product',
            'starting_bid',
            'current_highest_bid',
            'min_increment',
            'reserve_price',
            'start_time',
            'end_time',
            'winning_bidder',
            'status',
            'is_featured',
            'is_paid',
            'is_hidden',
            'moderation_reason',
            'moderated_at',
            'images',
            'uploaded_images',
            'server_time',
        ]
        read_only_fields = [
            'current_highest_bid',
            'winning_bidder',
            'status',
            'is_paid',
            # Featured placement is a platform capability (Django admin / staff).
            'is_featured',
            'is_hidden',
            'moderation_reason',
            'moderated_at',
            'server_time',
        ]

    def get_server_time(self, obj):
        """Return timezone.now() at serialization — zero DB work."""
        return timezone.now()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        from .visibility import user_can_see_auction_moderation_reason

        if not user_can_see_auction_moderation_reason(user, instance):
            data.pop('moderation_reason', None)
            data.pop('moderated_at', None)
        return data

    def validate_starting_bid(self, value):
        if value <= 0:
            raise serializers.ValidationError('Starting bid must be greater than 0.')
        return value

    def validate_min_increment(self, value):
        if value <= 0:
            raise serializers.ValidationError('Minimum increment must be greater than 0.')
        return value

    def validate_reserve_price(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError(
                'Reserve price must be greater than 0 when provided.'
            )
        return value

    def validate(self, attrs):
        if self.instance is not None:
            mutating_protected = bool(
                PROTECTED_CONFIGURATION_FIELDS.intersection(attrs.keys())
            )
            uploaded = attrs.get('uploaded_images')
            if uploaded:
                mutating_protected = True
            if mutating_protected and not AuctionMutationPolicy.is_configuration_mutable(
                self.instance
            ):
                raise serializers.ValidationError(CONFIGURATION_EDIT_FROZEN_MESSAGE)

        start_time = attrs.get('start_time')
        end_time = attrs.get('end_time')

        if self.instance is not None:
            # Partial update: combine incoming times with the stored schedule.
            if start_time is None:
                start_time = self.instance.start_time
            if end_time is None:
                end_time = self.instance.end_time

        if start_time is not None and end_time is not None and end_time <= start_time:
            raise serializers.ValidationError(
                {'end_time': 'End time must be after start time.'}
            )

        return attrs

    def _normalize_product_input(self, payload):
        """Return product input (dict | int | None) and mutate payload for legacy flat fields."""
        import json

        product = payload.get('product', serializers.empty)
        if product is serializers.empty and payload.get('product_id', serializers.empty) is not serializers.empty:
            product = payload.get('product_id')
            payload.pop('product_id', None)

        if product is serializers.empty and payload.get('title'):
            product = {
                'title': payload.get('title'),
                'description': payload.get('description', ''),
                'condition': payload.get('condition') or Product.Condition.USED_GOOD,
            }

        if isinstance(product, str):
            stripped = product.strip()
            if stripped.startswith('{'):
                try:
                    product = json.loads(product)
                except json.JSONDecodeError as exc:
                    raise serializers.ValidationError(
                        {'product': 'Invalid product JSON payload.'}
                    ) from exc
            elif stripped.isdigit():
                product = int(stripped)
            else:
                try:
                    product = json.loads(product)
                except json.JSONDecodeError as exc:
                    raise serializers.ValidationError(
                        {'product': 'Invalid product JSON payload.'}
                    ) from exc

        return product if product is not serializers.empty else None

    def _resolve_existing_product(self, product_pk):
        try:
            pk = int(product_pk)
        except (TypeError, ValueError):
            raise serializers.ValidationError({'product': 'Product not found.'}) from None

        try:
            product = Product.objects.select_related('seller').get(pk=pk)
        except Product.DoesNotExist:
            raise serializers.ValidationError({'product': 'Product not found.'}) from None

        request = self.context.get('request')
        user = getattr(request, 'user', None)
        role = resolve_user_role(user) if user is not None else None

        if role != 'ADMIN':
            if user is None or not user.is_authenticated or product.seller_id != user.id:
                raise serializers.ValidationError(
                    {
                        'product': (
                            'You do not have permission to create an auction '
                            'for this product.'
                        ),
                    }
                )

        if Auction.objects.filter(product_id=product.pk).exists():
            raise serializers.ValidationError(
                {'product': 'This product already has an auction.'}
            )

        return product

    def to_internal_value(self, data):
        """Accept existing Product PK or nested/legacy product payloads on create.

        Updates (PATCH/PUT) do not rebind ``product`` and must not require it.
        """
        if hasattr(data, 'copy'):
            payload = data.copy()
        else:
            payload = dict(data)

        product_input = self._normalize_product_input(payload)
        payload.pop('product', None)
        payload.pop('product_id', None)

        ret = super().to_internal_value(payload)

        # Product binding is create-only.
        if self.instance is not None:
            if product_input is not None:
                raise serializers.ValidationError(
                    {'product': 'Product cannot be changed after auction creation.'}
                )
            return ret

        if product_input is None:
            raise serializers.ValidationError({'product': 'This field is required.'})

        if isinstance(product_input, dict):
            nested = ProductSerializer(data=product_input)
            nested.is_valid(raise_exception=True)
            ret['_existing_product'] = None
            ret['_nested_product_data'] = nested.validated_data
        else:
            ret['_existing_product'] = self._resolve_existing_product(product_input)
            ret['_nested_product_data'] = None

        return ret

    def _collect_uploaded_images(self, validated_data):
        """Return image files from validated data and/or multipart FILES."""
        images = list(validated_data.pop('uploaded_images', []) or [])
        request = self.context.get('request')
        if request is not None:
            # Clients commonly use the field name ``images`` in multipart forms.
            for key in ('images', 'image', 'uploaded_images'):
                for uploaded in request.FILES.getlist(key):
                    if uploaded not in images:
                        try:
                            validate_auction_image(uploaded)
                        except DjangoValidationError as exc:
                            raise serializers.ValidationError(
                                {'images': exc.messages}
                            ) from exc
                        images.append(uploaded)

        if images:
            try:
                validate_auction_image_quota(auction=None, incoming_count=len(images))
            except DjangoValidationError as exc:
                raise serializers.ValidationError({'images': exc.messages}) from exc
        return images

    def create(self, validated_data):
        nested_product_data = validated_data.pop('_nested_product_data', None)
        existing_product = validated_data.pop('_existing_product', None)
        seller = validated_data.pop('seller', None) or self.context['request'].user
        uploaded_images = self._collect_uploaded_images(validated_data)

        validated_data['current_highest_bid'] = validated_data['starting_bid']
        # Defensive: never trust client-supplied lifecycle/payment fields.
        validated_data.pop('winning_bidder', None)
        validated_data.pop('status', None)
        validated_data.pop('is_paid', None)
        validated_data.pop('is_featured', None)
        validated_data.pop('is_hidden', None)
        validated_data.pop('moderation_reason', None)
        validated_data.pop('moderated_at', None)
        validated_data.pop('moderated_by', None)

        with transaction.atomic():
            if existing_product is not None:
                product = apply_select_for_update(
                    Product.objects.select_related('seller')
                ).get(pk=existing_product.pk)
                if Auction.objects.filter(product_id=product.pk).exists():
                    raise serializers.ValidationError(
                        {'product': 'This product already has an auction.'}
                    )
            else:
                product = Product.objects.create(seller=seller, **nested_product_data)

            try:
                auction = Auction.objects.create(product=product, **validated_data)
            except IntegrityError as exc:
                raise serializers.ValidationError(
                    {'product': 'This product already has an auction.'}
                ) from exc

            for image_file in uploaded_images:
                AuctionImage.objects.create(auction=auction, image=image_file)

        return auction

    def update(self, instance, validated_data):
        """Apply configuration updates only while the mutation freeze allows it."""
        uploaded_images = self._collect_uploaded_images(validated_data)
        # Never trust client-supplied lifecycle/payment fields on update.
        validated_data.pop('winning_bidder', None)
        validated_data.pop('status', None)
        validated_data.pop('is_paid', None)
        validated_data.pop('is_featured', None)
        validated_data.pop('is_hidden', None)
        validated_data.pop('moderation_reason', None)
        validated_data.pop('moderated_at', None)
        validated_data.pop('moderated_by', None)
        validated_data.pop('_existing_product', None)
        validated_data.pop('_nested_product_data', None)
        validated_data.pop('seller', None)

        with transaction.atomic():
            auction = AuctionMutationPolicy.lock_auction(instance.pk)
            mutating = bool(validated_data) or bool(uploaded_images)
            if mutating and not AuctionMutationPolicy.is_configuration_mutable(auction):
                raise serializers.ValidationError(CONFIGURATION_EDIT_FROZEN_MESSAGE)

            if uploaded_images:
                try:
                    validate_auction_image_quota(
                        auction=auction,
                        incoming_count=len(uploaded_images),
                    )
                except DjangoValidationError as exc:
                    raise serializers.ValidationError({'images': exc.messages}) from exc

            for attr, value in validated_data.items():
                setattr(auction, attr, value)
            if validated_data:
                auction.save(update_fields=list(validated_data.keys()))

            for image_file in uploaded_images:
                AuctionImage.objects.create(auction=auction, image=image_file)

        return auction


class BidSerializer(serializers.ModelSerializer):
    """Serializes a bid for frontend display."""

    bidder_username = serializers.ReadOnlyField(source='bidder.username')

    class Meta:
        model = Bid
        fields = ['id', 'auction', 'bidder_username', 'amount', 'timestamp']
        read_only_fields = ['id', 'auction', 'bidder_username', 'timestamp']

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Bid amount must be greater than 0.')
        return value


class PlaceBidRequestSerializer(serializers.Serializer):
    """Request body for placing a bid on an auction."""

    amount = serializers.DecimalField(max_digits=10, decimal_places=2)


class ErrorMessageSerializer(serializers.Serializer):
    """Generic error payload used by custom API views."""

    error = serializers.CharField(required=False)
    detail = serializers.CharField(required=False)


class AuctionImageUploadSerializer(serializers.Serializer):
    """Multipart payload for uploading one or more auction images."""

    images = serializers.ListField(
        child=AuctionImageField(allow_empty_file=False),
        help_text='One or more image files (multipart field name: images).',
        allow_empty=False,
    )

    def validate_images(self, images):
        auction = self.context.get('auction')
        try:
            validate_auction_image_quota(
                auction=auction,
                incoming_count=len(images),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        return images


class TransitionStatusSerializer(serializers.Serializer):
    """Request body for auction status transitions."""

    status = serializers.ChoiceField(choices=Auction.Status.choices)


class PaymentSerializer(serializers.ModelSerializer):
    """Buyer-facing mock checkout payment (winner-private response).

    Omits seller-side fee snapshots (``fee_rate``, ``platform_fee``,
    ``seller_net_amount``). Those columns remain on the Payment model for
    Seller/Admin financial APIs (MON-F01) and must never be
    recalculated from live settings during serialization.
    """

    class Meta:
        model = Payment
        fields = [
            'id',
            'auction',
            'user',
            'amount',
            'status',
            'transaction_id',
            'created_at',
        ]
        read_only_fields = fields


class SellerSaleSerializer(serializers.Serializer):
    """One completed mock checkout sale owned by the requesting Seller."""

    payment_id = serializers.IntegerField(read_only=True)
    auction_id = serializers.IntegerField(read_only=True)
    auction_title = serializers.CharField(read_only=True)
    buyer_username = serializers.CharField(read_only=True)
    amount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        read_only=True,
        coerce_to_string=True,
    )
    fee_rate = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        read_only=True,
        allow_null=True,
        coerce_to_string=True,
    )
    platform_fee = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        read_only=True,
        allow_null=True,
        coerce_to_string=True,
    )
    seller_net_amount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        read_only=True,
        allow_null=True,
        coerce_to_string=True,
    )
    status = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    has_fee_snapshot = serializers.BooleanField(read_only=True)


class SellerEarningsSerializer(serializers.Serializer):
    """Exact Seller earnings aggregates (mock checkout ledger)."""

    completed_sales_count = serializers.IntegerField(read_only=True)
    gross_sales = serializers.CharField(read_only=True)
    platform_fees = serializers.CharField(read_only=True)
    net_earnings = serializers.CharField(read_only=True)
    accounted_sales_count = serializers.IntegerField(read_only=True)
    legacy_completed_sales_count = serializers.IntegerField(read_only=True)
    legacy_gross_sales = serializers.CharField(read_only=True)
    disclosure = serializers.CharField(read_only=True)


class AdminFinancialSummarySerializer(serializers.Serializer):
    """Exact platform financial aggregates (mock checkout ledger)."""

    completed_sales_count = serializers.IntegerField(read_only=True)
    gross_paid_volume = serializers.CharField(read_only=True)
    platform_revenue = serializers.CharField(read_only=True)
    seller_net_total = serializers.CharField(read_only=True)
    accounted_sales_count = serializers.IntegerField(read_only=True)
    legacy_completed_sales_count = serializers.IntegerField(read_only=True)
    legacy_gross_paid_volume = serializers.CharField(read_only=True)
    disclosure = serializers.CharField(read_only=True)


class AuctionDetailSerializer(serializers.ModelSerializer):
    """Detailed auction payload including product labels and recent bids."""

    product_title = serializers.ReadOnlyField(source='product.title')
    winning_bidder_username = serializers.CharField(
        source='winning_bidder.username',
        read_only=True,
        allow_null=True,
        default=None,
    )
    is_active = serializers.SerializerMethodField()
    recent_bids = serializers.SerializerMethodField()
    images = AuctionImageSerializer(many=True, read_only=True)

    class Meta:
        model = Auction
        fields = [
            'id',
            'product',
            'product_title',
            'start_time',
            'end_time',
            'current_highest_bid',
            'winning_bidder_username',
            'status',
            'is_paid',
            'is_hidden',
            'is_active',
            'recent_bids',
            'images',
        ]
        read_only_fields = fields

    def get_is_active(self, obj):
        return obj.is_active()

    def get_recent_bids(self, obj):
        bids = obj.bids.select_related('bidder').all()[:5]
        return BidSerializer(bids, many=True, context=self.context).data
