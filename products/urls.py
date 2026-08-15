from django.urls import path

from .views import ProductDetailView, ProductListCreateView, UserListingsView

app_name = 'products'

urlpatterns = [
    path('my-listings/', UserListingsView.as_view(), name='my-listings'),
    path('', ProductListCreateView.as_view(), name='product-list-create'),
    path('<int:pk>/', ProductDetailView.as_view(), name='product-detail'),
]
