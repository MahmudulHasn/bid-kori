from django.urls import path

from .admin_financial_views import AdminFinancialSummaryView

app_name = 'admin_finance'

urlpatterns = [
    path(
        'summary/',
        AdminFinancialSummaryView.as_view(),
        name='summary',
    ),
]
