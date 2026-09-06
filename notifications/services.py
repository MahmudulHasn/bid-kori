"""
Authoritative in-app notification creation (NT-B02) + live push (NT-B03).

Persistent Notification rows are the source of truth. Creation is scheduled via
``transaction.on_commit`` from bid/close domain services so rolled-back
transactions never leave orphan rows, and failures never affect auction state.

After a row is persisted, best-effort Channels push delivers
``notification.created`` to ``user_<id>``. Push failure never deletes the row.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Iterable

from django.db import transaction

from .models import Notification
from .realtime import broadcast_notification_created

logger = logging.getLogger(__name__)


def _format_money(value: Decimal | str | int | float) -> str:
    return f'{Decimal(str(value)):.2f}'


def _safe_create(**kwargs) -> Notification | None:
    """Create one notification; log and swallow unexpected failures."""
    try:
        return Notification.objects.create(**kwargs)
    except Exception:
        logger.exception(
            'Failed to create notification type=%s auction_id=%s user_id=%s',
            kwargs.get('type'),
            kwargs.get('auction_id') or getattr(kwargs.get('auction'), 'pk', None),
            kwargs.get('user_id') or getattr(kwargs.get('user'), 'pk', None),
        )
        return None


def _safe_create_and_push(**kwargs) -> Notification | None:
    """Persist then best-effort push. Push never undoes persistence."""
    notification = _safe_create(**kwargs)
    if notification is not None:
        try:
            broadcast_notification_created(notification)
        except Exception:
            logger.exception(
                'notification.created push raised after persist '
                'notification_id=%s user_id=%s',
                notification.pk,
                notification.user_id,
            )
    return notification


class NotificationService:
    """Create durable inbox rows for MVP auction notification types."""

    @classmethod
    def create_outbid_notification(
        cls,
        *,
        user_id: int,
        auction_id: int,
        product_title: str,
    ) -> Notification | None:
        title = "You've been outbid"
        message = (
            f'Another bidder placed a higher bid on {product_title}.'
        )
        return _safe_create_and_push(
            user_id=user_id,
            type=Notification.Type.OUTBID,
            title=title,
            message=message,
            auction_id=auction_id,
            is_read=False,
        )

    @classmethod
    def create_seller_new_bid_notification(
        cls,
        *,
        seller_id: int,
        auction_id: int,
        product_title: str,
        amount: Decimal | str | int | float,
    ) -> Notification | None:
        title = 'New bid received'
        message = (
            f'A new bid of {_format_money(amount)} was placed on {product_title}.'
        )
        return _safe_create_and_push(
            user_id=seller_id,
            type=Notification.Type.SELLER_NEW_BID,
            title=title,
            message=message,
            auction_id=auction_id,
            is_read=False,
        )

    @classmethod
    def create_auction_won_notification(
        cls,
        *,
        user_id: int,
        auction_id: int,
        product_title: str,
        final_amount: Decimal | str | int | float,
    ) -> Notification | None:
        """Idempotent for (user, AUCTION_WON, auction). Push only on first create."""
        existing = Notification.objects.filter(
            user_id=user_id,
            type=Notification.Type.AUCTION_WON,
            auction_id=auction_id,
        ).first()
        if existing is not None:
            return existing

        title = 'You won the auction'
        message = (
            f'You won {product_title} with a final bid of '
            f'{_format_money(final_amount)}.'
        )
        return _safe_create_and_push(
            user_id=user_id,
            type=Notification.Type.AUCTION_WON,
            title=title,
            message=message,
            auction_id=auction_id,
            is_read=False,
        )

    @classmethod
    def create_auction_lost_notifications(
        cls,
        *,
        loser_user_ids: Iterable[int],
        auction_id: int,
        product_title: str,
    ) -> int:
        """Create one AUCTION_LOST per unique loser; skip existing rows.

        Returns the number of newly created rows. Each new row is pushed to
        that loser's private group only.
        """
        unique_ids = sorted({int(uid) for uid in loser_user_ids if uid is not None})
        if not unique_ids:
            return 0

        existing = set(
            Notification.objects.filter(
                auction_id=auction_id,
                type=Notification.Type.AUCTION_LOST,
                user_id__in=unique_ids,
            ).values_list('user_id', flat=True)
        )
        to_create = [
            Notification(
                user_id=user_id,
                type=Notification.Type.AUCTION_LOST,
                title='Auction ended',
                message=f'You did not win {product_title}.',
                auction_id=auction_id,
                is_read=False,
            )
            for user_id in unique_ids
            if user_id not in existing
        ]
        if not to_create:
            return 0
        try:
            created = Notification.objects.bulk_create(to_create)
        except Exception:
            logger.exception(
                'Failed to bulk-create AUCTION_LOST notifications '
                'auction_id=%s loser_count=%s',
                auction_id,
                len(to_create),
            )
            return 0

        for note in created:
            try:
                broadcast_notification_created(note)
            except Exception:
                logger.exception(
                    'AUCTION_LOST push raised after persist '
                    'notification_id=%s user_id=%s',
                    getattr(note, 'pk', None),
                    getattr(note, 'user_id', None),
                )
        return len(created)

    @classmethod
    def notify_after_successful_bid(
        cls,
        *,
        auction_id: int,
        bidder_id: int,
        seller_id: int,
        previous_bidder_id: int | None,
        amount: Decimal | str | int | float,
        product_title: str,
    ) -> None:
        """Create OUTBID (if applicable) + SELLER_NEW_BID for a committed bid."""
        if (
            previous_bidder_id is not None
            and previous_bidder_id != bidder_id
        ):
            cls.create_outbid_notification(
                user_id=previous_bidder_id,
                auction_id=auction_id,
                product_title=product_title,
            )

        cls.create_seller_new_bid_notification(
            seller_id=seller_id,
            auction_id=auction_id,
            product_title=product_title,
            amount=amount,
        )

    @classmethod
    def notify_after_auction_closed(
        cls,
        *,
        auction_id: int,
        winning_bidder_id: int | None,
        final_amount: Decimal | str | int | float,
        product_title: str,
        loser_user_ids: Iterable[int],
    ) -> None:
        """Create AUCTION_WON / AUCTION_LOST after a real ACTIVE→CLOSED close.

        When there is no winner (no bids / reserve not met), create neither.
        """
        if winning_bidder_id is None:
            return

        cls.create_auction_won_notification(
            user_id=winning_bidder_id,
            auction_id=auction_id,
            product_title=product_title,
            final_amount=final_amount,
        )
        cls.create_auction_lost_notifications(
            loser_user_ids=loser_user_ids,
            auction_id=auction_id,
            product_title=product_title,
        )


def schedule_bid_placed_notifications(
    *,
    auction_id: int,
    bidder_id: int,
    seller_id: int,
    previous_bidder_id: int | None,
    amount: Decimal | str | int | float,
    product_title: str,
) -> None:
    """Register post-commit bid notification creation (call inside atomic)."""

    def _run():
        try:
            NotificationService.notify_after_successful_bid(
                auction_id=auction_id,
                bidder_id=bidder_id,
                seller_id=seller_id,
                previous_bidder_id=previous_bidder_id,
                amount=amount,
                product_title=product_title,
            )
        except Exception:
            logger.exception(
                'Bid notification side-effect failed auction_id=%s bidder_id=%s',
                auction_id,
                bidder_id,
            )

    transaction.on_commit(_run)


def schedule_auction_closed_notifications(
    *,
    auction_id: int,
    winning_bidder_id: int | None,
    final_amount: Decimal | str | int | float,
    product_title: str,
    loser_user_ids: list[int],
) -> None:
    """Register post-commit close notification creation (call inside atomic)."""

    def _run():
        try:
            NotificationService.notify_after_auction_closed(
                auction_id=auction_id,
                winning_bidder_id=winning_bidder_id,
                final_amount=final_amount,
                product_title=product_title,
                loser_user_ids=loser_user_ids,
            )
        except Exception:
            logger.exception(
                'Close notification side-effect failed auction_id=%s',
                auction_id,
            )

    transaction.on_commit(_run)
