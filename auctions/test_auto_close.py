"""
Tests for automatic expired-auction closing (AC-B01).

Celery runs in eager mode during ``manage.py test`` (no broker required).
WebSocket assertions reuse the in-memory channel layer from RT-B01/RT-B02.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from io import StringIO

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from config.asgi import application
from products.models import Product

from .models import Auction, Bid
from .realtime import AUCTION_CLOSED_EVENT
from .services import BidService, close_all_expired_auctions
from .tasks import close_expired_auctions_task


class CloseAllExpiredAuctionsTests(TestCase):
    """Shared helper used by the management command and Celery task."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='ac_seller',
            email='ac_seller@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='ac_buyer',
            email='ac_buyer@test.com',
            password='pass12345',
        )
        self.now = timezone.now()

    def _product(self, title='AC Item'):
        return Product.objects.create(
            seller=self.seller,
            title=title,
            description='auto close',
        )

    def _auction(self, *, expired=True, status=Auction.Status.ACTIVE, **overrides):
        defaults = {
            'product': self._product(),
            'starting_bid': Decimal('100.00'),
            'current_highest_bid': Decimal('100.00'),
            'min_increment': Decimal('10.00'),
            'start_time': self.now - timedelta(hours=2),
            'end_time': (
                self.now - timedelta(seconds=5)
                if expired
                else self.now + timedelta(hours=1)
            ),
            'status': status,
        }
        defaults.update(overrides)
        # Unique product per auction when product not overridden.
        if 'product' not in overrides:
            defaults['product'] = self._product(title=f'AC {Auction.objects.count()}')
        return Auction.objects.create(**defaults)

    def test_future_active_auction_untouched(self):
        future = self._auction(expired=False)
        result = close_all_expired_auctions()
        future.refresh_from_db()
        self.assertEqual(result['found'], 0)
        self.assertEqual(result['closed'], 0)
        self.assertEqual(future.status, Auction.Status.ACTIVE)

    def test_expired_active_auction_closed(self):
        expired = self._auction(expired=True)
        result = close_all_expired_auctions()
        expired.refresh_from_db()
        self.assertEqual(result['found'], 1)
        self.assertEqual(result['closed'], 1)
        self.assertEqual(expired.status, Auction.Status.CLOSED)

    def test_multiple_expired_auctions_all_finalized(self):
        a = self._auction(expired=True)
        b = self._auction(expired=True)
        future = self._auction(expired=False)
        result = close_all_expired_auctions()
        a.refresh_from_db()
        b.refresh_from_db()
        future.refresh_from_db()
        self.assertEqual(result['found'], 2)
        self.assertEqual(result['closed'], 2)
        self.assertEqual(a.status, Auction.Status.CLOSED)
        self.assertEqual(b.status, Auction.Status.CLOSED)
        self.assertEqual(future.status, Auction.Status.ACTIVE)

    def test_terminal_auctions_ignored(self):
        closed = self._auction(expired=True, status=Auction.Status.CLOSED)
        cancelled = self._auction(expired=True, status=Auction.Status.CANCELLED)
        result = close_all_expired_auctions()
        closed.refresh_from_db()
        cancelled.refresh_from_db()
        self.assertEqual(result['found'], 0)
        self.assertEqual(result['closed'], 0)
        self.assertEqual(closed.status, Auction.Status.CLOSED)
        self.assertEqual(cancelled.status, Auction.Status.CANCELLED)

    def test_winner_finalized_from_highest_bid(self):
        auction = self._auction(expired=True, reserve_price=None)
        Bid.objects.create(
            auction=auction,
            bidder=self.buyer,
            amount=Decimal('175.00'),
        )
        auction.current_highest_bid = Decimal('175.00')
        auction.save(update_fields=['current_highest_bid'])

        result = close_all_expired_auctions()
        auction.refresh_from_db()
        self.assertEqual(result['closed'], 1)
        self.assertEqual(auction.status, Auction.Status.CLOSED)
        self.assertEqual(auction.winning_bidder_id, self.buyer.pk)
        self.assertEqual(auction.current_highest_bid, Decimal('175.00'))

    def test_reserve_not_met_closes_without_winner(self):
        auction = self._auction(
            expired=True,
            reserve_price=Decimal('500.00'),
        )
        Bid.objects.create(
            auction=auction,
            bidder=self.buyer,
            amount=Decimal('200.00'),
        )
        auction.current_highest_bid = Decimal('200.00')
        auction.save(update_fields=['current_highest_bid'])

        result = close_all_expired_auctions()
        auction.refresh_from_db()
        self.assertEqual(result['closed'], 1)
        self.assertEqual(auction.status, Auction.Status.CLOSED)
        self.assertIsNone(auction.winning_bidder_id)
        self.assertEqual(auction.current_highest_bid, Decimal('200.00'))

    def test_no_bids_closes_with_null_winner(self):
        auction = self._auction(expired=True)
        result = close_all_expired_auctions()
        auction.refresh_from_db()
        self.assertEqual(result['closed'], 1)
        self.assertEqual(auction.status, Auction.Status.CLOSED)
        self.assertIsNone(auction.winning_bidder_id)

    def test_idempotent_second_run(self):
        auction = self._auction(expired=True)
        first = close_all_expired_auctions()
        auction.refresh_from_db()
        winner_before = auction.winning_bidder_id
        status_before = auction.status
        highest_before = auction.current_highest_bid

        second = close_all_expired_auctions()
        auction.refresh_from_db()

        self.assertEqual(first['closed'], 1)
        self.assertEqual(second['found'], 0)
        self.assertEqual(second['closed'], 0)
        self.assertEqual(auction.status, status_before)
        self.assertEqual(auction.winning_bidder_id, winner_before)
        self.assertEqual(auction.current_highest_bid, highest_before)

    def test_celery_task_closes_expired(self):
        auction = self._auction(expired=True)
        result = close_expired_auctions_task()
        auction.refresh_from_db()
        self.assertEqual(result['closed'], 1)
        self.assertEqual(auction.status, Auction.Status.CLOSED)

    def test_management_command_still_closes(self):
        auction = self._auction(expired=True)
        Bid.objects.create(
            auction=auction,
            bidder=self.buyer,
            amount=Decimal('130.00'),
        )
        auction.current_highest_bid = Decimal('130.00')
        auction.save(update_fields=['current_highest_bid'])

        out = StringIO()
        call_command('close_expired_auctions', stdout=out)
        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.CLOSED)
        self.assertEqual(auction.winning_bidder_id, self.buyer.pk)
        self.assertIn('Closed 1', out.getvalue())

    def test_late_bid_rejected_before_scheduler_runs(self):
        auction = self._auction(expired=True)
        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, self.buyer, Decimal('150.00'))
        auction.refresh_from_db()
        # Late-bid path may close immediately; either way bidding must fail.
        self.assertEqual(auction.status, Auction.Status.CLOSED)
        self.assertFalse(
            Bid.objects.filter(auction=auction, amount=Decimal('150.00')).exists()
        )


class CloseExpiredAuctionsRealtimeTests(TransactionTestCase):
    """Scheduled close path emits auction.closed via existing RT-B02 hooks."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='ac_rt_seller',
            email='ac_rt_seller@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='ac_rt_buyer',
            email='ac_rt_buyer@test.com',
            password='pass12345',
        )
        now = timezone.now()
        self.auction = Auction.objects.create(
            product=Product.objects.create(
                seller=self.seller,
                title='AC RT Item',
                description='auto close realtime',
            ),
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(seconds=5),
            status=Auction.Status.ACTIVE,
        )
        Bid.objects.create(
            auction=self.auction,
            bidder=self.buyer,
            amount=Decimal('160.00'),
        )
        self.auction.current_highest_bid = Decimal('160.00')
        self.auction.save(update_fields=['current_highest_bid'])

    def _communicator(self, auction_id: int) -> WebsocketCommunicator:
        return WebsocketCommunicator(
            application,
            f'/ws/auctions/{auction_id}/',
            headers=[(b'origin', b'http://localhost')],
        )

    def test_task_emits_one_auction_closed(self):
        auction_id = self.auction.pk
        buyer_id = self.buyer.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            result = await database_sync_to_async(close_expired_auctions_task)()
            self.assertEqual(result['closed'], 1)

            event = await communicator.receive_json_from(timeout=2)
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))

            # Second run must not emit another close event.
            second = await database_sync_to_async(close_expired_auctions_task)()
            self.assertEqual(second['closed'], 0)
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))

            await communicator.disconnect()
            return event

        event = async_to_sync(_run)()
        self.assertEqual(event['type'], AUCTION_CLOSED_EVENT)
        self.assertEqual(event['auction_id'], auction_id)
        self.assertEqual(event['status'], 'CLOSED')
        self.assertEqual(
            event['winning_bidder'],
            {'id': buyer_id, 'username': 'ac_rt_buyer'},
        )
