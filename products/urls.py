from django.urls import path

from .views import (
    ProductDetailView,
    ProductImageDestroyView,
    ProductImageListCreateView,
    ProductListCreateView,
    UserListingsView,
)

app_name = 'products'

urlpatterns = [
    path('my-listings/', UserListingsView.as_view(), name='my-listings'),
    path('', ProductListCreateView.as_view(), name='product-list-create'),
    path(
        '<int:product_id>/images/',
        ProductImageListCreateView.as_view(),
        name='product-image-list-create',
    ),
    path(
        '<int:product_id>/images/<int:image_id>/',
        ProductImageDestroyView.as_view(),
        name='product-image-destroy',
    ),
    path('<int:pk>/', ProductDetailView.as_view(), name='product-detail'),
]
