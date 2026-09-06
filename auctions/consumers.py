"""
Auction WebSocket consumers.

Read-only subscription rooms. Clients must place bids via REST
``POST /api/auctions/<id>/place-bid/`` (BidService), never over WebSocket.
"""

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .models import Auction
from .realtime import auction_group_name


class AuctionConsumer(AsyncJsonWebsocketConsumer):
    """Subscribe to live auction events for one auction room.

    Forwards server ``bid.accepted`` and ``auction.closed`` payloads.
    Clients must place bids via REST, never over WebSocket.
    """

    auction_id: int
    group_name: str

    async def connect(self):
        raw_id = self.scope['url_route']['kwargs'].get('auction_id')
        try:
            self.auction_id = int(raw_id)
        except (TypeError, ValueError):
            await self.close()
            return

        if not await self._auction_exists(self.auction_id):
            await self.close()
            return

        self.group_name = auction_group_name(self.auction_id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        group = getattr(self, 'group_name', None)
        if group:
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # Mutation is not supported on this socket.
        await self.send_json(
            {
                'type': 'error',
                'code': 'unsupported_message',
                'detail': (
                    'This WebSocket is read-only. '
                    'Place bids via POST /api/auctions/<id>/place-bid/.'
                ),
            }
        )

    async def bid_accepted(self, event):
        """Channels handler for group_send type ``bid.accepted``."""
        payload = event.get('payload')
        if isinstance(payload, dict):
            await self.send_json(payload)

    async def auction_closed(self, event):
        """Channels handler for group_send type ``auction.closed``."""
        payload = event.get('payload')
        if isinstance(payload, dict):
            await self.send_json(payload)

    @staticmethod
    @database_sync_to_async
    def _auction_exists(auction_id: int) -> bool:
        return Auction.objects.filter(pk=auction_id).exists()
