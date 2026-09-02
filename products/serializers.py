from rest_framework import serializers

from .models import Category, Product


class CategorySerializer(serializers.ModelSerializer):
    """Serializes product categories."""

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug']


class ProductSerializer(serializers.ModelSerializer):
    """Serializes product catalog fields only (no auction pricing)."""

    class Meta:
        model = Product
        fields = [
            'id',
            'seller',
            'category',
            'title',
            'description',
            'condition',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['seller', 'created_at', 'updated_at']
