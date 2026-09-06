from django.db import transaction
from rest_framework import generics, status
from rest_framework.permissions import (
    AllowAny,
    IsAuthenticated,
    IsAuthenticatedOrReadOnly,
)
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .deletion_policy import (
    PRODUCT_DELETE_BLOCKED_MESSAGE,
    ProductDeletionPolicy,
)
from .models import Category, Product
from .mutation_policy import (
    PRODUCT_EDIT_FROZEN_MESSAGE,
    ProductMutationPolicy,
)
from .permissions import IsSellerOrAdminForProductCreate, IsSellerOrReadOnly
from .serializers import CategorySerializer, ProductSerializer


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

    queryset = Product.objects.select_related('category', 'seller').all()
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

    queryset = Product.objects.select_related('category', 'seller').all()
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
        return Product.objects.select_related('category', 'seller').filter(
            seller=self.request.user,
        )
