from rest_framework import generics
from rest_framework.permissions import IsAuthenticatedOrReadOnly

from .models import Product
from .serializers import ProductSerializer


class ProductListCreateView(generics.ListCreateAPIView):
    """List all products or create a new one for the authenticated user."""

    queryset = Product.objects.select_related('category', 'seller').all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(seller=self.request.user)


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or delete a single product by its primary key."""

    queryset = Product.objects.select_related('category', 'seller').all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
