"""Authoritative Seller mutation freeze for Auction economics and images.

Configuration and listing images are mutable only before bidder reliance:

* ``now < auction.start_time``
* no Bid rows exist
* status is not CLOSED or CANCELLED

Applies to ordinary API PATCH/PUT and image upload for all roles (including
staff/ADMIN). Lifecycle transitions (cancel/close) are separate and unaffected.
"""

from __future__ import annotations

from django.utils import timezone

from config.db_locking import apply_select_for_update

from .models import Auction, Bid

CONFIGURATION_EDIT_FROZEN_MESSAGE = (
    'This auction can no longer be edited after it has started or received bids.'
)

IMAGE_UPLOAD_FROZEN_MESSAGE = (
    'Images cannot be changed after the auction has started or received bids.'
)

PROTECTED_CONFIGURATION_FIELDS = frozenset(
    {
        'starting_bid',
        'min_increment',
        'reserve_price',
        'start_time',
        'end_time',
    }
)


class AuctionMutationPolicy:
    """Central freeze checks for Auction configuration and image mutations."""

    @classmethod
    def is_configuration_mutable(cls, auction, *, now=None) -> bool:
        """Return True only while the auction has not started and has no bids."""
        if now is None:
            now = timezone.now()

        if auction.status in (Auction.Status.CLOSED, Auction.Status.CANCELLED):
            return False

        if now >= auction.start_time:
            return False

        if Bid.objects.filter(auction_id=auction.pk).exists():
            return False

        return True

    @classmethod
    def lock_auction(cls, auction_id: int) -> Auction:
        """Load an Auction row with a write lock when the backend supports it."""
        queryset = Auction.objects.select_related('product__seller')
        queryset = apply_select_for_update(queryset)
        return queryset.get(pk=auction_id)
