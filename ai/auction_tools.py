"""Server-side auction search & query tools for BidKori chatbot (CHAT-X02).

These functions query PostgreSQL directly. They are the chatbot's "tools" —
deterministic, fast, and never involve the LLM.

Rules:
- Only return public, non-hidden auctions in ACTIVE status (biddable window).
- Never expose bidder usernames, emails, or seller private data.
- Time remaining computed from ``end_time - timezone.now()`` (server truth).
- Current bid from ``current_highest_bid`` (database truth).
- Product images from first AuctionImage or first ProductImage.
"""

from __future__ import annotations

import logging
import math
from typing import Any

from django.conf import settings
from django.db.models import Q, Count
from django.utils import timezone

logger = logging.getLogger(__name__)

# Maximum number of auction cards to return in a single response.
MAX_RESULTS = 5


def _build_media_url(image_field) -> str | None:
    """Return absolute URL for an ImageField, or None."""
    if not image_field or not image_field.name:
        return None
    try:
        url = image_field.url
        # If MEDIA_URL is relative, prepend the site domain hint (best-effort).
        if url and not url.startswith(('http://', 'https://')):
            base = getattr(settings, 'SITE_URL', '').rstrip('/')
            if base:
                return f'{base}{url}'
        return url
    except Exception:
        return None


def _auction_to_card(auction) -> dict[str, Any]:
    """Serialize an Auction model instance into a chat-friendly card dict.

    Only public, safe fields are included. Never expose bidder identity,
    seller contact, reserve_price numeric value, or moderation internals.
    """
    now = timezone.now()
    end_time = auction.end_time
    ends_in_seconds = max(0, int((end_time - now).total_seconds())) if end_time else 0

    # Determine display status
    if auction.status == 'ACTIVE':
        if auction.start_time and auction.start_time > now:
            display_status = 'UPCOMING'
        elif end_time and end_time <= now:
            display_status = 'ENDED'
        else:
            display_status = 'LIVE'
    else:
        display_status = auction.status or 'UNKNOWN'

    # Product title and category
    product = getattr(auction, 'product', None)
    title = product.title if product else f'Auction #{auction.pk}'
    category_name = None
    if product and product.category:
        category_name = product.category.name

    # Image URL: prefer first AuctionImage, then first ProductImage
    image_url = None
    auction_images = auction.images.all()[:1]
    if auction_images:
        image_url = _build_media_url(auction_images[0].image)
    elif product:
        product_images = product.images.all()[:1]
        if product_images:
            image_url = _build_media_url(product_images[0].image)

    # Bid count
    bid_count = getattr(auction, '_bid_count', None)
    if bid_count is None:
        bid_count = auction.bids.count()

    return {
        'auction_id': auction.pk,
        'title': title,
        'image_url': image_url,
        'current_bid': str(auction.current_highest_bid),
        'starting_bid': str(auction.starting_bid),
        'bid_count': bid_count,
        'ends_in_seconds': ends_in_seconds,
        'status': display_status,
        'category_name': category_name,
        'has_reserve': bool(auction.reserve_price),
        'reserve_met': (
            auction.current_highest_bid >= auction.reserve_price
            if auction.reserve_price
            else None
        ),
        'href': f'/auctions/{auction.pk}',
    }


def _base_active_qs():
    """Return a queryset of currently biddable, non-hidden auctions."""
    from auctions.models import Auction

    now = timezone.now()
    return (
        Auction.objects
        .filter(
            status=Auction.Status.ACTIVE,
            start_time__lte=now,
            end_time__gt=now,
            is_hidden=False,
        )
        .select_related('product', 'product__category')
        .prefetch_related('images', 'product__images')
        .annotate(_bid_count=Count('bids'))
    )


def search_live_auctions(
    *,
    query: str | None = None,
    category: str | None = None,
    max_price: float | None = None,
    min_price: float | None = None,
    condition: str | None = None,
    sort_by: str = 'ending_soon',
    limit: int = MAX_RESULTS,
) -> list[dict[str, Any]]:
    """Search currently live auctions by keyword, category, price range, or condition.

    Args:
        query: Free-text search against product title and description.
        category: Category name (case-insensitive partial match).
        max_price: Maximum current_highest_bid filter.
        min_price: Minimum current_highest_bid filter.
        condition: Product condition filter (NEW, USED_LIKE_NEW, etc.).
        sort_by: One of 'ending_soon', 'price_asc', 'price_desc', 'newest'.
        limit: Max results to return (capped at MAX_RESULTS).

    Returns:
        List of auction card dicts.
    """
    qs = _base_active_qs()

    if query:
        terms = query.strip()
        qs = qs.filter(
            Q(product__title__icontains=terms)
            | Q(product__description__icontains=terms)
        )

    if category:
        qs = qs.filter(product__category__name__icontains=category.strip())

    if max_price is not None:
        qs = qs.filter(current_highest_bid__lte=max_price)

    if min_price is not None:
        qs = qs.filter(current_highest_bid__gte=min_price)

    if condition:
        qs = qs.filter(product__condition__iexact=condition.strip())

    # Ordering
    if sort_by == 'price_asc':
        qs = qs.order_by('current_highest_bid', 'end_time')
    elif sort_by == 'price_desc':
        qs = qs.order_by('-current_highest_bid', 'end_time')
    elif sort_by == 'newest':
        qs = qs.order_by('-created_at')
    else:  # ending_soon (default)
        qs = qs.order_by('end_time')

    safe_limit = min(max(1, limit), MAX_RESULTS)
    auctions = list(qs[:safe_limit])
    return [_auction_to_card(a) for a in auctions]


def search_by_category(
    category_name: str,
    *,
    limit: int = MAX_RESULTS,
) -> list[dict[str, Any]]:
    """Find live auctions in a specific category."""
    return search_live_auctions(category=category_name, limit=limit)


def get_auction_details(auction_id: int) -> dict[str, Any] | None:
    """Fetch public details of a single auction by ID.

    Returns None if the auction doesn't exist, is hidden, or is not active.
    """
    from auctions.models import Auction

    try:
        auction = (
            Auction.objects
            .filter(pk=auction_id, is_hidden=False)
            .select_related('product', 'product__category')
            .prefetch_related('images', 'product__images')
            .annotate(_bid_count=Count('bids'))
            .first()
        )
    except Exception:
        return None

    if not auction:
        return None

    return _auction_to_card(auction)


def get_current_bid(auction_id: int) -> dict[str, Any] | None:
    """Get the current highest bid for an auction."""
    details = get_auction_details(auction_id)
    if not details:
        return None
    return {
        'auction_id': details['auction_id'],
        'title': details['title'],
        'current_bid': details['current_bid'],
        'starting_bid': details['starting_bid'],
        'bid_count': details['bid_count'],
        'status': details['status'],
        'href': details['href'],
    }


def get_time_remaining(auction_id: int) -> dict[str, Any] | None:
    """Get time remaining for an auction."""
    details = get_auction_details(auction_id)
    if not details:
        return None
    return {
        'auction_id': details['auction_id'],
        'title': details['title'],
        'ends_in_seconds': details['ends_in_seconds'],
        'status': details['status'],
        'href': details['href'],
    }


def get_ending_soon(*, limit: int = MAX_RESULTS) -> list[dict[str, Any]]:
    """Get auctions ending soonest."""
    return search_live_auctions(sort_by='ending_soon', limit=limit)


def get_categories_with_counts() -> list[dict[str, Any]]:
    """List all categories with their active auction counts."""
    from products.models import Category
    from auctions.models import Auction

    now = timezone.now()
    categories = (
        Category.objects
        .annotate(
            active_auction_count=Count(
                'products__auction',
                filter=Q(
                    products__auction__status=Auction.Status.ACTIVE,
                    products__auction__start_time__lte=now,
                    products__auction__end_time__gt=now,
                    products__auction__is_hidden=False,
                ),
            )
        )
        .order_by('-active_auction_count', 'name')
    )

    result = []
    for cat in categories:
        image_url = _build_media_url(cat.image) if cat.image else None
        result.append({
            'id': cat.pk,
            'name': cat.name,
            'slug': cat.slug,
            'image_url': image_url,
            'active_auction_count': cat.active_auction_count,
        })
    return result


def get_auction_count() -> int:
    """Count currently live auctions."""
    from auctions.models import Auction

    now = timezone.now()
    return Auction.objects.filter(
        status=Auction.Status.ACTIVE,
        start_time__lte=now,
        end_time__gt=now,
        is_hidden=False,
    ).count()


def format_time_remaining(seconds: int) -> str:
    """Format seconds into a human-readable time remaining string."""
    if seconds <= 0:
        return 'ended'
    if seconds < 60:
        return f'{seconds}s'
    minutes = seconds // 60
    if minutes < 60:
        secs = seconds % 60
        return f'{minutes}m {secs}s' if secs > 0 else f'{minutes}m'
    hours = minutes // 60
    remaining_mins = minutes % 60
    if hours < 24:
        return f'{hours}h {remaining_mins}m' if remaining_mins > 0 else f'{hours}h'
    days = hours // 24
    remaining_hours = hours % 24
    return f'{days}d {remaining_hours}h' if remaining_hours > 0 else f'{days}d'


def format_taka(amount_str: str) -> str:
    """Format a decimal string as BDT currency."""
    try:
        amount = float(amount_str)
        if amount == int(amount):
            return f'৳{int(amount):,}'
        return f'৳{amount:,.2f}'
    except (ValueError, TypeError):
        return f'৳{amount_str}'
