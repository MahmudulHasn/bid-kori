from django.urls import path

from .views import (
    ActiveAuctionListView,
    AnalyticsDashboardView,
    AnalyticsSummaryView,
    AuctionBidHistoryView,
    AuctionDetailView,
    AuctionImageUploadView,
    AuctionListCreateView,
    PlaceBidView,
    TransitionAuctionStateView,
    UserBidsView,
)

app_name = 'auctions'

urlpatterns = [
    path('my-bids/', UserBidsView.as_view(), name='my-bids'),
    path('active/', ActiveAuctionListView.as_view(), name='active-auctions'),
    path('analytics/', AnalyticsSummaryView.as_view(), name='analytics-summary'),
    path(
        'analytics/dashboard/',
        AnalyticsDashboardView.as_view(),
        name='analytics-dashboard',
    ),
    path('', AuctionListCreateView, name='auction-list-create'),
    path('<int:pk>/', AuctionDetailView, name='auction-detail'),
    path(
        '<int:pk>/transition/',
        TransitionAuctionStateView.as_view(),
        name='auction-transition',
    ),
    path(
        '<int:auction_id>/images/',
        AuctionImageUploadView.as_view(),
        name='auction-image-upload',
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
