"""Destructive-delete integrity guards for Product catalog rows.

Product DELETE must never cascade through an attached Auction and erase
Bids / AuctionImages / Payment history.

MVP rule:

* Product with no Auction → owner may delete
* Product linked to an Auction → DELETE rejected for all API callers
  (including staff/ADMIN)
"""

from __future__ import annotations

from django.db import connection

from auctions.models import Auction

from .models import Product

PRODUCT_DELETE_BLOCKED_MESSAGE = (
    'This product cannot be deleted because it is linked to an auction.'
)


class ProductDeletionPolicy:
    """Central checks for whether a Product may be hard-deleted via the API."""

    @classmethod
    def can_delete(cls, product) -> bool:
        """Return True only when the Product has no linked Auction."""
        return not Auction.objects.filter(product_id=product.pk).exists()

    @classmethod
    def lock_product(cls, product_id: int) -> Product:
        """Load a Product row with a write lock when the backend supports it."""
        queryset = Product.objects.select_related('seller', 'category')
        if connection.features.has_select_for_update:
            queryset = queryset.select_for_update()
        return queryset.get(pk=product_id)
