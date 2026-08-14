from django.urls import path

from .views import (
    AuctionDetailView,
    AuctionListCreateView,
    TransitionAuctionStateView,
)

app_name = 'auctions'

urlpatterns = [
    path('', AuctionListCreateView.as_view(), name='auction-list-create'),
    path('<int:pk>/', AuctionDetailView.as_view(), name='auction-detail'),
    path(
        '<int:pk>/transition/',
        TransitionAuctionStateView.as_view(),
        name='auction-transition',
    ),
]
