from django.urls import path

from .seller_financial_views import SellerEarningsView, SellerSalesListView

app_name = 'seller_finance'

urlpatterns = [
    path('earnings/', SellerEarningsView.as_view(), name='earnings'),
    path('sales/', SellerSalesListView.as_view(), name='sales'),
]
