"""Celery tasks for auction lifecycle automation."""

from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name='auctions.tasks.close_expired_auctions_task')
def close_expired_auctions_task():
    """Periodically finalize expired ACTIVE auctions via the lifecycle service.

    Idempotent and safe under overlap with HTTP lazy-close, late bids, and the
    management command. Does not broadcast Channels events directly —
    ``auction.closed`` is emitted by RT-B02 inside ``_finalize_close``.
    """
    from .services import close_all_expired_auctions

    result = close_all_expired_auctions()
    logger.debug(
        'close_expired_auctions_task finished found=%s closed=%s failed=%s',
        result['found'],
        result['closed'],
        result['failed'],
    )
    return {
        'found': result['found'],
        'closed': result['closed'],
        'failed': result['failed'],
    }
