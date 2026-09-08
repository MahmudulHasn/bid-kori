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
from django.utils import timezone

if TYPE_CHECKING:
    from .models import Auction, Bid

logger = logging.getLogger(__name__)

BID_ACCEPTED_EVENT = 'bid.accepted'
AUCTION_CLOSED_EVENT = 'auction.closed'
AUCTION_CANCELLED_EVENT = 'auction.cancelled'


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


def build_auction_closed_payload(auction: Auction) -> dict:
    """Public auction.closed payload — safe for public Auction rooms.

    Does not include reserve_price or private user contact fields.
    ``winning_bidder`` is null when there were no bids or reserve was not met.
    """
    winning_bidder = None
    winner = getattr(auction, 'winning_bidder', None)
    if winner is not None:
        winning_bidder = {
            'id': winner.pk,
            'username': getattr(winner, 'username', '') or '',
        }
    elif getattr(auction, 'winning_bidder_id', None):
        # FK id present but related object not loaded — avoid inventing username.
        winning_bidder = {
            'id': int(auction.winning_bidder_id),
            'username': '',
        }

    return {
        'type': AUCTION_CLOSED_EVENT,
        'auction_id': auction.pk,
        'status': str(getattr(auction, 'status', 'CLOSED')),
        'current_highest_bid': format_money(auction.current_highest_bid),
        'winning_bidder': winning_bidder,
        'is_paid': bool(getattr(auction, 'is_paid', False)),
        'closed_at': timezone.now().isoformat(),
    }


def broadcast_auction_closed(payload: dict) -> None:
    """Send auction.closed to the auction group. Never raises to callers."""
    auction_id = payload.get('auction_id')
    if auction_id is None:
        logger.warning('auction.closed broadcast skipped: missing auction_id')
        return

    channel_layer = get_channel_layer()
    if channel_layer is None:
        logger.warning(
            'auction.closed broadcast skipped: CHANNEL_LAYERS is not configured'
        )
        return

    group = auction_group_name(auction_id)
    try:
        async_to_sync(channel_layer.group_send)(
            group,
            {
                # Channels consumer method: auction_closed
                'type': 'auction.closed',
                'payload': payload,
            },
        )
    except Exception:
        # Close already committed — broadcast failure must not affect authority.
        logger.exception(
            'Failed to broadcast auction.closed for auction_id=%s',
            auction_id,
        )


def schedule_auction_closed_broadcast(auction: Auction) -> None:
    """Register post-commit broadcast after an ACTIVE → CLOSED finalization.

    Must be called inside the same ``transaction.atomic()`` that persists CLOSED
    so a rolled-back transaction never emits an event. Call only from
    ``_finalize_close`` (real transitions), never on CLOSED → CLOSED no-ops.
    """
    payload = build_auction_closed_payload(auction)
    transaction.on_commit(lambda p=payload: broadcast_auction_closed(p))


def build_auction_cancelled_payload(auction: Auction) -> dict:
    """Public auction.cancelled payload — no moderation_reason / private fields."""
    return {
        'type': AUCTION_CANCELLED_EVENT,
        'auction_id': auction.pk,
        'status': 'CANCELLED',
        'winning_bidder': None,
        'server_time': timezone.now().isoformat(),
    }


def broadcast_auction_cancelled(payload: dict) -> None:
    """Send auction.cancelled to the auction group. Never raises to callers."""
    auction_id = payload.get('auction_id')
    if auction_id is None:
        logger.warning('auction.cancelled broadcast skipped: missing auction_id')
        return

    channel_layer = get_channel_layer()
    if channel_layer is None:
        logger.warning(
            'auction.cancelled broadcast skipped: CHANNEL_LAYERS is not configured'
        )
        return

    group = auction_group_name(auction_id)
    try:
        async_to_sync(channel_layer.group_send)(
            group,
            {
                # Channels consumer method: auction_cancelled
                'type': 'auction.cancelled',
                'payload': payload,
            },
        )
    except Exception:
        logger.exception(
            'Failed to broadcast auction.cancelled for auction_id=%s',
            auction_id,
        )


def schedule_auction_cancelled_broadcast(auction: Auction) -> None:
    """Register post-commit broadcast after an ACTIVE → CANCELLED transition.

    Call only when ``cancelled`` is True (real transition). Idempotent CANCELLED
    no-ops must not schedule a duplicate event.
    """
    payload = build_auction_cancelled_payload(auction)
    transaction.on_commit(lambda p=payload: broadcast_auction_cancelled(p))
