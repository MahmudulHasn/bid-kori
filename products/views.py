from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import (
    AllowAny,
    IsAuthenticated,
    IsAuthenticatedOrReadOnly,
)
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from .deletion_policy import (
    PRODUCT_DELETE_BLOCKED_MESSAGE,
    ProductDeletionPolicy,
)
from .models import Category, Product, ProductImage
from .mutation_policy import (
    PRODUCT_EDIT_FROZEN_MESSAGE,
    PRODUCT_IMAGE_FROZEN_MESSAGE,
    ProductMutationPolicy,
)
from .permissions import IsSellerOrAdminForProductCreate, IsSellerOrReadOnly
from .serializers import (
    CategorySerializer,
    ProductImageSerializer,
    ProductImageUploadSerializer,
    ProductSerializer,
)


class CategoryListView(generics.ListAPIView):
    """Public read-only Category catalog for Seller/Buyer/marketplace UIs.

    Returns an unpaginated list (same shape as ``GET /api/products/``) ordered
    by ``name``, then ``id``. Mutations are intentionally unavailable — Admin
    Category CRUD is a later phase.
    """

    queryset = Category.objects.all().order_by('name', 'id')
    serializer_class = CategorySerializer
    permission_classes = [AllowAny]
    pagination_class = None
    http_method_names = ['get', 'head', 'options']


class CategoryDetailView(generics.RetrieveAPIView):
    """Public read-only Category detail by primary key."""

    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [AllowAny]
    http_method_names = ['get', 'head', 'options']


class ProductListCreateView(generics.ListCreateAPIView):
    """List all products or create a new one for the authenticated seller/admin.

    Product payloads contain catalog fields only (title, description, condition,
    category). Auction pricing belongs on ``Auction.starting_bid`` /
    ``Auction.current_highest_bid`` via ``POST /api/auctions/``.

    BUYER tokens receive 403 on create. Nested Product creation inside Auction
    create serializers is unaffected by this view-level gate.
    """

    queryset = (
        Product.objects.select_related('category', 'seller')
        .prefetch_related('images')
        .all()
    )
    serializer_class = ProductSerializer
    permission_classes = [
        IsAuthenticatedOrReadOnly,
        IsSellerOrAdminForProductCreate,
        IsSellerOrReadOnly,
    ]

    def perform_create(self, serializer):
        serializer.save(seller=self.request.user)

    def permission_denied(self, request, message=None, code=None):
        if not request.user or not request.user.is_authenticated:
            return super().permission_denied(request, message=message, code=code)
        default = (
            IsSellerOrAdminForProductCreate.message
            if request.method == 'POST'
            else IsSellerOrReadOnly.message
        )
        raise PermissionDenied(
            detail={
                'error': message or default,
            }
        )


# Alias matching Samira's ProductListView naming for the list/create endpoint.
ProductListView = ProductListCreateView


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or delete a single product by its primary key.

    PUT, PATCH, and DELETE are restricted to the product seller via
    IsSellerOrReadOnly. UPDATE is blocked when a linked Auction is frozen by
    ``AuctionMutationPolicy`` (started, has bids, or CLOSED/CANCELLED) for all
    roles including ADMIN. DELETE is blocked when any Auction is linked.
    """

    queryset = (
        Product.objects.select_related('category', 'seller')
        .prefetch_related('images')
        .all()
    )
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsSellerOrReadOnly]

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        with transaction.atomic():
            instance = self.get_object()
            locked = ProductMutationPolicy.lock_product_for_mutation(instance.pk)
            if not ProductMutationPolicy.can_edit(locked):
                return Response(
                    {'error': PRODUCT_EDIT_FROZEN_MESSAGE},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            serializer = self.get_serializer(
                locked,
                data=request.data,
                partial=partial,
            )
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            instance = self.get_object()
            locked = ProductDeletionPolicy.lock_product(instance.pk)
            if not ProductDeletionPolicy.can_delete(locked):
                return Response(
                    {'error': PRODUCT_DELETE_BLOCKED_MESSAGE},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            self.perform_destroy(locked)
            return Response(status=status.HTTP_204_NO_CONTENT)

    def permission_denied(self, request, message=None, code=None):
        if not request.user or not request.user.is_authenticated:
            return super().permission_denied(request, message=message, code=code)
        raise PermissionDenied(
            detail={
                'error': message or IsSellerOrReadOnly.message,
            }
        )


class UserListingsView(generics.ListAPIView):
    """Return all products listed by the authenticated user."""

    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Product.objects.select_related('category', 'seller')
            .prefetch_related('images')
            .filter(seller=self.request.user)
        )


class ProductImageListCreateView(APIView):
    """List Product images (public) or upload images (owner, unfrozen only)."""

    parser_classes = (MultiPartParser, FormParser)

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [IsAuthenticatedOrReadOnly()]
        return [IsAuthenticated(), IsSellerOrReadOnly()]

    def get(self, request, product_id):
        product = get_object_or_404(Product, pk=product_id)
        images = product.images.all().order_by('uploaded_at', 'id')
        serializer = ProductImageSerializer(
            images,
            many=True,
            context={'request': request},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, product_id):
        product = get_object_or_404(
            Product.objects.select_related('seller'),
            pk=product_id,
        )
        self.check_object_permissions(request, product)

        files = request.FILES.getlist('images') or request.FILES.getlist('image')
        if not files:
            return Response(
                {'error': 'No images provided. Use multipart field "images".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            locked = ProductMutationPolicy.lock_product_for_mutation(product.pk)
            self.check_object_permissions(request, locked)
            if not ProductMutationPolicy.can_edit(locked):
                return Response(
                    {'error': PRODUCT_IMAGE_FROZEN_MESSAGE},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            upload_serializer = ProductImageUploadSerializer(
                data={'images': files},
                context={'request': request, 'product': locked},
            )
            upload_serializer.is_valid(raise_exception=True)

            created = [
                ProductImage.objects.create(product=locked, image=image_file)
                for image_file in upload_serializer.validated_data['images']
            ]

        serializer = ProductImageSerializer(
            created,
            many=True,
            context={'request': request},
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def permission_denied(self, request, message=None, code=None):
        if not request.user or not request.user.is_authenticated:
            return super().permission_denied(request, message=message, code=code)
        raise PermissionDenied(
            detail={
                'error': message or IsSellerOrReadOnly.message,
            }
        )


class ProductImageDestroyView(APIView):
    """Delete a Product image owned by the Product seller (freeze-aware)."""

    permission_classes = [IsAuthenticated, IsSellerOrReadOnly]

    def delete(self, request, product_id, image_id):
        product = get_object_or_404(
            Product.objects.select_related('seller'),
            pk=product_id,
        )
        self.check_object_permissions(request, product)

        with transaction.atomic():
            locked = ProductMutationPolicy.lock_product_for_mutation(product.pk)
            self.check_object_permissions(request, locked)
            if not ProductMutationPolicy.can_edit(locked):
                return Response(
                    {'error': PRODUCT_IMAGE_FROZEN_MESSAGE},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            image = get_object_or_404(
                ProductImage.objects.select_related('product'),
                pk=image_id,
                product_id=locked.pk,
            )
            image.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)

    def permission_denied(self, request, message=None, code=None):
        if not request.user or not request.user.is_authenticated:
            return super().permission_denied(request, message=message, code=code)
        raise PermissionDenied(
            detail={
                'error': message or IsSellerOrReadOnly.message,
            }
        )
