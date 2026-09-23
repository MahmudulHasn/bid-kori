from django.urls import path

from .seller_financial_views import SellerEarningsView, SellerSalesListView
from .seller_winner_details_views import (
    SellerWinnerDetailsStatusView,
    SellerWinnerDetailsUnlockView,
    SellerWinnerDetailsView,
)

app_name = 'seller_finance'

urlpatterns = [
    path('earnings/', SellerEarningsView.as_view(), name='earnings'),
    path('sales/', SellerSalesListView.as_view(), name='sales'),
    path(
        'auctions/<int:auction_id>/winner-details/status/',
        SellerWinnerDetailsStatusView.as_view(),
        name='seller-winner-details-status',
    ),
    path(
        'auctions/<int:auction_id>/winner-details/unlock/',
        SellerWinnerDetailsUnlockView.as_view(),
        name='seller-winner-details-unlock',
    ),
    path(
        'auctions/<int:auction_id>/winner-details/',
        SellerWinnerDetailsView.as_view(),
        name='seller-winner-details',
    ),
]

