"""WebSocket URL routing for live auction rooms."""

from django.urls import path

from .consumers import AuctionConsumer

websocket_urlpatterns = [
    path(
        'ws/auctions/<int:auction_id>/',
        AuctionConsumer.as_asgi(),
    ),
]
