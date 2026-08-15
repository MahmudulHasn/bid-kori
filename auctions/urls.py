from django.urls import path

from .views import (
    AuctionDetailView,
    AuctionListCreateView,
    PlaceBidView,
    TransitionAuctionStateView,
    UserBidsView,
)

app_name = 'auctions'

urlpatterns = [
    path('my-bids/', UserBidsView.as_view(), name='my-bids'),
    path('', AuctionListCreateView.as_view(), name='auction-list-create'),
    path('<int:pk>/', AuctionDetailView.as_view(), name='auction-detail'),
    path(
        '<int:pk>/transition/',
        TransitionAuctionStateView.as_view(),
        name='auction-transition',
    ),
    path('<int:pk>/bids/', PlaceBidView.as_view(), name='place-bid'),
]
