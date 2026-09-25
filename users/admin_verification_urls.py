from django.urls import path

from .admin_verification_views import (
    AdminVerificationApproveView,
    AdminVerificationDetailView,
    AdminVerificationListView,
    AdminVerificationRejectView,
)

app_name = 'admin_verifications'

urlpatterns = [
    path('', AdminVerificationListView.as_view(), name='list'),
    path(
        '<int:verification_id>/',
        AdminVerificationDetailView.as_view(),
        name='detail',
    ),
    path(
        '<int:verification_id>/approve/',
        AdminVerificationApproveView.as_view(),
        name='approve',
    ),
    path(
        '<int:verification_id>/reject/',
        AdminVerificationRejectView.as_view(),
        name='reject',
    ),
]
