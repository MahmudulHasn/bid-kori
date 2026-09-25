from decimal import Decimal
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


class BidPlacementError(ValidationError):
    """Structured domain rejection for an attempted bid.

    Subclasses Django's ValidationError so existing exception handlers catch it
    seamlessly while exposing structured error_code, messages, and state snapshots.
    """

    def __init__(
        self,
        message: str,
        *,
        error_code: str = 'BID_REJECTED',
        current_bid: Decimal | None = None,
        min_increment: Decimal | None = None,
        minimum_required: Decimal | None = None,
        status_code: int = 400,
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.current_bid = current_bid
        self.min_increment = min_increment
        self.minimum_required = minimum_required
        self.status_code = status_code

    def to_dict(self) -> dict:
        data = {
            'success': False,
            'status': 'REJECTED',
            'error_code': self.error_code,
            'message': self.message,
            'error': self.message,
        }
        if self.current_bid is not None:
            data['current_bid'] = f'{Decimal(str(self.current_bid)):.2f}'
        if self.minimum_required is not None:
            data['minimum_required'] = f'{Decimal(str(self.minimum_required)):.2f}'
        return data


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
            raise BidPlacementError(
                'Authentication required to place a bid.',
                error_code='AUTHENTICATION_REQUIRED',
                status_code=401,
            )
        if not getattr(bidder, 'pk', None):
            raise BidPlacementError(
                'Authentication required to place a bid.',
                error_code='AUTHENTICATION_REQUIRED',
                status_code=401,
            )

    @classmethod
    def _validate_amount(cls, amount):
        from decimal import Decimal, InvalidOperation

        try:
            value = amount if isinstance(amount, Decimal) else Decimal(str(amount))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise BidPlacementError(
                'Bid amount must be a valid number.',
                error_code='INVALID_AMOUNT',
                status_code=400,
            ) from exc

        if not value.is_finite() or value <= 0:
            raise BidPlacementError(
                'Bid amount must be greater than zero.',
                error_code='INVALID_AMOUNT',
                status_code=400,
            )
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

        reject_error = None
        with transaction.atomic():
            queryset = Auction.objects.select_related('product__seller')
            queryset = apply_select_for_update(queryset)

            auction = get_object_or_404(queryset, pk=auction_id)
            now = timezone.now()

            from .visibility import auction_accepts_new_bids

            if auction.product.seller_id == bidder.pk:
                reject_error = BidPlacementError(
                    'Action forbidden: Sellers cannot bid on their own listings.',
                    error_code='SELLER_CANNOT_BID',
                    status_code=403,
                )
            elif not auction_accepts_new_bids(auction):
                reject_error = BidPlacementError(
                    'This auction is not available for bidding.',
                    error_code='AUCTION_NOT_AVAILABLE',
                    status_code=400,
                )
            elif auction.status == Auction.Status.ACTIVE and now >= auction.end_time:
                AuctionLifecycleService._finalize_close(auction)
                reject_error = BidPlacementError(
                    'Auction is not active.',
                    error_code='AUCTION_EXPIRED',
                    current_bid=auction.current_highest_bid,
                    status_code=400,
                )
            elif auction.status in (
                Auction.Status.CLOSED,
                Auction.Status.CANCELLED,
            ):
                reject_error = BidPlacementError(
                    'Auction is not active.',
                    error_code='AUCTION_NOT_ACTIVE',
                    current_bid=auction.current_highest_bid,
                    status_code=400,
                )
            elif not auction.is_biddable(now):
                reject_error = BidPlacementError(
                    'Auction is not active.',
                    error_code='AUCTION_NOT_ACTIVE',
                    current_bid=auction.current_highest_bid,
                    status_code=400,
                )

            if reject_error is not None:
                pass
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

                # Idempotency: if this exact bidder already holds the current highest bid with this exact amount
                if (
                    highest_row is not None
                    and highest_row.bidder_id == bidder.pk
                    and highest_row.amount == amount
                ):
                    highest_row.is_duplicate = True
                    highest_row.auction = auction
                    highest_row.bidder = bidder
                    return highest_row

                # Reject equal or lower bids
                if amount <= minimum_to_beat:
                    raise BidPlacementError(
                        'Another buyer has already placed an equal or higher bid. Please submit a higher amount.',
                        error_code='BID_AMOUNT_NO_LONGER_VALID',
                        current_bid=minimum_to_beat,
                        min_increment=auction.min_increment,
                        minimum_required=minimum_to_beat + auction.min_increment,
                        status_code=400,
                    )

                minimum_required = minimum_to_beat + auction.min_increment
                if amount < minimum_required:
                    raise BidPlacementError(
                        f'Bid amount must be at least {minimum_required} '
                        f'(current highest bid plus minimum increment).',
                        error_code='BID_INCREMENT_TOO_LOW',
                        current_bid=minimum_to_beat,
                        min_increment=auction.min_increment,
                        minimum_required=minimum_required,
                        status_code=400,
                    )

                try:
                    with transaction.atomic():
                        bid = Bid.objects.create(
                            auction=auction,
                            bidder=bidder,
                            amount=amount,
                        )
                except IntegrityError:
                    # Concurrent race hit the DB unique constraint on (auction, amount)
                    auction.refresh_from_db(fields=['current_highest_bid'])
                    latest_high = cls._current_highest_bid_row(auction)
                    latest_amount = (
                        latest_high.amount if latest_high else auction.current_highest_bid
                    )
                    if (
                        latest_high
                        and latest_high.bidder_id == bidder.pk
                        and latest_high.amount == amount
                    ):
                        latest_high.is_duplicate = True
                        latest_high.auction = auction
                        latest_high.bidder = bidder
                        return latest_high
                    raise BidPlacementError(
                        'Another buyer has already placed an equal or higher bid. Please submit a higher amount.',
                        error_code='BID_AMOUNT_NO_LONGER_VALID',
                        current_bid=latest_amount,
                        min_increment=auction.min_increment,
                        minimum_required=(latest_amount + auction.min_increment)
                        if latest_amount
                        else None,
                        status_code=400,
                    )

                auction.current_highest_bid = amount
                # Attach bidder and auction for payload.
                bid.bidder = bidder
                bid.auction = auction
                bid.is_duplicate = False

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

                # If reserve price is configured and fulfilled, close auction immediately and declare winner
                reserve_fulfilled = (
                    auction.reserve_price is not None
                    and amount >= auction.reserve_price
                )

                if reserve_fulfilled:
                    AuctionLifecycleService._finalize_close(auction)
                else:
                    auction.save(update_fields=['current_highest_bid'])

        if reject_error is not None:
            raise reject_error

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


class WinnerDetailsForbidden(Exception):
    """Authenticated user is not the winning bidder or lacks permission."""

    def __init__(self, message=None):
        self.message = message or 'Only the winning bidder can access winner details.'
        super().__init__(self.message)


class WinnerDetailsValidationError(Exception):
    """Domain rejection for winner fulfillment data or auction state."""

    def __init__(self, message=None):
        self.message = message or 'Invalid winner fulfillment data.'
        super().__init__(self.message)


class WinnerFulfillmentService:
    """Service governing buyer winner-fulfillment details lifecycle and authorization.

    Ensures:
    - Only the verified winning bidder of a CLOSED auction can access or edit details.
    - Incremental drafts are saved safely to PostgreSQL without race duplicates.
    - Final submission validates all required fields and transitions to COMPLETED.
    - Post-completion edits retain COMPLETED status without re-drafting.
    """

    @classmethod
    def verify_winner_access(cls, auction_id, user, for_update=False):
        """Authoritatively verify that user is authenticated and won the closed auction."""
        if not user or not getattr(user, 'is_authenticated', False):
            raise WinnerDetailsForbidden('Authentication required.')

        queryset = Auction.objects.select_related('winning_bidder', 'product__seller')
        if for_update:
            queryset = apply_select_for_update(queryset)

        auction = get_object_or_404(
            queryset,
            pk=auction_id,
        )

        if auction.status != Auction.Status.CLOSED:
            raise WinnerDetailsValidationError(
                'Winner details are only available for CLOSED auctions.'
            )

        if auction.winning_bidder_id is None:
            raise WinnerDetailsValidationError(
                'This auction ended with no winning bidder.'
            )

        if user.pk != auction.winning_bidder_id:
            raise WinnerDetailsForbidden(
                'Action forbidden: Only the winning bidder can access winner details.'
            )

        return auction

    @classmethod
    def get_details_for_winner(cls, auction_id, user):
        """Retrieve existing details for the winning buyer, or None if not started."""
        auction = cls.verify_winner_access(auction_id, user)
        from .models import WinnerFulfillmentDetails

        details = WinnerFulfillmentDetails.objects.filter(auction=auction).first()
        return auction, details

    @classmethod
    def save_draft(cls, auction_id, user, data, completed_step=None):
        """Persist incremental draft progress across steps in PostgreSQL."""
        from .models import WinnerFulfillmentDetails
        from .winner_fulfillment_serializers import WinnerFulfillmentSubmitSerializer

        with transaction.atomic():
            auction = cls.verify_winner_access(auction_id, user, for_update=True)

            details, _ = WinnerFulfillmentDetails.objects.get_or_create(
                auction=auction,
                defaults={
                    'buyer': user,
                    'status': WinnerFulfillmentDetails.Status.DRAFT,
                    'completed_step': 0,
                },
            )

            allowed_fields = [
                'full_name',
                'phone',
                'email',
                'address_line',
                'area',
                'district',
                'division',
                'postal_code',
                'preferred_contact_method',
                'delivery_note',
            ]
            old_values = (
                {f: getattr(details, f) for f in allowed_fields}
                if details.status == WinnerFulfillmentDetails.Status.COMPLETED
                else None
            )

            update_fields = ['updated_at']
            for field in allowed_fields:
                if field in data:
                    setattr(details, field, data[field])
                    update_fields.append(field)

            # If already COMPLETED, ensure the edit does not invalidate required fulfillment data
            if details.status == WinnerFulfillmentDetails.Status.COMPLETED:
                validation_payload = {
                    'full_name': details.full_name,
                    'phone': details.phone,
                    'email': details.email,
                    'address_line': details.address_line,
                    'area': details.area,
                    'district': details.district,
                    'division': details.division,
                    'postal_code': details.postal_code,
                    'preferred_contact_method': details.preferred_contact_method,
                    'delivery_note': details.delivery_note,
                }
                serializer = WinnerFulfillmentSubmitSerializer(data=validation_payload)
                if not serializer.is_valid():
                    first_error = next(iter(serializer.errors.values()))[0]
                    field_name = next(iter(serializer.errors.keys()))
                    raise WinnerDetailsValidationError(
                        f'Cannot invalidate completed details ({field_name}: {first_error})'
                    )

                changed = any(getattr(details, f) != old_values[f] for f in allowed_fields)
                if changed and WinnerDetailsUnlockService.seller_has_access(auction.pk, auction.product.seller):
                    from notifications.services import schedule_seller_winner_details_updated_notification

                    schedule_seller_winner_details_updated_notification(
                        seller_id=auction.product.seller_id,
                        auction_id=auction.pk,
                        product_title=auction.product.title,
                    )
            elif completed_step is not None:
                step_val = min(3, max(0, int(completed_step)))
                details.completed_step = max(details.completed_step, step_val)
                update_fields.append('completed_step')

            details.save(update_fields=list(set(update_fields)))
            return details

    @classmethod
    def submit_details(cls, auction_id, user, data=None):
        """Validate all required fields across all steps and mark COMPLETED."""
        from .models import WinnerFulfillmentDetails
        from .winner_fulfillment_serializers import WinnerFulfillmentSubmitSerializer

        with transaction.atomic():
            auction = cls.verify_winner_access(auction_id, user, for_update=True)

            details, _ = WinnerFulfillmentDetails.objects.get_or_create(
                auction=auction,
                defaults={
                    'buyer': user,
                    'status': WinnerFulfillmentDetails.Status.DRAFT,
                    'completed_step': 0,
                },
            )

            allowed_fields = [
                'full_name',
                'phone',
                'email',
                'address_line',
                'area',
                'district',
                'division',
                'postal_code',
                'preferred_contact_method',
                'delivery_note',
            ]

            was_completed = (
                details.status == WinnerFulfillmentDetails.Status.COMPLETED
                and details.submitted_at is not None
            )
            old_values = {f: getattr(details, f) for f in allowed_fields} if was_completed else None

            # Apply any incoming data first
            if data:
                for field in allowed_fields:
                    if field in data:
                        setattr(details, field, data[field])

            # Compile full payload for strict validation
            validation_payload = {
                'full_name': details.full_name,
                'phone': details.phone,
                'email': details.email,
                'address_line': details.address_line,
                'area': details.area,
                'district': details.district,
                'division': details.division,
                'postal_code': details.postal_code,
                'preferred_contact_method': details.preferred_contact_method,
                'delivery_note': details.delivery_note,
            }

            serializer = WinnerFulfillmentSubmitSerializer(data=validation_payload)
            if not serializer.is_valid():
                first_error = next(iter(serializer.errors.values()))[0]
                field_name = next(iter(serializer.errors.keys()))
                raise WinnerDetailsValidationError(f'{field_name}: {first_error}')

            # Update cleaned/normalized fields
            for key, val in serializer.validated_data.items():
                setattr(details, key, val)

            details.status = WinnerFulfillmentDetails.Status.COMPLETED
            details.completed_step = 4
            if not details.submitted_at:
                details.submitted_at = timezone.now()

            details.save()

            if not was_completed:
                from notifications.services import schedule_seller_winner_details_ready_notification

                schedule_seller_winner_details_ready_notification(
                    seller_id=auction.product.seller_id,
                    auction_id=auction.pk,
                    product_title=auction.product.title,
                )
            elif old_values is not None:
                changed = any(getattr(details, f) != old_values[f] for f in allowed_fields)
                if changed and WinnerDetailsUnlockService.seller_has_access(auction.pk, auction.product.seller):
                    from notifications.services import schedule_seller_winner_details_updated_notification

                    schedule_seller_winner_details_updated_notification(
                        seller_id=auction.product.seller_id,
                        auction_id=auction.pk,
                        product_title=auction.product.title,
                    )

            return details


class WinnerDetailsUnlockForbidden(Exception):
    """Authenticated user is not authorized for seller winner-details operations."""

    def __init__(self, message=None):
        self.message = (
            message
            or 'Action forbidden: Only the auction seller can access or unlock winner details.'
        )
        super().__init__(self.message)


class WinnerDetailsUnlockValidationError(Exception):
    """Domain rejection for winner details unlock state or eligibility."""

    def __init__(self, message=None):
        self.message = message or 'Invalid winner details unlock state.'
        super().__init__(self.message)


class WinnerDetailsUnlockService:
    """Service governing seller winner-fulfillment details unlock and entitlement lifecycle.

    Guarantees:
    - Only the authenticated seller who owns the closed auction can view status, pay unlock, and read details.
    - Unlock requires auction to be CLOSED with an authoritative winning bidder.
    - Unlock requires WinnerFulfillmentDetails to exist with status == COMPLETED.
    - Idempotency: repeated unlock requests do not double charge or create duplicate records.
    - Concurrency safety: simultaneous unlock requests under PostgreSQL serialize safely without duplicate charges or unhandled 500s.
    - Privacy: status endpoint never leaks Buyer PII.
    """

    @classmethod
    def verify_seller_eligibility(cls, auction_id, user, for_update=False):
        """Authoritatively verify that user is authenticated and is the seller of the auction."""
        if not user or not getattr(user, 'is_authenticated', False):
            raise WinnerDetailsUnlockForbidden('Authentication required.')

        queryset = Auction.objects.select_related(
            'product',
            'product__seller',
            'winning_bidder',
            'winner_fulfillment_details',
            'winner_details_unlock',
        )
        if for_update:
            queryset = apply_select_for_update(queryset)

        auction = get_object_or_404(queryset, pk=auction_id)

        if auction.product.seller_id != user.pk:
            raise WinnerDetailsUnlockForbidden(
                'Action forbidden: You do not own this auction.'
            )

        return auction

    @classmethod
    def get_status_for_seller(cls, auction_id, user):
        """Return status payload for the auction seller without exposing Buyer PII."""
        auction = cls.verify_seller_eligibility(auction_id, user, for_update=False)
        from .fees import get_winner_details_unlock_fee
        from .models import WinnerDetailsUnlock, WinnerFulfillmentDetails

        try:
            unlock = auction.winner_details_unlock
            is_unlocked = bool(unlock.status == WinnerDetailsUnlock.Status.PAID)
        except WinnerDetailsUnlock.DoesNotExist:
            is_unlocked = False

        try:
            details = auction.winner_fulfillment_details
            details_status = details.status
            completed = bool(details.status == WinnerFulfillmentDetails.Status.COMPLETED)
        except WinnerFulfillmentDetails.DoesNotExist:
            details = None
            details_status = 'NOT_STARTED'
            completed = False

        winner_exists = bool(auction.winning_bidder_id is not None)
        is_closed = bool(auction.status == Auction.Status.CLOSED)

        can_unlock = bool(is_closed and winner_exists and completed and not is_unlocked)
        if is_unlocked and unlock is not None:
            fee = unlock.fee_amount
        else:
            fee = get_winner_details_unlock_fee(auction)

        total_amount = (
            auction.current_highest_bid
            if (auction.current_highest_bid and auction.current_highest_bid > Decimal('0.00'))
            else (auction.starting_bid or Decimal('0.00'))
        )

        return {
            'auction_id': auction.pk,
            'winner_exists': winner_exists,
            'details_status': details_status,
            'can_unlock': can_unlock,
            'is_unlocked': is_unlocked,
            'unlock_fee': fee,
            'unlock_fee_percent': Decimal('2.00'),
            'total_amount': total_amount,
            'currency': 'BDT',
        }

    @classmethod
    def unlock_for_seller(cls, auction_id, user):
        """Atomically process mock payment and record persistent seller access entitlement.

        Returns tuple of (unlock_record, created_bool).
        """
        import uuid
        from .fees import get_winner_details_unlock_fee
        from .models import WinnerDetailsUnlock, WinnerFulfillmentDetails

        with transaction.atomic():
            auction = cls.verify_seller_eligibility(auction_id, user, for_update=True)

            if auction.status != Auction.Status.CLOSED:
                raise WinnerDetailsUnlockValidationError(
                    f'Winner details unlock is only available for CLOSED auctions (current status: {auction.status}).'
                )

            if auction.winning_bidder_id is None:
                raise WinnerDetailsUnlockValidationError(
                    'This auction ended with no winning bidder.'
                )

            # Check existing unlock
            try:
                existing_unlock = auction.winner_details_unlock
                if existing_unlock.status == WinnerDetailsUnlock.Status.PAID:
                    return existing_unlock, False
            except WinnerDetailsUnlock.DoesNotExist:
                existing_unlock = None

            # Check WinnerFulfillmentDetails
            try:
                details = auction.winner_fulfillment_details
            except WinnerFulfillmentDetails.DoesNotExist:
                details = None

            if details is None or details.status != WinnerFulfillmentDetails.Status.COMPLETED:
                raise WinnerDetailsUnlockValidationError(
                    'Winner details are not ready to unlock yet.'
                )

            if details.buyer_id != auction.winning_bidder_id:
                raise WinnerDetailsUnlockValidationError(
                    'Fulfillment details record is invalid.'
                )

            fee_amount = get_winner_details_unlock_fee(auction)
            payment_ref = f'WDU-{uuid.uuid4().hex[:16].upper()}'
            now = timezone.now()

            from notifications.services import schedule_winner_details_unlocked_notification

            schedule_winner_details_unlocked_notification(
                buyer_id=auction.winning_bidder_id,
                auction_id=auction.pk,
                product_title=auction.product.title,
            )

            if existing_unlock is not None:
                existing_unlock.fee_amount = fee_amount
                existing_unlock.status = WinnerDetailsUnlock.Status.PAID
                existing_unlock.payment_reference = payment_ref
                existing_unlock.paid_at = now
                existing_unlock.unlocked_at = now
                existing_unlock.winner_details = details
                existing_unlock.save(
                    update_fields=[
                        'fee_amount',
                        'status',
                        'payment_reference',
                        'paid_at',
                        'unlocked_at',
                        'winner_details',
                        'updated_at',
                    ]
                )
                return existing_unlock, True
            else:
                try:
                    with transaction.atomic():
                        unlock = WinnerDetailsUnlock.objects.create(
                            auction=auction,
                            seller=user,
                            winner_details=details,
                            fee_amount=fee_amount,
                            currency='BDT',
                            status=WinnerDetailsUnlock.Status.PAID,
                            payment_reference=payment_ref,
                            paid_at=now,
                            unlocked_at=now,
                        )
                        return unlock, True
                except IntegrityError:
                    raced = WinnerDetailsUnlock.objects.filter(auction_id=auction.pk).first()
                    if raced is not None and raced.status == WinnerDetailsUnlock.Status.PAID:
                        return raced, False
                    raise WinnerDetailsUnlockValidationError(
                        'Unable to complete unlock due to a conflicting record.'
                    )

    @classmethod
    def initiate_sslcommerz_unlock(cls, auction_id, user):
        """Initiate SSLCOMMERZ gateway payment session for 2% unlock fee.

        Creates or updates a PENDING WinnerDetailsUnlock record and returns GatewayPageURL.
        """
        import uuid
        from django.conf import settings
        from .fees import get_winner_details_unlock_fee
        from .models import WinnerDetailsUnlock, WinnerFulfillmentDetails
        from .sslcommerz import initiate_sslcommerz_session

        with transaction.atomic():
            auction = cls.verify_seller_eligibility(auction_id, user, for_update=True)

            if auction.status != Auction.Status.CLOSED:
                raise WinnerDetailsUnlockValidationError(
                    f'Winner details unlock is only available for CLOSED auctions (current status: {auction.status}).'
                )

            if auction.winning_bidder_id is None:
                raise WinnerDetailsUnlockValidationError(
                    'This auction ended with no winning bidder.'
                )

            # Check existing unlock
            try:
                existing_unlock = auction.winner_details_unlock
                if existing_unlock.status == WinnerDetailsUnlock.Status.PAID:
                    return {
                        'auction_id': auction.pk,
                        'status': existing_unlock.status,
                        'is_unlocked': True,
                        'already_unlocked': True,
                        'fee_amount': existing_unlock.fee_amount,
                        'currency': existing_unlock.currency,
                        'payment_reference': existing_unlock.payment_reference,
                        'unlocked_at': existing_unlock.unlocked_at,
                        'gateway': 'sslcommerz',
                        'gateway_url': None,
                    }
            except WinnerDetailsUnlock.DoesNotExist:
                existing_unlock = None

            # Check WinnerFulfillmentDetails
            try:
                details = auction.winner_fulfillment_details
            except WinnerFulfillmentDetails.DoesNotExist:
                details = None

            if details is None or details.status != WinnerFulfillmentDetails.Status.COMPLETED:
                raise WinnerDetailsUnlockValidationError(
                    'Winner details are not ready to unlock yet.'
                )

            if details.buyer_id != auction.winning_bidder_id:
                raise WinnerDetailsUnlockValidationError(
                    'Fulfillment details record is invalid.'
                )

            fee_amount = get_winner_details_unlock_fee(auction)
            tran_id = f'WDU-{auction.pk}-{uuid.uuid4().hex[:10].upper()}'

            backend_base = getattr(settings, 'BACKEND_BASE_URL', 'http://localhost:8000').rstrip('/')
            success_url = f'{backend_base}/api/seller/payment/success/'
            fail_url = f'{backend_base}/api/seller/payment/fail/'
            cancel_url = f'{backend_base}/api/seller/payment/cancel/'
            ipn_url = f'{backend_base}/api/seller/payment/ipn/'

            customer_name = user.get_full_name() or user.username
            customer_email = user.email or f'{user.username}@bidkori.com'
            customer_phone = getattr(getattr(user, 'profile', None), 'phone', '') or '01700000000'

            gateway_url = initiate_sslcommerz_session(
                tran_id=tran_id,
                amount=fee_amount,
                customer_name=customer_name,
                customer_email=customer_email,
                customer_phone=customer_phone,
                auction_id=auction.pk,
                success_url=success_url,
                fail_url=fail_url,
                cancel_url=cancel_url,
                ipn_url=ipn_url,
            )

            if existing_unlock is not None:
                existing_unlock.fee_amount = fee_amount
                existing_unlock.status = WinnerDetailsUnlock.Status.PENDING
                existing_unlock.payment_reference = tran_id
                existing_unlock.payment_method = 'SSLCOMMERZ'
                existing_unlock.winner_details = details
                existing_unlock.save(
                    update_fields=[
                        'fee_amount',
                        'status',
                        'payment_reference',
                        'payment_method',
                        'winner_details',
                        'updated_at',
                    ]
                )
            else:
                WinnerDetailsUnlock.objects.create(
                    auction=auction,
                    seller=user,
                    winner_details=details,
                    fee_amount=fee_amount,
                    currency='BDT',
                    status=WinnerDetailsUnlock.Status.PENDING,
                    payment_reference=tran_id,
                    payment_method='SSLCOMMERZ',
                )

            return {
                'auction_id': auction.pk,
                'status': 'PENDING',
                'is_unlocked': False,
                'already_unlocked': False,
                'fee_amount': fee_amount,
                'currency': 'BDT',
                'payment_reference': tran_id,
                'unlocked_at': None,
                'gateway': 'sslcommerz',
                'gateway_url': gateway_url,
            }

    @classmethod
    def handle_sslcommerz_success(cls, tran_id: str, val_id: str, post_data: dict) -> int:
        """Process verified SSLCommerz payment callback and grant persistent unlock access.

        Returns auction_id.
        """
        from .models import WinnerDetailsUnlock
        from .sslcommerz import validate_sslcommerz_payment

        val_data = validate_sslcommerz_payment(val_id)

        with transaction.atomic():
            unlock = (
                WinnerDetailsUnlock.objects.select_for_update()
                .filter(payment_reference=tran_id)
                .first()
            )
            if unlock is None:
                # Fallback: check value_a (auction_id)
                auction_id_val = post_data.get('value_a') or val_data.get('value_a')
                if auction_id_val:
                    unlock = (
                        WinnerDetailsUnlock.objects.select_for_update()
                        .filter(auction_id=int(auction_id_val))
                        .first()
                    )

            if unlock is None:
                raise WinnerDetailsUnlockValidationError(
                    f'Unlock record for transaction {tran_id} not found.'
                )

            if unlock.status == WinnerDetailsUnlock.Status.PAID:
                return unlock.auction_id

            now = timezone.now()
            unlock.status = WinnerDetailsUnlock.Status.PAID
            unlock.val_id = val_id
            unlock.bank_tran_id = post_data.get('bank_tran_id') or val_data.get('bank_tran_id', '')
            unlock.card_type = post_data.get('card_type') or val_data.get('card_type', '')
            unlock.payment_method = 'SSLCOMMERZ'
            unlock.paid_at = now
            unlock.unlocked_at = now

            if unlock.winner_details is None and hasattr(unlock.auction, 'winner_fulfillment_details'):
                unlock.winner_details = unlock.auction.winner_fulfillment_details

            unlock.save(
                update_fields=[
                    'status',
                    'val_id',
                    'bank_tran_id',
                    'card_type',
                    'payment_method',
                    'paid_at',
                    'unlocked_at',
                    'winner_details',
                    'updated_at',
                ]
            )

            from notifications.services import schedule_winner_details_unlocked_notification

            schedule_winner_details_unlocked_notification(
                buyer_id=unlock.auction.winning_bidder_id,
                auction_id=unlock.auction.pk,
                product_title=unlock.auction.product.title if unlock.auction.product else f'Auction #{unlock.auction.pk}',
            )

            return unlock.auction_id

    @classmethod
    def handle_sslcommerz_fail(cls, tran_id: str, post_data: dict) -> int:
        """Mark unlock status as FAILED if not already PAID."""
        from .models import WinnerDetailsUnlock

        with transaction.atomic():
            unlock = (
                WinnerDetailsUnlock.objects.select_for_update()
                .filter(payment_reference=tran_id)
                .first()
            )
            if unlock is not None and unlock.status != WinnerDetailsUnlock.Status.PAID:
                unlock.status = WinnerDetailsUnlock.Status.FAILED
                unlock.save(update_fields=['status', 'updated_at'])
                return unlock.auction_id
            return unlock.auction_id if unlock else 0

    @classmethod
    def handle_sslcommerz_cancel(cls, tran_id: str, post_data: dict) -> int:
        """Handle cancellation from SSLCommerz."""
        from .models import WinnerDetailsUnlock

        unlock = WinnerDetailsUnlock.objects.filter(payment_reference=tran_id).first()
        return unlock.auction_id if unlock else 0

    @classmethod
    def seller_has_access(cls, auction_id, user):
        """Return True if user is the seller and a valid PAID unlock record exists."""
        from .models import WinnerDetailsUnlock

        if not user or not getattr(user, 'is_authenticated', False):
            return False

        return WinnerDetailsUnlock.objects.filter(
            auction_id=auction_id,
            seller=user,
            status=WinnerDetailsUnlock.Status.PAID,
        ).exists()

    @classmethod
    def get_unlocked_details(cls, auction_id, user):
        """Retrieve latest buyer fulfillment details after verifying seller entitlement."""
        auction = cls.verify_seller_eligibility(auction_id, user, for_update=False)

        if not cls.seller_has_access(auction_id, user):
            raise WinnerDetailsUnlockForbidden(
                'Winner details must be unlocked before viewing.'
            )

        from .models import WinnerFulfillmentDetails

        try:
            details = auction.winner_fulfillment_details
        except WinnerFulfillmentDetails.DoesNotExist:
            raise WinnerDetailsUnlockValidationError(
                'Winner fulfillment details not found.'
            )

        if details.buyer_id != auction.winning_bidder_id:
            raise WinnerDetailsUnlockValidationError(
                'Fulfillment details record is invalid.'
            )

        return details


