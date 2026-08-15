from django.db import transaction
from rest_framework import serializers

from products.models import Product
from .models import Auction, Bid


class ProductSerializer(serializers.ModelSerializer):
    """Serializes the core details of a product listing."""

    class Meta:
        model = Product
        fields = ['id', 'title', 'description', 'condition', 'category']


class AuctionSerializer(serializers.ModelSerializer):
    """Serializes an auction with its nested product.

    Supports creating a product and its auction in a single request; the
    seller is taken from the authenticated request user.
    """

    product = ProductSerializer()

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
        ]
        read_only_fields = ['current_highest_bid', 'winning_bidder', 'status']

    def validate_starting_bid(self, value):
        if value <= 0:
            raise serializers.ValidationError('Starting bid must be greater than 0.')
        return value

    def validate_min_increment(self, value):
        if value <= 0:
            raise serializers.ValidationError('Minimum increment must be greater than 0.')
        return value

    def validate(self, attrs):
        start_time = attrs.get('start_time')
        end_time = attrs.get('end_time')

        if start_time is not None and end_time is not None and end_time <= start_time:
            raise serializers.ValidationError(
                {'end_time': 'End time must be after start time.'}
            )

        return attrs

    def create(self, validated_data):
        product_data = validated_data.pop('product')
        seller = validated_data.pop('seller', None) or self.context['request'].user

        validated_data['current_highest_bid'] = validated_data['starting_bid']

        with transaction.atomic():
            product = Product.objects.create(seller=seller, **product_data)
            auction = Auction.objects.create(product=product, **validated_data)

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
            'is_active',
            'recent_bids',
        ]
        read_only_fields = fields

    def get_is_active(self, obj):
        return obj.is_active()

    def get_recent_bids(self, obj):
        bids = obj.bids.select_related('bidder').all()[:5]
        return BidSerializer(bids, many=True, context=self.context).data
