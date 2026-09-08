from django.urls import path

from .admin_moderation_views import AdminProductHideView, AdminProductRestoreView

app_name = 'admin_products'

urlpatterns = [
    path(
        '<int:product_id>/hide/',
        AdminProductHideView.as_view(),
        name='hide',
    ),
    path(
        '<int:product_id>/restore/',
        AdminProductRestoreView.as_view(),
        name='restore',
    ),
]
