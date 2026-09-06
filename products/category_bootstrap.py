"""Idempotent MVP Category bootstrap helpers (CAT-B01).

Categories are marketplace metadata — Sellers select existing rows; they do not
create Categories through Product endpoints.
"""

from __future__ import annotations

from django.utils.text import slugify

from .models import Category

# Deterministic MVP catalog for fresh installs / Seller selector options.
MVP_CATEGORY_NAMES: tuple[str, ...] = (
    'Electronics',
    'Fashion',
    'Home & Living',
    'Vehicles',
    'Collectibles',
    'Sports & Outdoors',
    'Books & Media',
    'Beauty & Personal Care',
    'Toys & Hobbies',
    'Other',
)


def ensure_mvp_categories() -> tuple[list[Category], list[Category]]:
    """Create missing MVP categories without overwriting existing rows.

    Returns ``(created, existing)`` Category instances matched by unique ``name``.
    """
    created: list[Category] = []
    existing: list[Category] = []
    for name in MVP_CATEGORY_NAMES:
        category, was_created = Category.objects.get_or_create(
            name=name,
            defaults={'slug': slugify(name)},
        )
        if was_created:
            created.append(category)
        else:
            existing.append(category)
    return created, existing
