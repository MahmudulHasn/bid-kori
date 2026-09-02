"""Auction listing image upload validation (content-based, not extension-only)."""

from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from PIL import Image, UnidentifiedImageError

# Pillow format names (JPEG, not JPG).
DEFAULT_ALLOWED_FORMATS = frozenset({'JPEG', 'PNG', 'WEBP', 'GIF'})


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
    """Validate an uploaded file is a real, bounded image.

    Uses Pillow to inspect file *content* (format + dimensions). Filename
    extensions and declared content-types are not trusted as proof of type.
    """
    size = getattr(uploaded_file, 'size', None)
    if size is not None and size <= 0:
        raise ValidationError('Uploaded image file is empty.')
    if size is not None and size > max_image_bytes():
        raise ValidationError(
            f'Image file exceeds the maximum size of {max_image_bytes()} bytes.'
        )

    if not hasattr(uploaded_file, 'open') and not hasattr(uploaded_file, 'read'):
        raise ValidationError('Uploaded image file is unreadable.')

    # Ensure we can re-read after Pillow consumes the stream.
    if hasattr(uploaded_file, 'seek'):
        uploaded_file.seek(0)

    try:
        with Image.open(uploaded_file) as verified:
            verified.verify()
    except UnidentifiedImageError as exc:
        raise ValidationError(
            'File is not a valid image. Supported formats: JPEG, PNG, WEBP, GIF.'
        ) from exc
    except (OSError, ValueError, SyntaxError) as exc:
        raise ValidationError('Malformed or unreadable image file.') from exc
    finally:
        if hasattr(uploaded_file, 'seek'):
            uploaded_file.seek(0)

    try:
        with Image.open(uploaded_file) as image:
            fmt = (image.format or '').upper()
            if fmt == 'JPG':
                fmt = 'JPEG'
            if fmt not in allowed_image_formats():
                raise ValidationError(
                    f'Unsupported image format "{fmt or "unknown"}". '
                    f'Allowed: {", ".join(sorted(allowed_image_formats()))}.'
                )

            width, height = image.size
            if width < min_image_width() or height < min_image_height():
                raise ValidationError(
                    f'Image dimensions must be at least '
                    f'{min_image_width()}x{min_image_height()} pixels.'
                )
            if width > max_image_width() or height > max_image_height():
                raise ValidationError(
                    f'Image dimensions must not exceed '
                    f'{max_image_width()}x{max_image_height()} pixels.'
                )

            # Decode pixels to catch truncated / corrupt payloads that verify() misses.
            image.load()
    except ValidationError:
        raise
    except UnidentifiedImageError as exc:
        raise ValidationError(
            'File is not a valid image. Supported formats: JPEG, PNG, WEBP, GIF.'
        ) from exc
    except (OSError, ValueError, SyntaxError) as exc:
        raise ValidationError('Malformed or unreadable image file.') from exc
    finally:
        if hasattr(uploaded_file, 'seek'):
            uploaded_file.seek(0)


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
