"""Exact Payment-ledger financial aggregates (mock checkout accounting).

All monetization reads derive from COMPLETED Payment rows. Platform fee and
Seller net totals include only rows with populated fee snapshots. Legacy
COMPLETED Payments with null fee fields contribute to gross volume only and
are reported separately — never invented under the current fee rate.
"""

from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, Q, QuerySet, Sum
from django.db.models.functions import Coalesce

from .models import Payment

ZERO = Decimal('0.00')

# Valid immutable successful-sale fee snapshots (all three required).
FEE_SNAPSHOT_COMPLETE = (
    Q(fee_rate__isnull=False)
    & Q(platform_fee__isnull=False)
    & Q(seller_net_amount__isnull=False)
)


def money_str(value: Decimal | None) -> str:
    """Format aggregate money as a 2dp string (never float)."""
    amount = ZERO if value is None else Decimal(value)
    return f'{amount.quantize(ZERO):.2f}'


def completed_payments_queryset() -> QuerySet[Payment]:
    return Payment.objects.filter(status=Payment.Status.COMPLETED)


def seller_completed_payments(seller) -> QuerySet[Payment]:
    """COMPLETED Payments for auctions owned by ``seller``."""
    return (
        completed_payments_queryset()
        .filter(auction__product__seller_id=seller.pk)
        .select_related('auction', 'auction__product', 'user')
    )


def payment_has_fee_snapshot(*, fee_rate, platform_fee, seller_net_amount) -> bool:
    return (
        fee_rate is not None
        and platform_fee is not None
        and seller_net_amount is not None
    )


def summarize_completed_payments(queryset: QuerySet[Payment]) -> dict:
    """Exact aggregates over a COMPLETED Payment queryset (no slicing).

    Returns Decimal totals plus counts. Caller serializes to strings.
    """
    base = queryset.filter(status=Payment.Status.COMPLETED)
    totals = base.aggregate(
        completed_sales_count=Count('id'),
        gross=Coalesce(Sum('amount'), ZERO),
    )
    accounted = base.filter(FEE_SNAPSHOT_COMPLETE)
    accounted_totals = accounted.aggregate(
        accounted_sales_count=Count('id'),
        platform_fees=Coalesce(Sum('platform_fee'), ZERO),
        net_earnings=Coalesce(Sum('seller_net_amount'), ZERO),
    )
    legacy = base.exclude(FEE_SNAPSHOT_COMPLETE)
    legacy_totals = legacy.aggregate(
        legacy_completed_sales_count=Count('id'),
        legacy_gross=Coalesce(Sum('amount'), ZERO),
    )
    return {
        'completed_sales_count': totals['completed_sales_count'] or 0,
        'gross': totals['gross'] or ZERO,
        'accounted_sales_count': accounted_totals['accounted_sales_count'] or 0,
        'platform_fees': accounted_totals['platform_fees'] or ZERO,
        'net_earnings': accounted_totals['net_earnings'] or ZERO,
        'legacy_completed_sales_count': (
            legacy_totals['legacy_completed_sales_count'] or 0
        ),
        'legacy_gross': legacy_totals['legacy_gross'] or ZERO,
    }


def seller_earnings_summary(seller) -> dict:
    """Seller-scoped earnings summary (exact DB aggregates)."""
    data = summarize_completed_payments(seller_completed_payments(seller))
    return {
        'completed_sales_count': data['completed_sales_count'],
        'gross_sales': money_str(data['gross']),
        'platform_fees': money_str(data['platform_fees']),
        'net_earnings': money_str(data['net_earnings']),
        'accounted_sales_count': data['accounted_sales_count'],
        'legacy_completed_sales_count': data['legacy_completed_sales_count'],
        'legacy_gross_sales': money_str(data['legacy_gross']),
        'disclosure': (
            'Based on completed BidKori mock checkout ledger records. '
            'Not bank settlement or a withdrawable payout balance.'
        ),
    }


def admin_financial_summary() -> dict:
    """Platform-wide financial summary (exact DB aggregates)."""
    data = summarize_completed_payments(completed_payments_queryset())
    return {
        'completed_sales_count': data['completed_sales_count'],
        'gross_paid_volume': money_str(data['gross']),
        'platform_revenue': money_str(data['platform_fees']),
        'seller_net_total': money_str(data['net_earnings']),
        'accounted_sales_count': data['accounted_sales_count'],
        'legacy_completed_sales_count': data['legacy_completed_sales_count'],
        'legacy_gross_paid_volume': money_str(data['legacy_gross']),
        'disclosure': (
            'Mock completed checkout ledger totals. Platform revenue is the sum '
            'of stored platform_fee snapshots on COMPLETED Payments only — not '
            'bidding volume, unpaid closed auctions, or real bank settlement.'
        ),
    }
