from django.core.exceptions import ValidationError
from django.db import connection, transaction
from django.shortcuts import get_object_or_404

from .models import Auction, Bid


class BidService:
    """Atomically place a bid with row-level locking to prevent race conditions."""

    @classmethod
    def place_bid(cls, auction_id, bidder, amount):
        """Create a bid under ``select_for_update`` within an atomic transaction.

        Args:
            auction_id: Primary key of the target auction.
            bidder: Authenticated user placing the bid.
            amount: Bid amount as a :class:`~decimal.Decimal`.

        Returns:
            The newly created :class:`~auctions.models.Bid` instance.

        Raises:
            ValidationError: If the auction is inactive or the amount does not
                beat the current highest bid (or starting bid when no bids
                exist).
            Http404: If the auction does not exist (via ``get_object_or_404``).
        """
        with transaction.atomic():
            queryset = Auction.objects.select_related('product__seller')
            # PostgreSQL locks the row; SQLite local fallback has no FOR UPDATE.
            if connection.features.has_select_for_update:
                queryset = queryset.select_for_update()

            auction = get_object_or_404(queryset, pk=auction_id)

            if not auction.is_active():
                raise ValidationError('Auction is not active.')

            # Prefer the live highest bid; fall back to starting_bid when none yet.
            if auction.current_highest_bid and auction.current_highest_bid > 0:
                minimum_to_beat = auction.current_highest_bid
            else:
                minimum_to_beat = auction.starting_bid

            if amount <= minimum_to_beat:
                raise ValidationError(
                    'Bid amount must be higher than the current highest bid.'
                )

            minimum_required = minimum_to_beat + auction.min_increment
            if amount < minimum_required:
                raise ValidationError(
                    f'Bid amount must be at least {minimum_required} '
                    f'(current highest bid plus minimum increment).'
                )

            bid = Bid.objects.create(
                auction=auction,
                bidder=bidder,
                amount=amount,
            )
            auction.current_highest_bid = amount
            auction.winning_bidder = bidder
            auction.save(update_fields=['current_highest_bid', 'winning_bidder'])

            return bid


class AuctionStateMachine:
    """Enforces valid status transitions for an :class:`~auctions.models.Auction`.

    The auction lifecycle is a directed graph; only the transitions declared in
    :attr:`ALLOWED_TRANSITIONS` are permitted. Any attempt to move an auction to
    a status that is not reachable from its current status is rejected.
    """

    ALLOWED_TRANSITIONS = {
        Auction.Status.ACTIVE: [
            Auction.Status.CLOSED,
            Auction.Status.CANCELLED,
        ],
        Auction.Status.CLOSED: [],
        Auction.Status.CANCELLED: [],
    }

    @classmethod
    def transition(cls, auction, new_status):
        """Move ``auction`` to ``new_status`` if the transition is allowed.

        Args:
            auction: The :class:`~auctions.models.Auction` instance to update.
            new_status: The target status (a value from
                :class:`~auctions.models.Auction.Status`).

        Returns:
            The updated auction instance.

        Raises:
            ValidationError: If ``new_status`` is not a valid transition from
                the auction's current status.
        """
        current_status = auction.status
        allowed = cls.ALLOWED_TRANSITIONS.get(current_status, [])

        if new_status not in allowed:
            raise ValidationError(
                f"Invalid status transition: '{current_status}' -> '{new_status}'."
            )

        auction.status = new_status
        auction.save(update_fields=['status'])
        return auction
