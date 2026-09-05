"""Product catalog mutation freeze after linked Auction bidder reliance.

Product listing fields (title, description, condition, category) stay editable
until a linked Auction is frozen by the same rule as Auction configuration:

* ``now < auction.start_time``
* no Bid rows exist
* status is not CLOSED or CANCELLED

Standalone Products (no Auction) remain editable. Delete guards stay separate
(``ProductDeletionPolicy``). Applies to ordinary REST PATCH/PUT for all roles
including staff/ADMIN — consistent with ``AuctionMutationPolicy``.
"""

from __future__ import annotations

from django.core.exceptions import ObjectDoesNotExist
from django.db import connection

from auctions.mutation_policy import AuctionMutationPolicy

from .models import Product

PRODUCT_EDIT_FROZEN_MESSAGE = (
    'This product can no longer be edited after its auction has started '
    'or received bids.'
)


class ProductMutationPolicy:
    """Central checks for whether Product catalog metadata may be updated."""

    @classmethod
    def can_edit(cls, product, *, now=None) -> bool:
        """Return True when no linked Auction freezes catalog metadata.

        Fail closed when a linked Auction exists and is not configuration-mutable.
        """
        auction = cls._linked_auction(product)
        if auction is None:
            return True
        return AuctionMutationPolicy.is_configuration_mutable(auction, now=now)

    @classmethod
    def _linked_auction(cls, product):
        """Return the OneToOne Auction for ``product``, or None."""
        if hasattr(product, '_locked_auction'):
            return product._locked_auction

        try:
            return product.auction
        except ObjectDoesNotExist:
            return None

    @classmethod
    def lock_product_for_mutation(cls, product_id: int) -> Product:
        """Lock Product and linked Auction (when present) for freeze evaluation.

        Auction row locking mirrors ``AuctionMutationPolicy.lock_auction`` so Bid
        existence checks see a consistent snapshot under Postgres. SQLite has no
        true ``select_for_update`` — concurrency proof remains deferred there.
        """
        from auctions.models import Auction

        product_qs = Product.objects.select_related('seller', 'category')
        if connection.features.has_select_for_update:
            product_qs = product_qs.select_for_update()
        product = product_qs.get(pk=product_id)

        auction_qs = Auction.objects.filter(product_id=product.pk)
        if connection.features.has_select_for_update:
            auction_qs = auction_qs.select_for_update()
        product._locked_auction = auction_qs.first()
        return product
