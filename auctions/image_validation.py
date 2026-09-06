"""Auction listing image upload validation (content-based, not extension-only)."""

from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError

from config.image_validation import (
    DEFAULT_ALLOWED_FORMATS,
    validate_image_file,
)

__all__ = [
    'DEFAULT_ALLOWED_FORMATS',
    'allowed_image_formats',
    'max_image_bytes',
    'max_image_width',
    'max_image_height',
    'min_image_width',
    'min_image_height',
    'max_images_per_auction',
    'max_images_per_request',
    'validate_auction_image',
    'validate_auction_image_quota',
]


def _setting(name: str, default):
    return getattr(settings, name, default)


def allowed_image_formats() -> frozenset[str]:
    configured = _setting('AUCTION_IMAGE_ALLOWED_FORMATS', DEFAULT_ALLOWED_FORMATS)
    return frozenset(str(item).upper() for item in configured)


def max_image_bytes() -> int:
    return int(_setting('AUCTION_IMAGE_MAX_BYTES', 5 * 1024 * 1024))


def max_image_width() -> int:
    return int(_setting('AUCTION_IMAGE_MAX_WIDTH', 4096))


def max_image_height() -> int:
    return int(_setting('AUCTION_IMAGE_MAX_HEIGHT', 4096))


def min_image_width() -> int:
    return int(_setting('AUCTION_IMAGE_MIN_WIDTH', 1))


def min_image_height() -> int:
    return int(_setting('AUCTION_IMAGE_MIN_HEIGHT', 1))


def max_images_per_auction() -> int:
    return int(_setting('AUCTION_IMAGE_MAX_PER_AUCTION', 10))


def max_images_per_request() -> int:
    return int(_setting('AUCTION_IMAGE_MAX_PER_REQUEST', 5))


def validate_auction_image(uploaded_file) -> None:
    """Validate an uploaded file is a real, bounded image for AuctionImage."""
    validate_image_file(
        uploaded_file,
        max_bytes=max_image_bytes(),
        max_width=max_image_width(),
        max_height=max_image_height(),
        min_width=min_image_width(),
        min_height=min_image_height(),
        allowed_formats=allowed_image_formats(),
    )


def validate_auction_image_quota(*, auction, incoming_count: int) -> None:
    """Enforce per-request and per-auction image caps."""
    if incoming_count <= 0:
        raise ValidationError('No images provided.')
    if incoming_count > max_images_per_request():
        raise ValidationError(
            f'At most {max_images_per_request()} images can be uploaded per request.'
        )

    existing = auction.images.count() if auction is not None else 0
    if existing + incoming_count > max_images_per_auction():
        remaining = max(max_images_per_auction() - existing, 0)
        raise ValidationError(
            f'This auction may have at most {max_images_per_auction()} images '
            f'({remaining} remaining).'
        )
