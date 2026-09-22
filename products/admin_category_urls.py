from django.urls import path

from .admin_category_views import (
    AdminCategoryDetailView,
    AdminCategoryListCreateView,
)

app_name = 'admin_categories'

urlpatterns = [
    path('', AdminCategoryListCreateView.as_view(), name='list-create'),
    path('<int:category_id>/', AdminCategoryDetailView.as_view(), name='detail'),
]
