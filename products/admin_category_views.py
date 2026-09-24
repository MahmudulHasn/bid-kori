"""Admin Category Management Views (IsAdminUser).

Provides full CRUD capabilities for marketplace categories for staff administrators.
"""

from __future__ import annotations

from django.db.models import Count
from django.utils.text import slugify
from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from .models import Category


class AdminCategorySerializer(serializers.ModelSerializer):
    slug = serializers.CharField(required=False, allow_blank=True)
    product_count = serializers.IntegerField(read_only=True, default=0)
    image = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'image', 'product_count']
        read_only_fields = ['id', 'product_count']

    def validate_name(self, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise serializers.ValidationError('Category name cannot be blank.')
        return trimmed

    def create(self, validated_data):
        name = validated_data['name']
        slug = validated_data.get('slug')
        if not slug:
            base_slug = slugify(name) or 'category'
            slug = base_slug
            counter = 1
            while Category.objects.filter(slug=slug).exists():
                slug = f'{base_slug}-{counter}'
                counter += 1
            validated_data['slug'] = slug
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if 'image' in validated_data:
            old_image = instance.image
            new_image = validated_data['image']
            if old_image and old_image != new_image:
                storage = getattr(old_image, 'storage', None)
                name = getattr(old_image, 'name', '')
                if storage and name:
                    try:
                        storage.delete(name)
                    except Exception:
                        pass
        return super().update(instance, validated_data)


class AdminCategoryListCreateView(generics.ListCreateAPIView):
    """List all categories with product counts, or create a new category (staff only)."""

    permission_classes = [IsAdminUser]
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    serializer_class = AdminCategorySerializer

    def get_queryset(self):
        return Category.objects.annotate(product_count=Count('products')).order_by('name', 'id')

    @extend_schema(
        tags=['Admin Categories'],
        summary='List categories with product counts (staff only)',
        responses={200: AdminCategorySerializer(many=True)},
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(
        tags=['Admin Categories'],
        summary='Create new category (staff only)',
        request=AdminCategorySerializer,
        responses={201: AdminCategorySerializer},
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class AdminCategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or delete a single category (staff only)."""

    permission_classes = [IsAdminUser]
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    serializer_class = AdminCategorySerializer
    lookup_url_kwarg = 'category_id'

    def get_queryset(self):
        return Category.objects.annotate(product_count=Count('products')).all()

    @extend_schema(
        tags=['Admin Categories'],
        summary='Retrieve category details (staff only)',
        responses={200: AdminCategorySerializer},
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(
        tags=['Admin Categories'],
        summary='Update category (staff only)',
        request=AdminCategorySerializer,
        responses={200: AdminCategorySerializer},
    )
    def patch(self, request, *args, **kwargs):
        return super().patch(request, *args, **kwargs)

    @extend_schema(
        tags=['Admin Categories'],
        summary='Delete category (staff only)',
        responses={204: None},
    )
    def delete(self, request, *args, **kwargs):
        category = self.get_object()
        category_name = category.name
        category.delete()
        return Response(
            {'message': f'Category "{category_name}" was successfully deleted.'},
            status=status.HTTP_200_OK,
        )
