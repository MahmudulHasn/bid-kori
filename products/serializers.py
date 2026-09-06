from rest_framework import serializers

from .image_validation import (
    validate_product_image,
    validate_product_image_quota,
)
from .models import Category, Product, ProductImage


class CategorySerializer(serializers.ModelSerializer):
    """Serializes product categories."""

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug']


class ProductImageSerializer(serializers.ModelSerializer):
    """Serializes an uploaded Product catalog image."""

    class Meta:
        model = ProductImage
        fields = ['id', 'image', 'uploaded_at']
        read_only_fields = ['id', 'image', 'uploaded_at']


class ProductImageUploadField(serializers.FileField):
    """Upload field that validates image content via Pillow (not extension)."""

    def to_internal_value(self, data):
        file_obj = super().to_internal_value(data)
        validate_product_image(file_obj)
        return file_obj


class ProductImageUploadSerializer(serializers.Serializer):
    """Multipart payload for uploading one or more Product images."""

    images = serializers.ListField(
        child=ProductImageUploadField(allow_empty_file=False),
        help_text='One or more image files (multipart field name: images).',
    )

    def validate_images(self, images):
        product = self.context.get('product')
        try:
            validate_product_image_quota(
                product=product,
                incoming_count=len(images),
            )
        except Exception as exc:
            from django.core.exceptions import ValidationError as DjangoValidationError

            if isinstance(exc, DjangoValidationError):
                raise serializers.ValidationError(exc.messages) from exc
            raise
        return images


class ProductSerializer(serializers.ModelSerializer):
    """Serializes product catalog fields only (no auction pricing)."""

    images = ProductImageSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            'id',
            'seller',
            'category',
            'title',
            'description',
            'condition',
            'images',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['seller', 'images', 'created_at', 'updated_at']
