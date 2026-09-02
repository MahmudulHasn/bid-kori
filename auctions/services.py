from django.core.exceptions import ValidationError
from django.db import connection, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import Auction, Bid


class AuctionLifecycleService:
    """Authoritative auction close and cancel operations.

    All transitions to CLOSED or CANCELLED must go through this service.

    Reserve price (optional): when set, the highest bid must meet or exceed
    ``reserve_price`` to produce a winner; otherwise the auction closes with
    no winner. Reserve is evaluated only at close time.
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
    def _reserve_met(cls, auction, highest_bid):
        """Return True when there is no reserve or the highest bid meets it."""
        if highest_bid is None:
            return False
        if auction.reserve_price is None:
            return True
        return highest_bid.amount >= auction.reserve_price

    @classmethod
    def _finalize_close(cls, auction):
        """Close an ACTIVE auction and assign the final winner from Bid rows.

        Caller must already hold a row lock on ``auction``.
        When ``reserve_price`` is set and the highest bid is below it, the
        auction closes with ``winning_bidder=None`` (no sale).
        """
        highest_bid = cls._resolve_highest_bid(auction)
        auction.status = Auction.Status.CLOSED

        if highest_bid is not None:
            auction.current_highest_bid = highest_bid.amount
            if cls._reserve_met(auction, highest_bid):
                auction.winning_bidder = highest_bid.bidder
            else:
                auction.winning_bidder = None
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
    """Atomically place a bid with row-level locking to prevent race conditions.

    Distinguishes:
    * Live high: ``current_highest_bid`` (and Bid rows) during ACTIVE
    * Final winner: ``winning_bidder``, set only by ``AuctionLifecycleService``
      at close — never by ``place_bid``
    """

    @classmethod
    def _validate_bidder(cls, bidder):
        if bidder is None or not getattr(bidder, 'is_authenticated', False):
            raise ValidationError('Authentication required to place a bid.')
        if not getattr(bidder, 'pk', None):
            raise ValidationError('Authentication required to place a bid.')

    @classmethod
    def _validate_amount(cls, amount):
        from decimal import Decimal, InvalidOperation

        try:
            value = amount if isinstance(amount, Decimal) else Decimal(str(amount))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValidationError('Bid amount must be a valid number.') from exc

        if value <= 0:
            raise ValidationError('Bid amount must be greater than zero.')
        return value

    @classmethod
    def _minimum_to_beat(cls, auction):
        """Derive the amount a new bid must exceed from Bid rows under lock.

        Falls back to ``starting_bid`` when no bids exist. Preferring Bid rows
        keeps increment checks consistent even if ``current_highest_bid`` drifts.
        """
        highest = (
            Bid.objects.filter(auction=auction)
            .order_by('-amount', 'timestamp')
            .first()
        )
        if highest is not None:
            return highest.amount
        if auction.current_highest_bid and auction.current_highest_bid > 0:
            return auction.current_highest_bid
        return auction.starting_bid

    @classmethod
    def place_bid(cls, auction_id, bidder, amount):
        """Create a bid under ``select_for_update`` within an atomic transaction.

        Expired ACTIVE auctions are closed authoritatively before the bid is
        rejected. ``winning_bidder`` is only set when the auction closes;
        during ACTIVE bidding only ``current_highest_bid`` is updated.
        """
        cls._validate_bidder(bidder)
        amount = cls._validate_amount(amount)
        reject_bid = False

        with transaction.atomic():
            queryset = Auction.objects.select_related('product__seller')
            if connection.features.has_select_for_update:
                queryset = queryset.select_for_update()

            auction = get_object_or_404(queryset, pk=auction_id)
            now = timezone.now()

            if auction.product.seller_id == bidder.pk:
                raise ValidationError(
                    'Action forbidden: Sellers cannot bid on their own listings.'
                )

            if auction.status == Auction.Status.ACTIVE and now >= auction.end_time:
                AuctionLifecycleService._finalize_close(auction)
                reject_bid = True
            elif auction.status in (
                Auction.Status.CLOSED,
                Auction.Status.CANCELLED,
            ):
                reject_bid = True
            elif not auction.is_biddable(now):
                reject_bid = True
            else:
                minimum_to_beat = cls._minimum_to_beat(auction)

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
                # Do not set winning_bidder here — final winner is assigned at close.
                auction.save(update_fields=['current_highest_bid'])

        if reject_bid:
            raise ValidationError('Auction is not active.')

        return bid


# Backwards-compatible alias for imports that reference AuctionStateMachine.
AuctionStateMachine = AuctionLifecycleService
