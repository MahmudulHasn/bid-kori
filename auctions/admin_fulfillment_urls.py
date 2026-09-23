"""Admin fulfillment audit URL patterns (ADMIN-W01)."""

from django.urls import path

from .admin_fulfillment_views import (
    AdminFulfillmentDetailView,
    AdminFulfillmentListView,
    AdminFulfillmentSummaryView,
)

app_name = 'admin_fulfillment'

urlpatterns = [
    path(
        'summary/',
        AdminFulfillmentSummaryView.as_view(),
        name='summary',
    ),
    path(
        '<int:auction_id>/',
        AdminFulfillmentDetailView.as_view(),
        name='detail',
    ),
    path(
        '',
        AdminFulfillmentListView.as_view(),
        name='list',
    ),
]
