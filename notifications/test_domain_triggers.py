"""
NT-B02 domain trigger tests: OUTBID / SELLER_NEW_BID / AUCTION_WON / AUCTION_LOST.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from auctions.models import Auction, Bid
from auctions.services import AuctionLifecycleService, BidService
from auctions.tasks import close_expired_auctions_task
from notifications.models import Notification
from notifications.services import (
    NotificationService,
    schedule_bid_placed_notifications,
)
from products.models import Product


class NotificationDomainTriggerTests(TestCase):
    """Bid/close → Notification row creation (post-commit)."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='nt_seller',
            email='nt_seller@test.com',
            password='pass12345',
        )
        self.buyer_a = User.objects.create_user(
            username='nt_buyer_a',
            email='a@test.com',
            password='pass12345',
        )
        self.buyer_b = User.objects.create_user(
            username='nt_buyer_b',
            email='b@test.com',
            password='pass12345',
        )
        self.buyer_c = User.objects.create_user(
            username='nt_buyer_c',
            email='c@test.com',
            password='pass12345',
        )
        self.now = timezone.now()
        self.product = Product.objects.create(
            seller=self.seller,
            title='Vintage Camera',
            description='notify me',
        )
        self.auction = Auction.objects.create(
            product=self.product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            start_time=self.now - timedelta(hours=1),
            end_time=self.now + timedelta(hours=2),
            status=Auction.Status.ACTIVE,
        )

    def _place(self, bidder, amount):
        with self.captureOnCommitCallbacks(execute=True):
            return BidService.place_bid(self.auction.pk, bidder, Decimal(str(amount)))

    def _close(self):
        with self.captureOnCommitCallbacks(execute=True):
            return AuctionLifecycleService.close_auction(self.auction.pk)

    def test_first_bid_seller_new_bid_no_outbid(self):
        self._place(self.buyer_a, '110.00')
        self.assertEqual(
            Notification.objects.filter(
                type=Notification.Type.OUTBID,
                auction=self.auction,
            ).count(),
            0,
        )
        seller_notes = Notification.objects.filter(
            user=self.seller,
            type=Notification.Type.SELLER_NEW_BID,
            auction=self.auction,
        )
        self.assertEqual(seller_notes.count(), 1)
        self.assertIn('Vintage Camera', seller_notes.get().message)
        self.assertIn('110.00', seller_notes.get().message)

    def test_outbid_notifies_previous_highest_only(self):
        self._place(self.buyer_a, '110.00')
        self._place(self.buyer_b, '130.00')

        outbids_a = Notification.objects.filter(
            user=self.buyer_a,
            type=Notification.Type.OUTBID,
            auction=self.auction,
        )
        self.assertEqual(outbids_a.count(), 1)
        self.assertIn('outbid', outbids_a.get().title.lower())
        self.assertEqual(
            Notification.objects.filter(
                user=self.buyer_b,
                type=Notification.Type.OUTBID,
            ).count(),
            0,
        )
        self.assertEqual(
            Notification.objects.filter(
                user=self.seller,
                type=Notification.Type.SELLER_NEW_BID,
            ).count(),
            2,
        )

    def test_self_rebid_no_outbid(self):
        self._place(self.buyer_a, '110.00')
        self._place(self.buyer_a, '130.00')
        self.assertEqual(
            Notification.objects.filter(
                user=self.buyer_a,
                type=Notification.Type.OUTBID,
            ).count(),
            0,
        )
        self.assertEqual(
            Notification.objects.filter(
                type=Notification.Type.SELLER_NEW_BID,
            ).count(),
            2,
        )

    def test_rejected_low_bid_creates_no_notifications(self):
        self._place(self.buyer_a, '110.00')
        before = Notification.objects.count()
        with self.assertRaises(ValidationError):
            self._place(self.buyer_b, '115.00')
        self.assertEqual(Notification.objects.count(), before)

    def test_seller_self_bid_creates_no_notifications(self):
        before = Notification.objects.count()
        with self.assertRaises(ValidationError):
            self._place(self.seller, '110.00')
        self.assertEqual(Notification.objects.count(), before)

    def test_late_bid_rejected_may_close_without_bid_notifications(self):
        self._place(self.buyer_a, '110.00')
        self.auction.end_time = timezone.now() - timedelta(seconds=1)
        self.auction.save(update_fields=['end_time'])

        bid_related_before = Notification.objects.filter(
            type__in=[
                Notification.Type.OUTBID,
                Notification.Type.SELLER_NEW_BID,
            ]
        ).count()

        with self.assertRaises(ValidationError):
            with self.captureOnCommitCallbacks(execute=True):
                BidService.place_bid(self.auction.pk, self.buyer_b, Decimal('200.00'))

        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CLOSED)
        # No additional bid-placed notifications from the rejected late bid.
        self.assertEqual(
            Notification.objects.filter(
                type__in=[
                    Notification.Type.OUTBID,
                    Notification.Type.SELLER_NEW_BID,
                ]
            ).count(),
            bid_related_before,
        )
        # Winner notification from close is allowed.
        self.assertEqual(
            Notification.objects.filter(
                user=self.buyer_a,
                type=Notification.Type.AUCTION_WON,
            ).count(),
            1,
        )

    def test_bid_rollback_skips_on_commit_notifications(self):
        with self.assertRaises(ValidationError):
            with transaction.atomic():
                schedule_bid_placed_notifications(
                    auction_id=self.auction.pk,
                    bidder_id=self.buyer_a.pk,
                    seller_id=self.seller.pk,
                    previous_bidder_id=None,
                    amount=Decimal('110.00'),
                    product_title='Vintage Camera',
                )
                raise ValidationError('force rollback')

        self.assertEqual(Notification.objects.count(), 0)

    def test_winner_and_unique_losers(self):
        self._place(self.buyer_a, '110.00')
        self._place(self.buyer_b, '130.00')
        self._place(self.buyer_a, '150.00')  # A bids twice; still unique loser if B wins
        self._place(self.buyer_c, '170.00')
        self._place(self.buyer_b, '190.00')  # B wins; A and C lose once each

        self._close()
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.winning_bidder_id, self.buyer_b.pk)

        self.assertEqual(
            Notification.objects.filter(
                user=self.buyer_b,
                type=Notification.Type.AUCTION_WON,
            ).count(),
            1,
        )
        self.assertEqual(
            Notification.objects.filter(
                user=self.buyer_b,
                type=Notification.Type.AUCTION_LOST,
            ).count(),
            0,
        )
        self.assertEqual(
            Notification.objects.filter(
                user=self.buyer_a,
                type=Notification.Type.AUCTION_LOST,
            ).count(),
            1,
        )
        self.assertEqual(
            Notification.objects.filter(
                user=self.buyer_c,
                type=Notification.Type.AUCTION_LOST,
            ).count(),
            1,
        )
        won = Notification.objects.get(
            user=self.buyer_b,
            type=Notification.Type.AUCTION_WON,
        )
        self.assertIn('190.00', won.message)
        self.assertNotIn('reserve', won.message.lower())

    def test_no_bids_close_no_won_lost(self):
        self._close()
        self.assertEqual(
            Notification.objects.filter(
                type__in=[
                    Notification.Type.AUCTION_WON,
                    Notification.Type.AUCTION_LOST,
                ]
            ).count(),
            0,
        )

    def test_reserve_not_met_no_won_lost_and_no_reserve_leak(self):
        self.auction.reserve_price = Decimal('500.00')
        self.auction.save(update_fields=['reserve_price'])
        self._place(self.buyer_a, '110.00')
        self._place(self.buyer_b, '130.00')
        self._close()
        self.auction.refresh_from_db()
        self.assertIsNone(self.auction.winning_bidder_id)

        terminal = Notification.objects.filter(
            type__in=[
                Notification.Type.AUCTION_WON,
                Notification.Type.AUCTION_LOST,
            ]
        )
        self.assertEqual(terminal.count(), 0)
        for note in Notification.objects.all():
            blob = f'{note.title} {note.message}'.lower()
            self.assertNotIn('500', blob)
            self.assertNotIn('reserve', blob)
            self.assertNotIn('@test.com', blob)
            self.assertNotIn('password', blob)

    def test_duplicate_close_no_duplicate_terminal_notifications(self):
        self._place(self.buyer_a, '110.00')
        self._place(self.buyer_b, '130.00')
        first, closed1 = self._close()
        self.assertTrue(closed1)
        won_count = Notification.objects.filter(
            type=Notification.Type.AUCTION_WON
        ).count()
        lost_count = Notification.objects.filter(
            type=Notification.Type.AUCTION_LOST
        ).count()

        second, closed2 = self._close()
        self.assertFalse(closed2)
        self.assertEqual(
            Notification.objects.filter(type=Notification.Type.AUCTION_WON).count(),
            won_count,
        )
        self.assertEqual(
            Notification.objects.filter(type=Notification.Type.AUCTION_LOST).count(),
            lost_count,
        )
        # Explicit idempotent create path.
        NotificationService.create_auction_won_notification(
            user_id=self.buyer_b.pk,
            auction_id=self.auction.pk,
            product_title='Vintage Camera',
            final_amount=Decimal('130.00'),
        )
        self.assertEqual(
            Notification.objects.filter(type=Notification.Type.AUCTION_WON).count(),
            won_count,
        )

    def test_celery_eager_close_creates_terminal_notifications(self):
        self._place(self.buyer_a, '110.00')
        self._place(self.buyer_b, '130.00')
        self.auction.end_time = timezone.now() - timedelta(seconds=1)
        self.auction.save(update_fields=['end_time'])

        with self.captureOnCommitCallbacks(execute=True):
            result = close_expired_auctions_task()
        self.assertEqual(result['closed'], 1)
        self.assertEqual(
            Notification.objects.filter(
                user=self.buyer_b,
                type=Notification.Type.AUCTION_WON,
            ).count(),
            1,
        )
        self.assertEqual(
            Notification.objects.filter(
                user=self.buyer_a,
                type=Notification.Type.AUCTION_LOST,
            ).count(),
            1,
        )

    def test_management_command_close_creates_terminal_notifications(self):
        product = Product.objects.create(
            seller=self.seller,
            title='Cmd Close Item',
            description='x',
        )
        auction = Auction.objects.create(
            product=product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            start_time=self.now - timedelta(hours=2),
            end_time=self.now - timedelta(seconds=5),
            status=Auction.Status.ACTIVE,
        )
        Bid.objects.create(
            auction=auction,
            bidder=self.buyer_a,
            amount=Decimal('150.00'),
        )
        auction.current_highest_bid = Decimal('150.00')
        auction.save(update_fields=['current_highest_bid'])

        with self.captureOnCommitCallbacks(execute=True):
            call_command('close_expired_auctions', stdout=StringIO())

        self.assertEqual(
            Notification.objects.filter(
                user=self.buyer_a,
                type=Notification.Type.AUCTION_WON,
                auction=auction,
            ).count(),
            1,
        )

    def test_recipient_sees_notification_via_api_other_user_does_not(self):
        self._place(self.buyer_a, '110.00')
        self._place(self.buyer_b, '130.00')

        token_a = Token.objects.create(user=self.buyer_a)
        token_b = Token.objects.create(user=self.buyer_b)
        client = APIClient()

        client.credentials(HTTP_AUTHORIZATION=f'Token {token_a.key}')
        response_a = client.get('/api/notifications/')
        self.assertEqual(response_a.status_code, 200)
        types_a = {row['type'] for row in response_a.data['results']}
        self.assertIn(Notification.Type.OUTBID, types_a)

        client.credentials(HTTP_AUTHORIZATION=f'Token {token_b.key}')
        response_b = client.get('/api/notifications/')
        types_b = {row['type'] for row in response_b.data['results']}
        self.assertNotIn(Notification.Type.OUTBID, types_b)

    def test_notification_failure_does_not_break_bid(self):
        with patch(
            'notifications.services.NotificationService.notify_after_successful_bid',
            side_effect=RuntimeError('notify boom'),
        ):
            with self.captureOnCommitCallbacks(execute=True):
                bid = BidService.place_bid(
                    self.auction.pk,
                    self.buyer_a,
                    Decimal('110.00'),
                )
        self.assertIsNotNone(bid.pk)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.current_highest_bid, Decimal('110.00'))

    def test_notification_failure_does_not_break_close(self):
        self._place(self.buyer_a, '110.00')
        with patch(
            'notifications.services.NotificationService.notify_after_auction_closed',
            side_effect=RuntimeError('close notify boom'),
        ):
            with self.captureOnCommitCallbacks(execute=True):
                auction, closed = AuctionLifecycleService.close_auction(
                    self.auction.pk
                )
        self.assertTrue(closed)
        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.CLOSED)
        self.assertEqual(auction.winning_bidder_id, self.buyer_a.pk)

    def test_multiple_legitimate_outbids_allowed(self):
        self._place(self.buyer_a, '110.00')
        self._place(self.buyer_b, '130.00')
        self._place(self.buyer_a, '150.00')
        self._place(self.buyer_b, '170.00')
        self.assertEqual(
            Notification.objects.filter(
                user=self.buyer_a,
                type=Notification.Type.OUTBID,
            ).count(),
            2,
        )
        self.assertEqual(
            Notification.objects.filter(
                user=self.buyer_b,
                type=Notification.Type.OUTBID,
            ).count(),
            1,
        )
