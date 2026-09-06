"""
Live auction broadcast helpers (Channels).

WebSockets are subscription/broadcast only. Bids remain REST + BidService.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import TYPE_CHECKING

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

if TYPE_CHECKING:
    from .models import Auction, Bid

logger = logging.getLogger(__name__)

BID_ACCEPTED_EVENT = 'bid.accepted'


def auction_group_name(auction_id: int | str) -> str:
    """Deterministic Channels group for an auction room."""
    return f'auction_{int(auction_id)}'


def format_money(value: Decimal | str | int | float) -> str:
    """Stable decimal money string for WebSocket payloads."""
    return f'{Decimal(str(value)):.2f}'


def build_bid_accepted_payload(bid: Bid, auction: Auction) -> dict:
    """Public bid.accepted payload — mirrors public BidSerializer fields only."""
    bidder_username = ''
    if getattr(bid, 'bidder_id', None):
        bidder = getattr(bid, 'bidder', None)
        if bidder is not None:
            bidder_username = getattr(bidder, 'username', '') or ''
    timestamp = bid.timestamp.isoformat() if bid.timestamp else ''
    return {
        'type': BID_ACCEPTED_EVENT,
        'auction_id': auction.pk,
        'bid': {
            'id': bid.pk,
            'amount': format_money(bid.amount),
            'bidder_username': bidder_username,
            'timestamp': timestamp,
        },
        'current_highest_bid': format_money(auction.current_highest_bid),
    }


def broadcast_bid_accepted(payload: dict) -> None:
    """Send bid.accepted to the auction group. Never raises to callers."""
    auction_id = payload.get('auction_id')
    if auction_id is None:
        logger.warning('bid.accepted broadcast skipped: missing auction_id')
        return

    channel_layer = get_channel_layer()
    if channel_layer is None:
        logger.warning(
            'bid.accepted broadcast skipped: CHANNEL_LAYERS is not configured'
        )
        return

    group = auction_group_name(auction_id)
    try:
        async_to_sync(channel_layer.group_send)(
            group,
            {
                # Channels consumer method: bid_accepted
                'type': 'bid.accepted',
                'payload': payload,
            },
        )
    except Exception:
        # DB bid already committed — broadcast failure must not affect authority.
        logger.exception(
            'Failed to broadcast bid.accepted for auction_id=%s',
            auction_id,
        )


def schedule_bid_accepted_broadcast(bid: Bid, auction: Auction) -> None:
    """Register post-commit broadcast for a successfully created bid.

    Must be called inside the same ``transaction.atomic()`` that creates the bid
    so a rolled-back transaction never emits an event.
    """
    payload = build_bid_accepted_payload(bid, auction)
    transaction.on_commit(lambda p=payload: broadcast_bid_accepted(p))
