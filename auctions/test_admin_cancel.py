"""Admin Auction cancel + auction.cancelled realtime (MOD-B02)."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import transaction
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from config.asgi import application
from products.models import Product
from users.models import UserProfile, ensure_user_profile

from .admin_moderation_views import hide_auction, restore_auction
from .models import Auction, Bid, Payment
from .realtime import (
    AUCTION_CANCELLED_EVENT,
    AUCTION_CLOSED_EVENT,
    build_auction_cancelled_payload,
    schedule_auction_cancelled_broadcast,
)
from .services import (
    AuctionLifecycleService,
    BidService,
    close_all_expired_auctions,
)


class AdminAuctionCancelAPITests(APITestCase):
    def setUp(self):
        self.seller = User.objects.create_user(
            username='cancel_seller',
            email='cancel_seller@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='cancel_buyer',
            email='cancel_buyer@test.com',
            password='pass12345',
        )
        self.buyer_b = User.objects.create_user(
            username='cancel_buyer_b',
            email='cancel_buyer_b@test.com',
            password='pass12345',
        )
        self.admin = User.objects.create_user(
            username='cancel_admin',
            email='cancel_admin@test.com',
            password='pass12345',
            is_staff=True,
        )
        self.superuser = User.objects.create_superuser(
            username='cancel_super',
            email='cancel_super@test.com',
            password='pass12345',
        )
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.buyer_b, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.admin, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.superuser, role=UserProfile.Role.SELLER)

        self.seller_token = Token.objects.create(user=self.seller)
        self.buyer_token = Token.objects.create(user=self.buyer)
        self.admin_token = Token.objects.create(user=self.admin)
        self.super_token = Token.objects.create(user=self.superuser)

        self.product = Product.objects.create(
            seller=self.seller,
            title='Cancel Target',
            description='Admin cancel fixture',
            condition=Product.Condition.USED_GOOD,
        )
        now = timezone.now()
        self.auction = Auction.objects.create(
            product=self.product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(days=1),
            status=Auction.Status.ACTIVE,
            is_featured=True,
        )

    def _auth(self, token):
        if token is None:
            self.client.credentials()
        else:
            self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def _cancel_url(self, auction_id=None):
        pk = auction_id if auction_id is not None else self.auction.pk
        return f'/api/admin/auctions/{pk}/cancel/'

    def test_staff_admin_can_cancel(self):
        Bid.objects.create(
            auction=self.auction,
            bidder=self.buyer,
            amount=Decimal('110.00'),
        )
        self.auction.current_highest_bid = Decimal('110.00')
        self.auction.winning_bidder = self.buyer
        self.auction.save(update_fields=['current_highest_bid', 'winning_bidder'])
        product_title = self.product.title

        self._auth(self.admin_token)
        response = self.client.post(
            self._cancel_url(),
            {'reason': 'Prohibited listing'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], Auction.Status.CANCELLED)
        self.assertIsNone(response.data['winning_bidder'])

        self.auction.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)
        self.assertIsNone(self.auction.winning_bidder_id)
        self.assertFalse(self.auction.is_paid)
        self.assertFalse(self.auction.is_hidden)
        self.assertEqual(self.auction.moderation_reason, 'Prohibited listing')
        self.assertEqual(self.auction.moderated_by_id, self.admin.pk)
        self.assertIsNotNone(self.auction.moderated_at)
        self.assertEqual(self.auction.is_featured, True)
        self.assertEqual(Bid.objects.filter(auction=self.auction).count(), 1)
        self.assertEqual(self.product.title, product_title)
        self.assertFalse(self.product.is_hidden)
        self.assertFalse(Payment.objects.filter(auction=self.auction).exists())

    def test_superuser_can_cancel(self):
        self._auth(self.super_token)
        response = self.client.post(self._cancel_url(), format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)

    def test_permissions_block_non_admin(self):
        for token in (None, self.buyer_token, self.seller_token):
            self._auth(token)
            response = self.client.post(
                self._cancel_url(),
                {'reason': 'x'},
                format='json',
            )
            self.assertIn(response.status_code, (401, 403), response.data)

    def test_no_generic_admin_mutation_methods(self):
        self._auth(self.admin_token)
        for method in ('patch', 'put', 'delete'):
            response = getattr(self.client, method)(self._cancel_url(), format='json')
            self.assertEqual(response.status_code, 405, method)

    def test_cancel_preserves_multiple_bids(self):
        b1 = Bid.objects.create(
            auction=self.auction,
            bidder=self.buyer,
            amount=Decimal('110.00'),
        )
        b2 = Bid.objects.create(
            auction=self.auction,
            bidder=self.buyer_b,
            amount=Decimal('120.00'),
        )
        snapshot = list(
            Bid.objects.filter(auction=self.auction)
            .order_by('id')
            .values_list('id', 'bidder_id', 'amount')
        )
        self._auth(self.admin_token)
        response = self.client.post(self._cancel_url(), format='json')
        self.assertEqual(response.status_code, 200, response.data)
        after = list(
            Bid.objects.filter(auction=self.auction)
            .order_by('id')
            .values_list('id', 'bidder_id', 'amount')
        )
        self.assertEqual(after, snapshot)
        self.assertEqual({b1.pk, b2.pk}, {row[0] for row in after})
        self.auction.refresh_from_db()
        self.assertIsNone(self.auction.winning_bidder_id)

    def test_cancel_paid_auction_rejected(self):
        self.auction.is_paid = True
        self.auction.save(update_fields=['is_paid'])
        self._auth(self.admin_token)
        response = self.client.post(self._cancel_url(), format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.ACTIVE)
        self.assertTrue(self.auction.is_paid)

    def test_cancel_with_payment_row_rejected_even_if_unpaid_flag(self):
        Payment.objects.create(
            auction=self.auction,
            user=self.buyer,
            amount=Decimal('110.00'),
            status=Payment.Status.PENDING,
            transaction_id='cancel-guard-tx-1',
        )
        self.assertFalse(self.auction.is_paid)
        self._auth(self.admin_token)
        response = self.client.post(self._cancel_url(), format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.ACTIVE)
        self.assertTrue(Payment.objects.filter(auction=self.auction).exists())
        payment = Payment.objects.get(auction=self.auction)
        self.assertEqual(payment.transaction_id, 'cancel-guard-tx-1')
        self.assertEqual(payment.status, Payment.Status.PENDING)

    def test_cancel_closed_rejected(self):
        AuctionLifecycleService.close_auction(self.auction.pk, source='manual')
        self.auction.refresh_from_db()
        winner_id = self.auction.winning_bidder_id
        status_before = self.auction.status
        self._auth(self.admin_token)
        response = self.client.post(self._cancel_url(), format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, status_before)
        self.assertEqual(self.auction.winning_bidder_id, winner_id)

    def test_cancel_already_cancelled_idempotent(self):
        AuctionLifecycleService.cancel_auction(self.auction.pk)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)
        self._auth(self.admin_token)
        response = self.client.post(
            self._cancel_url(),
            {'reason': 'Second look'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], Auction.Status.CANCELLED)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)

    def test_hidden_active_cancel_preserves_hidden(self):
        hide_auction(auction=self.auction, reason='Review', moderator=self.admin)
        self.auction.refresh_from_db()
        self.assertTrue(self.auction.is_hidden)
        self._auth(self.admin_token)
        response = self.client.post(
            self._cancel_url(),
            {'reason': 'Cancel hidden'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)
        self.assertTrue(self.auction.is_hidden)

    def test_product_hidden_active_cancel(self):
        self.product.is_hidden = True
        self.product.moderation_reason = 'Product review'
        self.product.save(update_fields=['is_hidden', 'moderation_reason'])
        self._auth(self.admin_token)
        response = self.client.post(self._cancel_url(), format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.auction.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)
        self.assertTrue(self.product.is_hidden)
        self.assertEqual(self.product.moderation_reason, 'Product review')

    def test_hide_then_cancel_then_restore(self):
        self._auth(self.admin_token)
        hide = self.client.post(
            f'/api/admin/auctions/{self.auction.pk}/hide/',
            {'reason': 'Hide first'},
            format='json',
        )
        self.assertEqual(hide.status_code, 200)
        cancel = self.client.post(self._cancel_url(), format='json')
        self.assertEqual(cancel.status_code, 200)
        self.auction.refresh_from_db()
        self.assertTrue(self.auction.is_hidden)
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)

        restore = self.client.post(
            f'/api/admin/auctions/{self.auction.pk}/restore/',
            format='json',
        )
        self.assertEqual(restore.status_code, 200)
        self.auction.refresh_from_db()
        self.assertFalse(self.auction.is_hidden)
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)

    def test_cancel_then_hide_restore(self):
        self._auth(self.admin_token)
        cancel = self.client.post(self._cancel_url(), format='json')
        self.assertEqual(cancel.status_code, 200)
        hide = self.client.post(
            f'/api/admin/auctions/{self.auction.pk}/hide/',
            {'reason': 'After cancel'},
            format='json',
        )
        self.assertEqual(hide.status_code, 200)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)
        self.assertTrue(self.auction.is_hidden)
        restore_auction(auction=self.auction)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)
        self.assertFalse(self.auction.is_hidden)

    def test_bid_after_admin_cancel_rejected(self):
        self._auth(self.admin_token)
        self.client.post(self._cancel_url(), format='json')
        before = Bid.objects.filter(auction=self.auction).count()
        with self.assertRaises(ValidationError):
            BidService.place_bid(self.auction.pk, self.buyer, Decimal('110.00'))
        self.assertEqual(Bid.objects.filter(auction=self.auction).count(), before)

    def test_buyer_my_bids_keeps_cancelled_history(self):
        Bid.objects.create(
            auction=self.auction,
            bidder=self.buyer,
            amount=Decimal('110.00'),
        )
        self._auth(self.admin_token)
        self.client.post(self._cancel_url(), format='json')
        self._auth(self.buyer_token)
        response = self.client.get('/api/auctions/my-bids/')
        self.assertEqual(response.status_code, 200, response.data)
        auction_ids = {row['auction'] for row in response.data}
        self.assertIn(self.auction.pk, auction_ids)

    def test_cancelled_not_in_won_history(self):
        Bid.objects.create(
            auction=self.auction,
            bidder=self.buyer,
            amount=Decimal('110.00'),
        )
        self.auction.winning_bidder = self.buyer
        self.auction.save(update_fields=['winning_bidder'])
        self._auth(self.admin_token)
        self.client.post(self._cancel_url(), format='json')
        self.auction.refresh_from_db()
        self.assertIsNone(self.auction.winning_bidder_id)
        won = Auction.objects.filter(
            winning_bidder=self.buyer,
            status=Auction.Status.CLOSED,
        )
        self.assertFalse(won.filter(pk=self.auction.pk).exists())

    def test_seller_cancel_still_owner_only(self):
        other_seller = User.objects.create_user(
            username='other_seller_cancel',
            email='other_seller_cancel@test.com',
            password='pass12345',
        )
        ensure_user_profile(other_seller, role=UserProfile.Role.SELLER)
        other_token = Token.objects.create(user=other_seller)
        self._auth(other_token)
        response = self.client.post(
            f'/api/auctions/{self.auction.pk}/transition/',
            {'status': Auction.Status.CANCELLED},
            format='json',
        )
        self.assertIn(response.status_code, (401, 403), response.data)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.ACTIVE)

        self._auth(self.seller_token)
        ok = self.client.post(
            f'/api/auctions/{self.auction.pk}/transition/',
            {'status': Auction.Status.CANCELLED},
            format='json',
        )
        self.assertEqual(ok.status_code, 200, ok.data)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)

    def test_seller_cannot_use_admin_cancel_route(self):
        self._auth(self.seller_token)
        response = self.client.post(self._cancel_url(), format='json')
        self.assertEqual(response.status_code, 403)

    def test_seller_cancel_rejects_paid_auction(self):
        self.auction.is_paid = True
        self.auction.save(update_fields=['is_paid'])
        self._auth(self.seller_token)
        response = self.client.post(
            f'/api/auctions/{self.auction.pk}/transition/',
            {'status': Auction.Status.CANCELLED},
            format='json',
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.ACTIVE)
        self.assertTrue(self.auction.is_paid)

    def test_seller_cancel_rejects_payment_row(self):
        Payment.objects.create(
            auction=self.auction,
            user=self.buyer,
            amount=Decimal('110.00'),
            status=Payment.Status.PENDING,
            transaction_id='seller-cancel-guard-tx',
        )
        self._auth(self.seller_token)
        response = self.client.post(
            f'/api/auctions/{self.auction.pk}/transition/',
            {'status': Auction.Status.CANCELLED},
            format='json',
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.ACTIVE)
        self.assertTrue(Payment.objects.filter(auction=self.auction).exists())

    def test_auto_close_ignores_cancelled(self):
        self._auth(self.admin_token)
        self.client.post(self._cancel_url(), format='json')
        self.auction.end_time = timezone.now() - timedelta(minutes=5)
        self.auction.save(update_fields=['end_time'])
        result = close_all_expired_auctions()
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)
        self.assertNotIn(self.auction.pk, result.get('closed_ids', []))

    def test_close_finalizer_ignores_cancelled(self):
        AuctionLifecycleService.cancel_auction(self.auction.pk)
        closed, did_close = AuctionLifecycleService.close_auction(
            self.auction.pk,
            source='manual',
        )
        self.assertFalse(did_close)
        self.assertEqual(closed.status, Auction.Status.CANCELLED)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)
        self.assertIsNone(self.auction.winning_bidder_id)

    def test_admin_cancel_does_not_accept_economics_fields(self):
        self._auth(self.admin_token)
        response = self.client.post(
            self._cancel_url(),
            {
                'reason': 'ok',
                'status': Auction.Status.CLOSED,
                'starting_bid': '1.00',
                'winner': self.buyer.pk,
                'is_paid': True,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)
        self.assertEqual(self.auction.starting_bid, Decimal('100.00'))
        self.assertFalse(self.auction.is_paid)


class AuctionCancelledRealtimeTests(TransactionTestCase):
    def setUp(self):
        self.seller = User.objects.create_user(
            username='rt_cancel_seller',
            email='rt_cancel_seller@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='rt_cancel_buyer',
            email='rt_cancel_buyer@test.com',
            password='pass12345',
        )
        self.admin = User.objects.create_user(
            username='rt_cancel_admin',
            email='rt_cancel_admin@test.com',
            password='pass12345',
            is_staff=True,
        )
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.admin, role=UserProfile.Role.SELLER)
        self.admin_token = Token.objects.create(user=self.admin)
        now = timezone.now()
        self.product = Product.objects.create(
            seller=self.seller,
            title='RT Cancel Item',
            description='Cancel realtime',
        )
        self.auction = Auction.objects.create(
            product=self.product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            start_time=now - timedelta(minutes=5),
            end_time=now + timedelta(hours=1),
            status=Auction.Status.ACTIVE,
        )
        self.api = APIClient()

    def _communicator(self, auction_id: int) -> WebsocketCommunicator:
        return WebsocketCommunicator(
            application,
            f'/ws/auctions/{auction_id}/',
            headers=[(b'origin', b'http://localhost')],
        )

    def _assert_cancelled_payload(self, event, *, auction_id: int):
        self.assertEqual(event['type'], AUCTION_CANCELLED_EVENT)
        self.assertEqual(event['auction_id'], auction_id)
        self.assertEqual(event['status'], Auction.Status.CANCELLED)
        self.assertIsNone(event['winning_bidder'])
        self.assertIn('server_time', event)
        self.assertNotIn('moderation_reason', event)
        self.assertEqual(
            set(event.keys()),
            {'type', 'auction_id', 'status', 'winning_bidder', 'server_time'},
        )

    def test_build_cancelled_payload_shape(self):
        payload = build_auction_cancelled_payload(self.auction)
        self._assert_cancelled_payload(payload, auction_id=self.auction.pk)

    def test_admin_cancel_emits_auction_cancelled(self):
        auction_id = self.auction.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            def _admin_cancel():
                self.api.credentials(
                    HTTP_AUTHORIZATION=f'Token {self.admin_token.key}'
                )
                return self.api.post(
                    f'/api/admin/auctions/{auction_id}/cancel/',
                    {'reason': 'Policy'},
                    format='json',
                )

            response = await database_sync_to_async(_admin_cancel)()
            self.assertEqual(response.status_code, 200, response.data)
            event = await communicator.receive_json_from(timeout=2)
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))
            await communicator.disconnect()
            return event

        event = async_to_sync(_run)()
        self._assert_cancelled_payload(event, auction_id=auction_id)

    def test_seller_cancel_emits_cancelled_not_closed(self):
        auction_id = self.auction.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            _, cancelled = await database_sync_to_async(
                AuctionLifecycleService.cancel_auction
            )(auction_id)
            self.assertTrue(cancelled)
            event = await communicator.receive_json_from(timeout=2)
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))
            await communicator.disconnect()
            return event

        event = async_to_sync(_run)()
        self._assert_cancelled_payload(event, auction_id=auction_id)
        self.assertNotEqual(event['type'], AUCTION_CLOSED_EVENT)

    def test_idempotent_cancel_no_second_broadcast(self):
        auction_id = self.auction.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            _, first = await database_sync_to_async(
                AuctionLifecycleService.cancel_auction
            )(auction_id)
            self.assertTrue(first)
            event = await communicator.receive_json_from(timeout=2)

            _, second = await database_sync_to_async(
                AuctionLifecycleService.cancel_auction
            )(auction_id)
            self.assertFalse(second)
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))
            await communicator.disconnect()
            return event

        event = async_to_sync(_run)()
        self.assertEqual(event['type'], AUCTION_CANCELLED_EVENT)

    def test_rolled_back_cancel_does_not_broadcast(self):
        auction_id = self.auction.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            def _rollback_after_schedule():
                with transaction.atomic():
                    locked = Auction.objects.select_for_update().get(pk=auction_id)
                    locked.status = Auction.Status.CANCELLED
                    locked.winning_bidder = None
                    locked.save(update_fields=['status', 'winning_bidder'])
                    schedule_auction_cancelled_broadcast(locked)
                    transaction.set_rollback(True)

            await database_sync_to_async(_rollback_after_schedule)()
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))
            await communicator.disconnect()

        async_to_sync(_run)()
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.ACTIVE)

    def test_auto_close_after_cancel_emits_nothing(self):
        AuctionLifecycleService.cancel_auction(self.auction.pk)
        self.auction.end_time = timezone.now() - timedelta(minutes=1)
        self.auction.save(update_fields=['end_time'])
        auction_id = self.auction.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await database_sync_to_async(close_all_expired_auctions)()
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))
            await communicator.disconnect()

        async_to_sync(_run)()
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)

    @patch('auctions.realtime.broadcast_auction_closed')
    def test_cancel_never_calls_closed_broadcast(self, mock_closed):
        AuctionLifecycleService.cancel_auction(self.auction.pk)
        mock_closed.assert_not_called()
