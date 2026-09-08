"""Product public-visibility helpers for Admin moderation (MOD-B01)."""

from __future__ import annotations

from django.db.models import Q, QuerySet


def publicly_visible_products(queryset: QuerySet | None = None) -> QuerySet:
    """Products eligible for anonymous / public marketplace surfaces."""
    from .models import Product

    qs = queryset if queryset is not None else Product.objects.all()
    return qs.filter(is_hidden=False)


def products_visible_to_user(user, queryset: QuerySet | None = None) -> QuerySet:
    """List queryset: public + staff/all + seller-owned hidden rows."""
    from .models import Product

    qs = queryset if queryset is not None else Product.objects.all()
    if user is not None and getattr(user, 'is_authenticated', False):
        if getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False):
            return qs
        return qs.filter(Q(is_hidden=False) | Q(seller_id=user.pk))
    return publicly_visible_products(qs)


def user_can_retrieve_product(user, product) -> bool:
    """True when ``user`` may retrieve this Product detail."""
    if not product.is_hidden:
        return True
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False):
        return True
    return product.seller_id == getattr(user, 'pk', None)


def user_can_see_product_moderation_reason(user, product) -> bool:
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False):
        return True
    return product.seller_id == getattr(user, 'pk', None)
