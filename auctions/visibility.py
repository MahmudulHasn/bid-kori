"""Auction public-visibility helpers for Admin moderation (MOD-B01).

Public rule:
  auction.is_hidden == False AND auction.product.is_hidden == False
"""

from __future__ import annotations

from django.db.models import Q, QuerySet


def publicly_visible_auctions(queryset: QuerySet | None = None) -> QuerySet:
    """Auctions eligible for anonymous / public marketplace surfaces."""
    from .models import Auction

    qs = queryset if queryset is not None else Auction.objects.all()
    return qs.filter(is_hidden=False, product__is_hidden=False)


def auctions_visible_to_user(user, queryset: QuerySet | None = None) -> QuerySet:
    """List queryset with staff/seller/participant exceptions for history."""
    from .models import Auction

    qs = queryset if queryset is not None else Auction.objects.all()
    if user is not None and getattr(user, 'is_authenticated', False):
        if getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False):
            return qs
        return qs.filter(
            Q(is_hidden=False, product__is_hidden=False)
            | Q(product__seller_id=user.pk)
            | Q(winning_bidder_id=user.pk)
            | Q(bids__bidder_id=user.pk)
        ).distinct()
    return publicly_visible_auctions(qs)


def auction_is_publicly_visible(auction) -> bool:
    product = getattr(auction, 'product', None)
    product_hidden = bool(getattr(product, 'is_hidden', False)) if product else True
    return (not auction.is_hidden) and (not product_hidden)


def user_can_retrieve_auction(user, auction) -> bool:
    """True when ``user`` may retrieve this Auction detail."""
    if auction_is_publicly_visible(auction):
        return True
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False):
        return True
    product = getattr(auction, 'product', None)
    if product is not None and product.seller_id == getattr(user, 'pk', None):
        return True
    if auction.winning_bidder_id == getattr(user, 'pk', None):
        return True
    return auction.bids.filter(bidder_id=user.pk).exists()


def user_can_see_auction_moderation_reason(user, auction) -> bool:
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False):
        return True
    product = getattr(auction, 'product', None)
    return bool(product and product.seller_id == getattr(user, 'pk', None))


def auction_accepts_new_bids(auction) -> bool:
    """False when Admin hide (or hidden Product) blocks live bidding."""
    return auction_is_publicly_visible(auction)
