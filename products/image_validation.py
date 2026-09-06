"""Product catalog image upload validation (content-based)."""

from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError

from config.image_validation import (
    DEFAULT_ALLOWED_FORMATS,
    validate_image_file,
)


def _setting(name: str, default):
    return getattr(settings, name, default)


def allowed_product_image_formats() -> frozenset[str]:
    configured = _setting(
        'PRODUCT_IMAGE_ALLOWED_FORMATS',
        DEFAULT_ALLOWED_FORMATS,
    )
    return frozenset(str(item).upper() for item in configured)


def max_product_image_bytes() -> int:
    return int(_setting('PRODUCT_IMAGE_MAX_BYTES', 5 * 1024 * 1024))


def max_product_image_width() -> int:
    return int(_setting('PRODUCT_IMAGE_MAX_WIDTH', 4096))


def max_product_image_height() -> int:
    return int(_setting('PRODUCT_IMAGE_MAX_HEIGHT', 4096))


def min_product_image_width() -> int:
    return int(_setting('PRODUCT_IMAGE_MIN_WIDTH', 1))


def min_product_image_height() -> int:
    return int(_setting('PRODUCT_IMAGE_MIN_HEIGHT', 1))


def max_images_per_product() -> int:
    return int(_setting('PRODUCT_IMAGE_MAX_COUNT', 5))


def max_product_images_per_request() -> int:
    return int(_setting('PRODUCT_IMAGE_MAX_PER_REQUEST', 5))


def validate_product_image(uploaded_file) -> None:
    """Validate an uploaded file is a real, bounded image for ProductImage."""
    validate_image_file(
        uploaded_file,
        max_bytes=max_product_image_bytes(),
        max_width=max_product_image_width(),
        max_height=max_product_image_height(),
        min_width=min_product_image_width(),
        min_height=min_product_image_height(),
        allowed_formats=allowed_product_image_formats(),
    )


def validate_product_image_quota(*, product, incoming_count: int) -> None:
    """Enforce per-request and per-product image caps (all-or-nothing)."""
    if incoming_count <= 0:
        raise ValidationError('No images provided.')
    if incoming_count > max_product_images_per_request():
        raise ValidationError(
            f'At most {max_product_images_per_request()} images can be '
            f'uploaded per request.'
        )

    existing = product.images.count() if product is not None else 0
    if existing + incoming_count > max_images_per_product():
        remaining = max(max_images_per_product() - existing, 0)
        raise ValidationError(
            f'This product may have at most {max_images_per_product()} images '
            f'({remaining} remaining).'
        )
