"""Helpers for row locks that stay valid on PostgreSQL with select_related.

PostgreSQL rejects ``SELECT FOR UPDATE`` when nullable ``select_related``
relations introduce OUTER JOINs (``winning_bidder``, ``payment``,
``category``, etc.). Lock only the primary table via ``of=('self',)`` when
the backend supports it.
"""

from __future__ import annotations

from django.db import connection


def apply_select_for_update(queryset):
    """Apply ``select_for_update`` safely for Postgres nullable joins."""
    if not connection.features.has_select_for_update:
        return queryset
    if connection.features.has_select_for_update_of:
        return queryset.select_for_update(of=('self',))
    return queryset.select_for_update()
