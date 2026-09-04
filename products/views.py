from django.db import transaction
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .deletion_policy import (
    PRODUCT_DELETE_BLOCKED_MESSAGE,
    ProductDeletionPolicy,
)
from .models import Product
from .permissions import IsSellerOrAdminForProductCreate, IsSellerOrReadOnly
from .serializers import ProductSerializer


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
    IsSellerOrReadOnly. DELETE is additionally blocked when an Auction is
    linked (history-preserving integrity guard for all roles including ADMIN).
    """

    queryset = Product.objects.select_related('category', 'seller').all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsSellerOrReadOnly]

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
