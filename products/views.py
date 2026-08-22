from decimal import Decimal, InvalidOperation

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .models import Product
from .permissions import IsSellerOrReadOnly
from .serializers import ProductSerializer


class ProductListCreateView(generics.ListCreateAPIView):
    """List all products or create a new one for the authenticated user."""

    queryset = Product.objects.select_related('category', 'seller').all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsSellerOrReadOnly]

    def create(self, request, *args, **kwargs):
        raw_starting_price = request.data.get('starting_price')
        if raw_starting_price is None or raw_starting_price == '':
            return Response(
                {'error': 'Starting price must be a positive number.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            starting_price = Decimal(str(raw_starting_price))
        except (InvalidOperation, TypeError, ValueError):
            return Response(
                {'error': 'Starting price must be a positive number.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if starting_price <= 0:
            return Response(
                {'error': 'Starting price must be a positive number.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(seller=self.request.user)


# Alias matching Samira's ProductListView naming for the list/create endpoint.
ProductListView = ProductListCreateView


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or delete a single product by its primary key."""

    queryset = Product.objects.select_related('category', 'seller').all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsSellerOrReadOnly]


class UserListingsView(generics.ListAPIView):
    """Return all products listed by the authenticated user."""

    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Product.objects.select_related('category', 'seller').filter(
            seller=self.request.user,
        )
