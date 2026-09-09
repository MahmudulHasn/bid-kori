"""Destructive-delete integrity guards for Auction history.

Auction DELETE is allowed only while there is no bidder/payment reliance:

* auction has not started (``now < start_time``)
* no Bid rows
* no Payment row
* status is not CLOSED or CANCELLED

Applies to ordinary REST API destroy for all roles (including staff/ADMIN).
AuctionImages alone do not block deletion of an otherwise empty pre-start auction.
"""

from __future__ import annotations

from django.utils import timezone

from config.db_locking import apply_select_for_update

from .models import Auction, Bid, Payment

AUCTION_DELETE_BLOCKED_MESSAGE = (
    'This auction cannot be deleted after it has started or received bids.'
)


class AuctionDeletionPolicy:
    """Central checks for whether an Auction may be hard-deleted via the API."""

    @classmethod
    def can_delete(cls, auction, *, now=None) -> bool:
        """Return True only for pre-start auctions with no bids and no payment."""
        if now is None:
            now = timezone.now()

        if auction.status in (Auction.Status.CLOSED, Auction.Status.CANCELLED):
            return False

        if now >= auction.start_time:
            return False

        if Bid.objects.filter(auction_id=auction.pk).exists():
            return False

        if Payment.objects.filter(auction_id=auction.pk).exists():
            return False

        return True

    @classmethod
    def lock_auction(cls, auction_id: int) -> Auction:
        """Load an Auction row with a write lock when the backend supports it."""
        queryset = Auction.objects.select_related('product__seller')
        queryset = apply_select_for_update(queryset)
        return queryset.get(pk=auction_id)
