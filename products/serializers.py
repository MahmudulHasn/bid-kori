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
            'is_hidden',
            'moderation_reason',
            'moderated_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'seller',
            'images',
            'is_hidden',
            'moderation_reason',
            'moderated_at',
            'created_at',
            'updated_at',
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        from .visibility import user_can_see_product_moderation_reason

        if not user_can_see_product_moderation_reason(user, instance):
            data.pop('moderation_reason', None)
            data.pop('moderated_at', None)
        return data


class ProductDescriptionGenerationSerializer(serializers.Serializer):
    """Multipart payload for AI draft description generation (no persistence)."""

    title = serializers.CharField(max_length=255, allow_blank=False, trim_whitespace=True)
    image = ProductImageUploadField(allow_empty_file=False)
    condition = serializers.ChoiceField(
        choices=Product.Condition.choices,
        required=False,
        allow_null=True,
    )
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        required=False,
        allow_null=True,
    )

    def to_internal_value(self, data):
        # Multipart may omit optional keys; treat blank condition as omitted.
        mutable = data
        if hasattr(data, 'copy'):
            mutable = data.copy()
        condition = mutable.get('condition')
        if condition in ('', None):
            mutable.pop('condition', None)
        category = mutable.get('category')
        if category in ('', None):
            mutable.pop('category', None)
        return super().to_internal_value(mutable)
