from django.core.exceptions import ValidationError
from django.db import connection, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import Auction, Bid


class AuctionLifecycleService:
    """Authoritative auction close and cancel operations.

    All transitions to CLOSED or CANCELLED must go through this service.
    ``reserve_price`` is stored but not enforced yet (deferred work).
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
    def _lock_auction(cls, auction_id):
        queryset = Auction.objects
        if connection.features.has_select_for_update:
            queryset = queryset.select_for_update()
        return get_object_or_404(queryset, pk=auction_id)

    @classmethod
    def _resolve_highest_bid(cls, auction):
        """Return the winning bid row; Bid table is the source of truth."""
        return (
            Bid.objects.filter(auction=auction)
            .select_related('bidder')
            .order_by('-amount', 'timestamp')
            .first()
        )

    @classmethod
    def _finalize_close(cls, auction):
        """Close an ACTIVE auction and assign the final winner from Bid rows.

        Caller must already hold a row lock on ``auction``.
        """
        highest_bid = cls._resolve_highest_bid(auction)
        auction.status = Auction.Status.CLOSED
        if highest_bid is not None:
            auction.winning_bidder = highest_bid.bidder
            auction.current_highest_bid = highest_bid.amount
            auction.save(
                update_fields=['status', 'winning_bidder', 'current_highest_bid']
            )
        else:
            auction.winning_bidder = None
            auction.save(update_fields=['status', 'winning_bidder'])
        return auction

    @classmethod
    def close_auction(cls, auction_id, *, source='manual'):
        """Close an ACTIVE auction and finalize the winner from Bid rows.

        Idempotent when the auction is already CLOSED.

        Args:
            auction_id: Primary key of the auction.
            source: ``manual`` allows early close; ``expired`` requires
                ``end_time`` to have passed.

        Returns:
            Tuple of (auction, closed) where ``closed`` is True when this
            call transitioned the auction to CLOSED.
        """
        with transaction.atomic():
            auction = cls._lock_auction(auction_id)

            if auction.status == Auction.Status.CLOSED:
                return auction, False

            if auction.status != Auction.Status.ACTIVE:
                raise ValidationError(
                    f'Cannot close auction in status {auction.status}.'
                )

            if source == 'expired' and timezone.now() < auction.end_time:
                return auction, False

            cls._finalize_close(auction)
            return auction, True

    @classmethod
    def close_if_expired(cls, auction_or_id):
        """Close an ACTIVE auction when ``end_time`` has passed.

        Returns:
            Tuple of (auction, closed).
        """
        auction_id = (
            auction_or_id.pk if isinstance(auction_or_id, Auction) else auction_or_id
        )
        return cls.close_auction(auction_id, source='expired')

    @classmethod
    def cancel_auction(cls, auction_id):
        """Cancel an ACTIVE auction; clears the winner and blocks checkout.

        Returns:
            Tuple of (auction, cancelled).
        """
        with transaction.atomic():
            auction = cls._lock_auction(auction_id)

            if auction.status == Auction.Status.CANCELLED:
                return auction, False

            if auction.status != Auction.Status.ACTIVE:
                raise ValidationError(
                    f'Cannot cancel auction in status {auction.status}.'
                )

            auction.status = Auction.Status.CANCELLED
            auction.winning_bidder = None
            auction.save(update_fields=['status', 'winning_bidder'])
            return auction, True

    @classmethod
    def transition(cls, auction_id, new_status):
        """Apply an allowed ACTIVE terminal transition via lifecycle logic."""
        auction = Auction.objects.get(pk=auction_id)
        allowed = cls.ALLOWED_TRANSITIONS.get(auction.status, [])
        if new_status not in allowed:
            raise ValidationError(
                f"Invalid status transition: '{auction.status}' -> '{new_status}'."
            )

        if new_status == Auction.Status.CLOSED:
            closed_auction, _ = cls.close_auction(auction_id, source='manual')
            return closed_auction
        if new_status == Auction.Status.CANCELLED:
            cancelled_auction, _ = cls.cancel_auction(auction_id)
            return cancelled_auction

        raise ValidationError(f'Unsupported transition to {new_status}.')


class BidService:
    """Atomically place a bid with row-level locking to prevent race conditions."""

    @classmethod
    def place_bid(cls, auction_id, bidder, amount):
        """Create a bid under ``select_for_update`` within an atomic transaction.

        Expired ACTIVE auctions are closed authoritatively before the bid is
        rejected. ``winning_bidder`` is only set when the auction closes;
        during ACTIVE bidding only ``current_highest_bid`` is updated.
        """
        reject_bid = False

        with transaction.atomic():
            queryset = Auction.objects.select_related('product__seller')
            if connection.features.has_select_for_update:
                queryset = queryset.select_for_update()

            auction = get_object_or_404(queryset, pk=auction_id)
            now = timezone.now()

            if auction.status == Auction.Status.ACTIVE and now >= auction.end_time:
                AuctionLifecycleService._finalize_close(auction)
                reject_bid = True
            elif not auction.is_biddable(now):
                reject_bid = True
            else:
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
                auction.save(update_fields=['current_highest_bid'])

        if reject_bid:
            raise ValidationError('Auction is not active.')

        return bid


# Backwards-compatible alias for imports that reference AuctionStateMachine.
AuctionStateMachine = AuctionLifecycleService
