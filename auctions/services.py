import uuid

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from config.db_locking import apply_select_for_update

from .fees import (
    FeeCalculationError,
    calculate_sale_fee_snapshot,
    get_platform_success_fee_percent,
)
from .models import Auction, Bid, Payment


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
        queryset = Auction.objects.select_related(
            'product',
            'product__seller',
            'winning_bidder',
            'payment',
        )
        queryset = apply_select_for_update(queryset)
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

        # Real ACTIVE → CLOSED only (callers never invoke this on already-CLOSED).
        from .realtime import schedule_auction_closed_broadcast

        schedule_auction_closed_broadcast(auction)

        # Terminal inbox rows (won/lost) — only when a winner exists.
        product_title = cls._product_title(auction)
        winner_id = auction.winning_bidder_id
        loser_ids: list[int] = []
        if winner_id is not None:
            loser_ids = list(
                Bid.objects.filter(auction=auction)
                .exclude(bidder_id=winner_id)
                .values_list('bidder_id', flat=True)
                .distinct()
            )

        from notifications.services import schedule_auction_closed_notifications

        schedule_auction_closed_notifications(
            auction_id=auction.pk,
            winning_bidder_id=winner_id,
            final_amount=auction.current_highest_bid,
            product_title=product_title,
            loser_user_ids=loser_ids,
        )
        return auction

    @classmethod
    def _product_title(cls, auction) -> str:
        product = getattr(auction, 'product', None)
        title = getattr(product, 'title', None) if product is not None else None
        if title:
            return str(title)
        # Product may not be select_related on every close path.
        try:
            return str(auction.product.title)
        except Exception:
            return f'Auction #{auction.pk}'

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

            # CANCELLED is already terminal — never rewrite to CLOSED / assign winner.
            if auction.status == Auction.Status.CANCELLED:
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
    def cancel_auction(
        cls,
        auction_id,
        *,
        reason: str | None = None,
        moderator=None,
        enforce_unpaid: bool = True,
    ):
        """Cancel an ACTIVE auction; clears the winner and blocks checkout.

        Seller and Admin paths share this method. By default rejects
        ``is_paid`` or an existing Payment row (``enforce_unpaid=True``).

        On a real ACTIVE → CANCELLED transition, schedules ``auction.cancelled``
        (never ``auction.closed``). Already-CANCELLED is idempotent with no
        duplicate broadcast.

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

            if enforce_unpaid:
                if auction.is_paid:
                    raise ValidationError(
                        'Cannot cancel a paid auction.'
                    )
                from .models import Payment

                if Payment.objects.filter(auction_id=auction.pk).exists():
                    raise ValidationError(
                        'Cannot cancel an auction that has a payment record.'
                    )

            auction.status = Auction.Status.CANCELLED
            auction.winning_bidder = None
            update_fields = ['status', 'winning_bidder']

            # Optional Admin moderation metadata — never toggles is_hidden.
            if moderator is not None:
                auction.moderated_by = moderator
                auction.moderated_at = timezone.now()
                update_fields.extend(['moderated_by', 'moderated_at'])
                if reason:
                    auction.moderation_reason = reason
                    update_fields.append('moderation_reason')
            elif reason:
                auction.moderation_reason = reason
                update_fields.append('moderation_reason')

            auction.save(update_fields=update_fields)

            from .realtime import schedule_auction_cancelled_broadcast

            schedule_auction_cancelled_broadcast(auction)
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
    def _current_highest_bid_row(cls, auction):
        """Return the current highest Bid row under lock, or None."""
        return (
            Bid.objects.filter(auction=auction)
            .order_by('-amount', 'timestamp')
            .first()
        )

    @classmethod
    def _minimum_to_beat(cls, auction):
        """Derive the amount a new bid must exceed from Bid rows under lock.

        Falls back to ``starting_bid`` when no bids exist. Preferring Bid rows
        keeps increment checks consistent even if ``current_highest_bid`` drifts.
        """
        highest = cls._current_highest_bid_row(auction)
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
            queryset = apply_select_for_update(queryset)

            auction = get_object_or_404(queryset, pk=auction_id)
            now = timezone.now()

            if auction.product.seller_id == bidder.pk:
                raise ValidationError(
                    'Action forbidden: Sellers cannot bid on their own listings.'
                )

            from .visibility import auction_accepts_new_bids

            if not auction_accepts_new_bids(auction):
                raise ValidationError(
                    'This auction is not available for bidding.'
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
                highest_row = cls._current_highest_bid_row(auction)
                previous_bidder_id = (
                    highest_row.bidder_id if highest_row is not None else None
                )
                minimum_to_beat = (
                    highest_row.amount
                    if highest_row is not None
                    else cls._minimum_to_beat(auction)
                )

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
                # Attach bidder for payload (same in-memory user used for create).
                bid.bidder = bidder
                # Broadcast only after this atomic block commits successfully.
                from .realtime import schedule_bid_accepted_broadcast

                schedule_bid_accepted_broadcast(bid, auction)

                product_title = AuctionLifecycleService._product_title(auction)
                from notifications.services import schedule_bid_placed_notifications

                schedule_bid_placed_notifications(
                    auction_id=auction.pk,
                    bidder_id=bidder.pk,
                    seller_id=auction.product.seller_id,
                    previous_bidder_id=previous_bidder_id,
                    amount=amount,
                    product_title=product_title,
                )

        if reject_bid:
            raise ValidationError('Auction is not active.')

        return bid


def close_all_expired_auctions(*, now=None):
    """Finalize every ACTIVE auction whose ``end_time`` has passed.

    Reused by the management command and the Celery Beat task. Each auction is
    closed in its own lifecycle transaction so one failure cannot roll back
    the rest. Winner / reserve logic remains in ``AuctionLifecycleService``.

    Returns:
        dict with keys ``found``, ``closed``, ``failed``, ``closed_ids``,
        and ``errors`` (list of ``{auction_id, error}``).
    """
    import logging

    logger = logging.getLogger(__name__)
    reference_time = now if now is not None else timezone.now()
    expired_ids = list(
        Auction.objects.filter(
            status=Auction.Status.ACTIVE,
            end_time__lte=reference_time,
        )
        .order_by('id')
        .values_list('pk', flat=True)
    )

    closed_ids: list[int] = []
    errors: list[dict] = []

    for auction_id in expired_ids:
        try:
            _, closed = AuctionLifecycleService.close_auction(
                auction_id,
                source='expired',
            )
            if closed:
                closed_ids.append(auction_id)
        except Exception as exc:  # noqa: BLE001 — isolate batch failures
            errors.append({'auction_id': auction_id, 'error': str(exc)})
            logger.exception(
                'Failed to close expired auction_id=%s',
                auction_id,
            )

    result = {
        'found': len(expired_ids),
        'closed': len(closed_ids),
        'failed': len(errors),
        'closed_ids': closed_ids,
        'errors': errors,
    }

    if result['failed']:
        logger.warning(
            'Expired auction close batch: found=%s closed=%s failed=%s',
            result['found'],
            result['closed'],
            result['failed'],
        )
    elif result['closed']:
        logger.info(
            'Expired auction close batch: found=%s closed=%s',
            result['found'],
            result['closed'],
        )
    else:
        logger.debug(
            'Expired auction close batch: found=%s closed=0',
            result['found'],
        )

    return result


class CheckoutAlreadyCompleted(Exception):
    """Winner attempted checkout when a completed sale is already recorded."""

    def __init__(self, payment=None, message=None):
        self.payment = payment
        self.message = message or 'Payment already completed for this auction.'
        super().__init__(self.message)


class CheckoutForbidden(Exception):
    """Authenticated user is not the winning bidder."""

    def __init__(self, message=None):
        self.message = message or (
            'Only the winning bidder can complete checkout.'
        )
        super().__init__(self.message)


class CheckoutService:
    """Mock winner checkout with row-locked concurrency and fee snapshots.

    Completing checkout writes a COMPLETED Payment ledger row and sets
    ``Auction.is_paid=True``. This is mock settlement / accounting only —
    not a payment-provider capture or seller payout.

    Seller suspension is not checked: historical winning sales remain payable
    by an authenticated active winner. Suspended winners cannot authenticate.
    """

    ALREADY_COMPLETED_MESSAGE = 'Payment already completed for this auction.'
    NOT_CLOSED_MESSAGE = 'Checkout is only allowed for CLOSED auctions.'
    NO_WINNER_MESSAGE = 'This auction has no winning bidder to charge.'
    NOT_WINNER_MESSAGE = 'Only the winning bidder can complete checkout.'
    INCONSISTENT_PAID_MESSAGE = (
        'Auction is marked paid but has no Payment record; checkout rejected.'
    )
    INVALID_GROSS_MESSAGE = 'Winning sale amount must be greater than zero.'

    @classmethod
    def _lock_auction(cls, auction_id):
        queryset = Auction.objects.select_related(
            'winning_bidder',
            'product',
            'product__seller',
            'payment',
        )
        queryset = apply_select_for_update(queryset)
        return get_object_or_404(queryset, pk=auction_id)

    @classmethod
    def _existing_payment(cls, auction):
        try:
            return auction.payment
        except Payment.DoesNotExist:
            return None

    @classmethod
    def _raise_already_completed(cls, payment=None, message=None):
        raise CheckoutAlreadyCompleted(
            payment=payment,
            message=message or cls.ALREADY_COMPLETED_MESSAGE,
        )

    @classmethod
    def checkout_for_winner(cls, auction_id, user):
        """Complete mock checkout for ``user`` on ``auction_id``.

        Returns the COMPLETED ``Payment``. Raises ``ValidationError`` for
        domain rejections (mapped to 400/403 by the view) or
        ``CheckoutAlreadyCompleted`` for duplicate checkout.
        """
        with transaction.atomic():
            auction = cls._lock_auction(auction_id)

            if auction.status != Auction.Status.CLOSED:
                raise ValidationError(cls.NOT_CLOSED_MESSAGE)

            if auction.winning_bidder_id is None:
                raise ValidationError(cls.NO_WINNER_MESSAGE)

            if user.pk != auction.winning_bidder_id:
                raise CheckoutForbidden(cls.NOT_WINNER_MESSAGE)

            existing = cls._existing_payment(auction)

            if existing is not None and existing.status == Payment.Status.COMPLETED:
                # Do not retroactively populate legacy null fee snapshots.
                cls._raise_already_completed(existing)

            if auction.is_paid:
                if existing is None:
                    cls._raise_already_completed(
                        None,
                        message=cls.INCONSISTENT_PAID_MESSAGE,
                    )
                cls._raise_already_completed(existing)

            amount = auction.current_highest_bid
            if amount is None or amount <= 0:
                raise ValidationError(cls.INVALID_GROSS_MESSAGE)

            try:
                snapshot = calculate_sale_fee_snapshot(
                    amount,
                    get_platform_success_fee_percent(),
                )
            except FeeCalculationError as exc:
                raise ValidationError(str(exc)) from exc

            transaction_id = f'TXN-{uuid.uuid4().hex[:16].upper()}'
            fee_fields = {
                'fee_rate': snapshot.fee_rate,
                'platform_fee': snapshot.platform_fee,
                'seller_net_amount': snapshot.seller_net_amount,
            }

            try:
                # Nested atomic = savepoint so IntegrityError does not abort
                # the outer checkout transaction on PostgreSQL.
                with transaction.atomic():
                    if existing is not None:
                        payment = existing
                        payment.user = user
                        payment.amount = amount
                        payment.status = Payment.Status.COMPLETED
                        payment.transaction_id = transaction_id
                        payment.fee_rate = snapshot.fee_rate
                        payment.platform_fee = snapshot.platform_fee
                        payment.seller_net_amount = snapshot.seller_net_amount
                        payment.save(
                            update_fields=[
                                'user',
                                'amount',
                                'status',
                                'transaction_id',
                                'fee_rate',
                                'platform_fee',
                                'seller_net_amount',
                                'updated_at',
                            ]
                        )
                    else:
                        payment = Payment.objects.create(
                            auction=auction,
                            user=user,
                            amount=amount,
                            status=Payment.Status.COMPLETED,
                            transaction_id=transaction_id,
                            **fee_fields,
                        )
            except IntegrityError:
                raced = Payment.objects.filter(auction_id=auction.pk).first()
                if raced is not None and raced.status == Payment.Status.COMPLETED:
                    cls._raise_already_completed(raced)
                auction.refresh_from_db(fields=['is_paid'])
                if auction.is_paid:
                    cls._raise_already_completed(raced)
                raise ValidationError(
                    'Unable to complete checkout due to a conflicting payment record.'
                )

            auction.is_paid = True
            auction.save(update_fields=['is_paid'])
            return payment


# Backwards-compatible alias for imports that reference AuctionStateMachine.
AuctionStateMachine = AuctionLifecycleService
