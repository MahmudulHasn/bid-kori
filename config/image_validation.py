"""Shared content-based image upload validation (Pillow).

Auction and Product image validators call into ``validate_image_file`` with
domain-specific size / dimension / format limits. Filename extensions and
declared Content-Type headers are never treated as proof of file type.
"""

from __future__ import annotations

from django.core.exceptions import ValidationError
from PIL import Image, UnidentifiedImageError

# Pillow format names (JPEG, not JPG).
DEFAULT_ALLOWED_FORMATS = frozenset({'JPEG', 'PNG', 'WEBP', 'GIF'})


def validate_image_file(
    uploaded_file,
    *,
    max_bytes: int,
    max_width: int,
    max_height: int,
    min_width: int = 1,
    min_height: int = 1,
    allowed_formats: frozenset[str] | set[str] | tuple[str, ...] = DEFAULT_ALLOWED_FORMATS,
) -> None:
    """Validate an uploaded file is a real, bounded raster image."""
    allowed = frozenset(str(item).upper() for item in allowed_formats)

    size = getattr(uploaded_file, 'size', None)
    if size is not None and size <= 0:
        raise ValidationError('Uploaded image file is empty.')
    if size is not None and size > max_bytes:
        raise ValidationError(
            f'Image file exceeds the maximum size of {max_bytes} bytes.'
        )

    if not hasattr(uploaded_file, 'open') and not hasattr(uploaded_file, 'read'):
        raise ValidationError('Uploaded image file is unreadable.')

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
            if fmt not in allowed:
                raise ValidationError(
                    f'Unsupported image format "{fmt or "unknown"}". '
                    f'Allowed: {", ".join(sorted(allowed))}.'
                )

            width, height = image.size
            if width < min_width or height < min_height:
                raise ValidationError(
                    f'Image dimensions must be at least '
                    f'{min_width}x{min_height} pixels.'
                )
            if width > max_width or height > max_height:
                raise ValidationError(
                    f'Image dimensions must not exceed '
                    f'{max_width}x{max_height} pixels.'
                )

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
