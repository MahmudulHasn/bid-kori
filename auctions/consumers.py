"""
Auction WebSocket consumers.

Read-only subscription rooms. Clients must place bids via REST
``POST /api/auctions/<id>/place-bid/`` (BidService), never over WebSocket.
"""

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .models import Auction
from .realtime import auction_group_name
from .visibility import user_can_retrieve_auction


class AuctionConsumer(AsyncJsonWebsocketConsumer):
    """Subscribe to live auction events for one auction room.

    Forwards server ``bid.accepted``, ``auction.closed``, and
    ``auction.cancelled`` payloads. Clients must place bids via REST, never
    over WebSocket.

    Connect authorization mirrors REST auction detail retrieve:
    publicly visible auctions are open; hidden auctions require Seller,
    Admin, winner, or prior bidder (same as ``user_can_retrieve_auction``).
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

        user = self.scope.get('user')
        if not await self._user_may_subscribe(self.auction_id, user):
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

    async def auction_cancelled(self, event):
        """Channels handler for group_send type ``auction.cancelled``."""
        payload = event.get('payload')
        if isinstance(payload, dict):
            await self.send_json(payload)

    @staticmethod
    @database_sync_to_async
    def _user_may_subscribe(auction_id: int, user) -> bool:
        auction = (
            Auction.objects.select_related('product')
            .filter(pk=auction_id)
            .first()
        )
        if auction is None:
            return False
        return user_can_retrieve_auction(user, auction)
