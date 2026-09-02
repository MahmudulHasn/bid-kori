from django.db import transaction
from rest_framework import serializers

from products.models import Product
from .models import Auction, AuctionImage, Bid, Payment


class ProductSerializer(serializers.ModelSerializer):
    """Serializes the core details of a product listing.

    ``seller`` is read-only so clients can determine ownership for UX;
    write paths still assign the seller from the authenticated user.
    """

    class Meta:
        model = Product
        fields = ['id', 'title', 'description', 'condition', 'category', 'seller']
        read_only_fields = ['id', 'seller']


class AuctionImageSerializer(serializers.ModelSerializer):
    """Serializes an uploaded auction listing image."""

    class Meta:
        model = AuctionImage
        fields = ['id', 'image', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_at']


class AuctionSerializer(serializers.ModelSerializer):
    """Serializes an auction with its nested product and images.

    Supports creating a product and its auction in a single request; the
    seller is taken from the authenticated request user. Optional multipart
    image uploads may be sent as ``images`` (one or more files).
    """

    product = ProductSerializer()
    images = AuctionImageSerializer(many=True, read_only=True)
    uploaded_images = serializers.ListField(
        child=serializers.ImageField(max_length=None, allow_empty_file=False),
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
            'images',
            'uploaded_images',
        ]
        read_only_fields = ['current_highest_bid', 'winning_bidder', 'status', 'is_paid']

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
        start_time = attrs.get('start_time')
        end_time = attrs.get('end_time')

        if start_time is not None and end_time is not None and end_time <= start_time:
            raise serializers.ValidationError(
                {'end_time': 'End time must be after start time.'}
            )

        return attrs

    def to_internal_value(self, data):
        """Accept nested product JSON or flat multipart title/description fields."""
        import json

        if hasattr(data, 'copy'):
            payload = data.copy()
        else:
            payload = dict(data)

        product = payload.get('product')
        if isinstance(product, str):
            try:
                payload['product'] = json.loads(product)
            except json.JSONDecodeError as exc:
                raise serializers.ValidationError(
                    {'product': 'Invalid product JSON payload.'}
                ) from exc
        elif not product and payload.get('title'):
            payload['product'] = {
                'title': payload.get('title'),
                'description': payload.get('description', ''),
                'condition': payload.get('condition') or Product.Condition.USED_GOOD,
            }

        return super().to_internal_value(payload)

    def _collect_uploaded_images(self, validated_data):
        """Return image files from validated data and/or multipart FILES."""
        images = list(validated_data.pop('uploaded_images', []) or [])
        request = self.context.get('request')
        if request is not None:
            # Clients commonly use the field name ``images`` in multipart forms.
            for key in ('images', 'image', 'uploaded_images'):
                for uploaded in request.FILES.getlist(key):
                    if uploaded not in images:
                        images.append(uploaded)
        return images

    def create(self, validated_data):
        product_data = validated_data.pop('product')
        seller = validated_data.pop('seller', None) or self.context['request'].user
        uploaded_images = self._collect_uploaded_images(validated_data)

        validated_data['current_highest_bid'] = validated_data['starting_bid']

        with transaction.atomic():
            product = Product.objects.create(seller=seller, **product_data)
            auction = Auction.objects.create(product=product, **validated_data)
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
        child=serializers.ImageField(),
        help_text='One or more image files (multipart field name: images).',
    )


class TransitionStatusSerializer(serializers.Serializer):
    """Request body for auction status transitions."""

    status = serializers.ChoiceField(choices=Auction.Status.choices)


class PaymentSerializer(serializers.ModelSerializer):
    """Serializes a mock checkout payment for an auction winner."""

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
