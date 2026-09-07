from django.urls import path

from .admin_views import (
    AdminUserDetailView,
    AdminUserListView,
    AdminUserReactivateView,
    AdminUserSuspendView,
)

app_name = 'admin_users'

urlpatterns = [
    path('', AdminUserListView.as_view(), name='list'),
    path('<int:user_id>/', AdminUserDetailView.as_view(), name='detail'),
    path(
        '<int:user_id>/suspend/',
        AdminUserSuspendView.as_view(),
        name='suspend',
    ),
    path(
        '<int:user_id>/reactivate/',
        AdminUserReactivateView.as_view(),
        name='reactivate',
    ),
]
