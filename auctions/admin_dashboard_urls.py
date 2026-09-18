from django.urls import path

from .admin_dashboard_views import AdminDashboardSummaryView

app_name = 'admin_dashboard'

urlpatterns = [
    path(
        'summary/',
        AdminDashboardSummaryView.as_view(),
        name='summary',
    ),
]
