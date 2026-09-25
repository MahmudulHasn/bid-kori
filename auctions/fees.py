"""Successful-sale platform fee calculation (seller-side commission).

Mock checkout records a COMPLETED Payment as an accounting ledger entry —
not bank/gateway settlement. Fee snapshots are computed server-side with
Decimal math and stored immutably on each new completed Payment.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import NamedTuple

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

MONEY_QUANTUM = Decimal('0.01')
RATE_QUANTUM = Decimal('0.01')
ZERO = Decimal('0.00')
HUNDRED = Decimal('100.00')


class FeeSnapshot(NamedTuple):
    """Immutable successful-sale fee breakdown at 2dp money precision."""

    fee_rate: Decimal
    platform_fee: Decimal
    seller_net_amount: Decimal


class FeeCalculationError(ValueError):
    """Invalid gross amount or fee rate for snapshot calculation."""


def parse_platform_success_fee_percent(raw: str | Decimal | int | float) -> Decimal:
    """Parse and validate a platform success-fee percent (0–100 inclusive)."""
    try:
        value = Decimal(str(raw).strip())
    except (InvalidOperation, AttributeError) as exc:
        raise ImproperlyConfigured(
            'PLATFORM_SUCCESS_FEE_PERCENT must be a Decimal-compatible number '
            f'(got {raw!r}).'
        ) from exc

    if not value.is_finite():
        raise ImproperlyConfigured(
            'PLATFORM_SUCCESS_FEE_PERCENT must be a finite number.'
        )

    quantized = value.quantize(RATE_QUANTUM)
    if quantized < ZERO or quantized > HUNDRED:
        raise ImproperlyConfigured(
            'PLATFORM_SUCCESS_FEE_PERCENT must satisfy 0 <= rate <= 100 '
            f'(got {quantized}).'
        )
    return quantized


def get_platform_success_fee_percent() -> Decimal:
    """Return the configured platform success-fee percent (Decimal)."""
    configured = getattr(settings, 'PLATFORM_SUCCESS_FEE_PERCENT', None)
    if configured is None:
        return Decimal('2.00')
    if isinstance(configured, Decimal):
        return parse_platform_success_fee_percent(configured)
    return parse_platform_success_fee_percent(configured)


def calculate_sale_fee_snapshot(
    gross_amount: Decimal | str | int,
    fee_rate: Decimal | str | int,
) -> FeeSnapshot:
    """Compute seller-side commission snapshots for a successful sale.

    platform_fee = quantize(gross * rate / 100)
    seller_net_amount = quantize(gross - platform_fee)

    Invariant at stored precision: gross == platform_fee + seller_net_amount.
    """
    try:
        gross = Decimal(str(gross_amount))
    except (InvalidOperation, AttributeError) as exc:
        raise FeeCalculationError('gross_amount must be a Decimal-compatible number.') from exc

    try:
        rate = Decimal(str(fee_rate))
    except (InvalidOperation, AttributeError) as exc:
        raise FeeCalculationError('fee_rate must be a Decimal-compatible number.') from exc

    if not gross.is_finite() or not rate.is_finite():
        raise FeeCalculationError('gross_amount and fee_rate must be finite.')

    if gross < ZERO:
        raise FeeCalculationError('gross_amount must be >= 0.')
    if gross == ZERO:
        raise FeeCalculationError('gross_amount must be > 0 for a successful sale.')

    if rate < ZERO or rate > HUNDRED:
        raise FeeCalculationError('fee_rate must satisfy 0 <= rate <= 100.')

    gross = gross.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
    rate = rate.quantize(RATE_QUANTUM, rounding=ROUND_HALF_UP)

    platform_fee = (gross * rate / HUNDRED).quantize(
        MONEY_QUANTUM,
        rounding=ROUND_HALF_UP,
    )
    seller_net = (gross - platform_fee).quantize(
        MONEY_QUANTUM,
        rounding=ROUND_HALF_UP,
    )

    if platform_fee < ZERO or seller_net < ZERO:
        raise FeeCalculationError('platform_fee and seller_net_amount must be >= 0.')
    if platform_fee > gross:
        raise FeeCalculationError('platform_fee cannot exceed gross_amount.')
    if gross != platform_fee + seller_net:
        raise FeeCalculationError(
            'Invariant violated: gross_amount must equal platform_fee + seller_net_amount.'
        )

    return FeeSnapshot(
        fee_rate=rate,
        platform_fee=platform_fee,
        seller_net_amount=seller_net,
    )


DEFAULT_WINNER_DETAILS_UNLOCK_FEE_PERCENT = Decimal('2.00')


def parse_winner_details_unlock_fee(raw: str | Decimal | int | float) -> Decimal:
    """Parse and validate a seller winner-details unlock fee (non-negative Decimal)."""
    try:
        value = Decimal(str(raw).strip())
    except (InvalidOperation, AttributeError) as exc:
        raise ImproperlyConfigured(
            'WINNER_DETAILS_UNLOCK_FEE must be a Decimal-compatible number '
            f'(got {raw!r}).'
        ) from exc

    if not value.is_finite():
        raise ImproperlyConfigured(
            'WINNER_DETAILS_UNLOCK_FEE must be a finite number.'
        )

    quantized = value.quantize(MONEY_QUANTUM)
    if quantized < ZERO:
        raise ImproperlyConfigured(
            'WINNER_DETAILS_UNLOCK_FEE must be non-negative '
            f'(got {quantized}).'
        )
    return quantized


def calculate_winner_details_unlock_fee(total_amount: Decimal | str | int | float) -> Decimal:
    """Compute the fixed 2% seller unlock fee based on auction total winning amount.

    Formula: quantize(total_amount * 2 / 100, MONEY_QUANTUM, rounding=ROUND_HALF_UP)
    """
    try:
        amount = Decimal(str(total_amount))
    except (InvalidOperation, AttributeError) as exc:
        raise FeeCalculationError('total_amount must be a Decimal-compatible number.') from exc

    if not amount.is_finite():
        raise FeeCalculationError('total_amount must be finite.')

    if amount < ZERO:
        raise FeeCalculationError('total_amount must be >= 0.')

    rate = getattr(settings, 'WINNER_DETAILS_UNLOCK_FEE_PERCENT', DEFAULT_WINNER_DETAILS_UNLOCK_FEE_PERCENT)
    if isinstance(rate, (str, int, float)):
        try:
            rate = Decimal(str(rate))
        except (InvalidOperation, AttributeError):
            rate = DEFAULT_WINNER_DETAILS_UNLOCK_FEE_PERCENT

    quantized_amount = amount.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
    fee = (quantized_amount * rate / HUNDRED).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
    return fee


def get_winner_details_unlock_fee(auction=None) -> Decimal:
    """Return the seller winner-details unlock fee (2% of auction total amount).

    If an explicit override setting (WINNER_DETAILS_UNLOCK_FEE) is provided that differs
    from the default 50.00, it takes precedence.
    Otherwise, computes 2% of the auction's winning / total amount.
    """
    configured = getattr(settings, 'WINNER_DETAILS_UNLOCK_FEE', None)
    if configured is not None and configured != Decimal('50.00') and str(configured).strip() != '50.00':
        return parse_winner_details_unlock_fee(configured)

    if auction is not None:
        if hasattr(auction, 'current_highest_bid'):
            highest_bid = getattr(auction, 'current_highest_bid', None)
            starting_bid = getattr(auction, 'starting_bid', None)
            amount = highest_bid if (highest_bid and highest_bid > ZERO) else (starting_bid or ZERO)
        else:
            amount = auction
        return calculate_winner_details_unlock_fee(amount)

    if configured is not None:
        return parse_winner_details_unlock_fee(configured)

    return Decimal('50.00')


