from django.urls import path

from .views import (
    ActiveAuctionListView,
    AuctionBidHistoryView,
    AuctionDetailView,
    AuctionListCreateView,
    PlaceBidView,
    TransitionAuctionStateView,
    UserBidsView,
)

app_name = 'auctions'

urlpatterns = [
    path('my-bids/', UserBidsView.as_view(), name='my-bids'),
    path('active/', ActiveAuctionListView.as_view(), name='active-auctions'),
    path('', AuctionListCreateView.as_view(), name='auction-list-create'),
    path('<int:pk>/', AuctionDetailView.as_view(), name='auction-detail'),
    path(
        '<int:pk>/transition/',
        TransitionAuctionStateView.as_view(),
        name='auction-transition',
    ),
    path(
        '<int:auction_id>/place-bid/',
        PlaceBidView.as_view(),
        name='place-bid',
    ),
    path(
        '<int:auction_id>/history/',
        AuctionBidHistoryView.as_view(),
        name='auction-bid-history',
    ),
]
