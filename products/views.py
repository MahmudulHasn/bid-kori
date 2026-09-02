from rest_framework import generics
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.exceptions import PermissionDenied

from .models import Product
from .permissions import IsSellerOrReadOnly
from .serializers import ProductSerializer


class ProductListCreateView(generics.ListCreateAPIView):
    """List all products or create a new one for the authenticated user.

    Product payloads contain catalog fields only (title, description, condition,
    category). Auction pricing belongs on ``Auction.starting_bid`` /
    ``Auction.current_highest_bid`` via ``POST /api/auctions/``.
    """

    queryset = Product.objects.select_related('category', 'seller').all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsSellerOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(seller=self.request.user)

    def permission_denied(self, request, message=None, code=None):
        if not request.user or not request.user.is_authenticated:
            return super().permission_denied(request, message=message, code=code)
        raise PermissionDenied(
            detail={
                'error': message or IsSellerOrReadOnly.message,
            }
        )


# Alias matching Samira's ProductListView naming for the list/create endpoint.
ProductListView = ProductListCreateView


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or delete a single product by its primary key.

    PUT, PATCH, and DELETE are restricted to the product seller via
    IsSellerOrReadOnly.
    """

    queryset = Product.objects.select_related('category', 'seller').all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsSellerOrReadOnly]

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
