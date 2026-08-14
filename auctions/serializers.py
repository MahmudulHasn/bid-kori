from django.db import transaction
from rest_framework import serializers

from products.models import Product
from .models import Auction


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
            'status',
            'is_featured',
        ]
        read_only_fields = ['current_highest_bid', 'status']

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
        seller = self.context['request'].user

        validated_data['current_highest_bid'] = validated_data['starting_bid']

        with transaction.atomic():
            product = Product.objects.create(seller=seller, **product_data)
            auction = Auction.objects.create(product=product, **validated_data)

        return auction
