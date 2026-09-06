"""
Channels tests for live auction bid.accepted broadcasts.

Uses InMemoryChannelLayer (configured when RUNNING_TESTS). Redis is not required.

Each WebSocket scenario runs inside one async context so the communicator
consumer is not cancelled between connect / receive / disconnect.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import transaction
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from config.asgi import application
from products.models import Product

from .models import Auction, Bid
from .realtime import (
    AUCTION_CLOSED_EVENT,
    BID_ACCEPTED_EVENT,
    auction_group_name,
    build_auction_closed_payload,
    build_bid_accepted_payload,
    schedule_auction_closed_broadcast,
    schedule_bid_accepted_broadcast,
)
from .services import AuctionLifecycleService, BidService


class AuctionRealtimeFoundationTests(TransactionTestCase):
    """WebSocket room + REST bid broadcast foundation (RT-B01)."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='rt_seller',
            email='rt_seller@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='rt_buyer',
            email='rt_buyer@test.com',
            password='pass12345',
        )
        self.buyer_b = User.objects.create_user(
            username='rt_buyer_b',
            email='rt_buyer_b@test.com',
            password='pass12345',
        )
        now = timezone.now()
        self.product = Product.objects.create(
            seller=self.seller,
            title='RT Auction Item',
            description='Realtime foundation',
        )
        self.auction = Auction.objects.create(
            product=self.product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            start_time=now - timedelta(minutes=5),
            end_time=now + timedelta(hours=1),
            status=Auction.Status.ACTIVE,
            reserve_price=Decimal('500.00'),
        )
        self.api = APIClient()

    def _communicator(self, auction_id: int) -> WebsocketCommunicator:
        return WebsocketCommunicator(
            application,
            f'/ws/auctions/{auction_id}/',
            headers=[(b'origin', b'http://localhost')],
        )

    def test_group_name_is_deterministic(self):
        self.assertEqual(auction_group_name(42), 'auction_42')
        self.assertEqual(
            auction_group_name(self.auction.pk),
            f'auction_{self.auction.pk}',
        )

    def test_websocket_connect_and_disconnect(self):
        auction_id = self.auction.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.disconnect()

        async_to_sync(_run)()

    def test_websocket_rejects_unknown_auction(self):
        async def _run():
            communicator = self._communicator(999999)
            connected, _ = await communicator.connect()
            self.assertFalse(connected)

        async_to_sync(_run)()

    def test_server_group_send_reaches_consumer(self):
        auction = self.auction
        buyer = self.buyer

        async def _run():
            communicator = self._communicator(auction.pk)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            bid = await database_sync_to_async(Bid.objects.create)(
                auction=auction,
                bidder=buyer,
                amount=Decimal('110.00'),
            )
            auction.current_highest_bid = Decimal('110.00')
            payload = build_bid_accepted_payload(bid, auction)
            # Ensure username is present even without select_related.
            payload['bid']['bidder_username'] = buyer.username

            channel_layer = get_channel_layer()
            await channel_layer.group_send(
                auction_group_name(auction.pk),
                {'type': 'bid.accepted', 'payload': payload},
            )
            event = await communicator.receive_json_from(timeout=2)
            await communicator.disconnect()
            return event

        event = async_to_sync(_run)()
        self.assertEqual(event['type'], BID_ACCEPTED_EVENT)
        self.assertEqual(event['auction_id'], auction.pk)
        self.assertEqual(event['bid']['amount'], '110.00')
        self.assertEqual(event['bid']['bidder_username'], 'rt_buyer')
        self.assertEqual(event['current_highest_bid'], '110.00')

    def test_rest_place_bid_broadcasts_after_success(self):
        auction_id = self.auction.pk
        token = Token.objects.create(user=self.buyer)
        self.api.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            def _post():
                return self.api.post(
                    f'/api/auctions/{auction_id}/place-bid/',
                    {'amount': '110.00'},
                    format='json',
                )

            response = await database_sync_to_async(_post)()
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            event = await communicator.receive_json_from(timeout=2)
            await communicator.disconnect()
            return response, event

        response, event = async_to_sync(_run)()
        self.assertTrue(Bid.objects.filter(auction_id=auction_id).exists())
        self.assertEqual(event['type'], BID_ACCEPTED_EVENT)
        self.assertEqual(event['auction_id'], auction_id)
        self.assertEqual(event['bid']['amount'], '110.00')
        self.assertEqual(event['bid']['bidder_username'], 'rt_buyer')
        self.assertEqual(event['current_highest_bid'], '110.00')
        self.assertEqual(event['bid']['id'], response.data['id'])

    def test_bidservice_place_bid_broadcasts(self):
        auction_id = self.auction.pk
        buyer = self.buyer

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            bid = await database_sync_to_async(BidService.place_bid)(
                auction_id,
                buyer,
                Decimal('120.00'),
            )
            event = await communicator.receive_json_from(timeout=2)
            await communicator.disconnect()
            return bid, event

        bid, event = async_to_sync(_run)()
        self.assertEqual(event['type'], BID_ACCEPTED_EVENT)
        self.assertEqual(event['bid']['id'], bid.pk)
        self.assertEqual(event['bid']['amount'], '120.00')

    def test_failed_bids_do_not_broadcast(self):
        auction_id = self.auction.pk
        buyer = self.buyer
        seller = self.seller

        expired = Auction.objects.create(
            product=Product.objects.create(
                seller=self.seller,
                title='Expired RT',
                description='x',
            ),
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() - timedelta(seconds=1),
            status=Auction.Status.ACTIVE,
        )

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            with self.assertRaises(ValidationError):
                await database_sync_to_async(BidService.place_bid)(
                    auction_id,
                    buyer,
                    Decimal('105.00'),
                )
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))

            with self.assertRaises(ValidationError):
                await database_sync_to_async(BidService.place_bid)(
                    auction_id,
                    seller,
                    Decimal('150.00'),
                )
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))

            expired_comm = self._communicator(expired.pk)
            connected_exp, _ = await expired_comm.connect()
            self.assertTrue(connected_exp)
            with self.assertRaises(ValidationError):
                await database_sync_to_async(BidService.place_bid)(
                    expired.pk,
                    buyer,
                    Decimal('150.00'),
                )
            # Late-bid path finalizes CLOSED → auction.closed, never bid.accepted.
            closed_event = await expired_comm.receive_json_from(timeout=2)
            self.assertEqual(closed_event['type'], 'auction.closed')
            self.assertEqual(closed_event['auction_id'], expired.pk)
            self.assertEqual(closed_event['status'], 'CLOSED')
            self.assertIsNone(closed_event['winning_bidder'])
            self.assertTrue(await expired_comm.receive_nothing(timeout=0.5))

            await communicator.disconnect()
            await expired_comm.disconnect()

        async_to_sync(_run)()

    def test_rolled_back_transaction_does_not_broadcast(self):
        auction = self.auction
        buyer = self.buyer

        async def _run():
            communicator = self._communicator(auction.pk)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            def _rollback_after_schedule():
                with transaction.atomic():
                    bid = Bid.objects.create(
                        auction=auction,
                        bidder=buyer,
                        amount=Decimal('130.00'),
                    )
                    bid.bidder = buyer
                    auction.current_highest_bid = Decimal('130.00')
                    auction.save(update_fields=['current_highest_bid'])
                    schedule_bid_accepted_broadcast(bid, auction)
                    transaction.set_rollback(True)

            await database_sync_to_async(_rollback_after_schedule)()
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))
            await communicator.disconnect()

        async_to_sync(_run)()
        self.assertFalse(
            Bid.objects.filter(
                auction=self.auction,
                amount=Decimal('130.00'),
            ).exists()
        )

    def test_auction_room_isolation(self):
        other = Auction.objects.create(
            product=Product.objects.create(
                seller=self.seller,
                title='Other RT',
                description='y',
            ),
            starting_bid=Decimal('50.00'),
            current_highest_bid=Decimal('50.00'),
            min_increment=Decimal('5.00'),
            start_time=timezone.now() - timedelta(minutes=1),
            end_time=timezone.now() + timedelta(hours=1),
            status=Auction.Status.ACTIVE,
        )
        auction_a = self.auction.pk
        auction_b = other.pk
        buyer = self.buyer

        async def _run():
            room_a = self._communicator(auction_a)
            room_b = self._communicator(auction_b)
            connected_a, _ = await room_a.connect()
            connected_b, _ = await room_b.connect()
            self.assertTrue(connected_a)
            self.assertTrue(connected_b)

            await database_sync_to_async(BidService.place_bid)(
                auction_a,
                buyer,
                Decimal('110.00'),
            )
            event = await room_a.receive_json_from(timeout=2)
            self.assertTrue(await room_b.receive_nothing(timeout=0.5))

            await room_a.disconnect()
            await room_b.disconnect()
            return event

        event = async_to_sync(_run)()
        self.assertEqual(event['auction_id'], auction_a)

    def test_payload_excludes_sensitive_fields(self):
        bid = Bid.objects.create(
            auction=self.auction,
            bidder=self.buyer,
            amount=Decimal('140.00'),
        )
        bid.bidder = self.buyer
        self.auction.current_highest_bid = Decimal('140.00')
        payload = build_bid_accepted_payload(bid, self.auction)
        blob = str(payload).lower()
        for forbidden in (
            'reserve_price',
            'email',
            'phone',
            'token',
            'password',
            'shipping',
        ):
            self.assertNotIn(forbidden, blob)
        self.assertNotIn('reserve', payload)
        self.assertEqual(
            set(payload.keys()),
            {'type', 'auction_id', 'bid', 'current_highest_bid'},
        )
        self.assertEqual(
            set(payload['bid'].keys()),
            {'id', 'amount', 'bidder_username', 'timestamp'},
        )

    def test_unsupported_client_message_is_safe(self):
        auction_id = self.auction.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.send_json_to(
                {'type': 'place_bid', 'amount': '999'}
            )
            reply = await communicator.receive_json_from(timeout=2)
            await communicator.disconnect()
            return reply

        reply = async_to_sync(_run)()
        self.assertEqual(reply['type'], 'error')
        self.assertEqual(reply['code'], 'unsupported_message')
        self.assertFalse(Bid.objects.filter(auction_id=auction_id).exists())


class AuctionClosedRealtimeTests(TransactionTestCase):
    """WebSocket auction.closed broadcasts after authoritative finalization (RT-B02)."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='rt2_seller',
            email='rt2_seller@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='rt2_buyer',
            email='rt2_buyer@test.com',
            password='pass12345',
        )
        self.buyer_b = User.objects.create_user(
            username='rt2_buyer_b',
            email='rt2_buyer_b@test.com',
            password='pass12345',
        )
        self.now = timezone.now()
        self.api = APIClient()

    def _product(self, title='RT2 Item'):
        return Product.objects.create(
            seller=self.seller,
            title=title,
            description='Realtime close',
        )

    def _auction(self, **overrides):
        defaults = {
            'product': self._product(),
            'starting_bid': Decimal('100.00'),
            'current_highest_bid': Decimal('100.00'),
            'min_increment': Decimal('10.00'),
            'start_time': self.now - timedelta(minutes=5),
            'end_time': self.now + timedelta(hours=1),
            'status': Auction.Status.ACTIVE,
        }
        defaults.update(overrides)
        return Auction.objects.create(**defaults)

    def _communicator(self, auction_id: int) -> WebsocketCommunicator:
        return WebsocketCommunicator(
            application,
            f'/ws/auctions/{auction_id}/',
            headers=[(b'origin', b'http://localhost')],
        )

    def _assert_public_closed_payload(self, event, *, auction_id):
        self.assertEqual(event['type'], AUCTION_CLOSED_EVENT)
        self.assertEqual(event['auction_id'], auction_id)
        self.assertEqual(event['status'], Auction.Status.CLOSED)
        self.assertIn('current_highest_bid', event)
        self.assertIn('winning_bidder', event)
        self.assertIn('is_paid', event)
        self.assertIn('closed_at', event)
        self.assertEqual(
            set(event.keys()),
            {
                'type',
                'auction_id',
                'status',
                'current_highest_bid',
                'winning_bidder',
                'is_paid',
                'closed_at',
            },
        )
        blob = str(event).lower()
        for forbidden in (
            'reserve_price',
            'email',
            'phone',
            'token',
            'password',
            'shipping',
        ):
            self.assertNotIn(forbidden, blob)
        self.assertNotIn('reserve', event)

    def test_winning_close_broadcasts_exactly_once(self):
        auction = self._auction(reserve_price=None)
        Bid.objects.create(
            auction=auction,
            bidder=self.buyer,
            amount=Decimal('150.00'),
        )
        Bid.objects.create(
            auction=auction,
            bidder=self.buyer_b,
            amount=Decimal('200.00'),
        )
        auction.current_highest_bid = Decimal('200.00')
        auction.save(update_fields=['current_highest_bid'])
        auction_id = auction.pk
        buyer_b_id = self.buyer_b.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            closed_auction, did_close = await database_sync_to_async(
                AuctionLifecycleService.close_auction
            )(auction_id, source='manual')
            self.assertTrue(did_close)

            event = await communicator.receive_json_from(timeout=2)
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))
            await communicator.disconnect()
            return closed_auction, event

        closed_auction, event = async_to_sync(_run)()
        self._assert_public_closed_payload(event, auction_id=auction_id)
        self.assertEqual(event['current_highest_bid'], '200.00')
        self.assertEqual(
            event['winning_bidder'],
            {'id': buyer_b_id, 'username': 'rt2_buyer_b'},
        )
        self.assertFalse(event['is_paid'])
        self.assertEqual(closed_auction.winning_bidder_id, buyer_b_id)

    def test_no_bid_close_winning_bidder_null(self):
        auction = self._auction()
        auction_id = auction.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            _, did_close = await database_sync_to_async(
                AuctionLifecycleService.close_auction
            )(auction_id, source='manual')
            self.assertTrue(did_close)
            event = await communicator.receive_json_from(timeout=2)
            await communicator.disconnect()
            return event

        event = async_to_sync(_run)()
        self._assert_public_closed_payload(event, auction_id=auction_id)
        self.assertIsNone(event['winning_bidder'])
        self.assertEqual(event['current_highest_bid'], '100.00')

    def test_reserve_not_met_winning_bidder_null(self):
        auction = self._auction(reserve_price=Decimal('500.00'))
        Bid.objects.create(
            auction=auction,
            bidder=self.buyer,
            amount=Decimal('200.00'),
        )
        auction.current_highest_bid = Decimal('200.00')
        auction.save(update_fields=['current_highest_bid'])
        auction_id = auction.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            _, did_close = await database_sync_to_async(
                AuctionLifecycleService.close_auction
            )(auction_id, source='manual')
            self.assertTrue(did_close)
            event = await communicator.receive_json_from(timeout=2)
            await communicator.disconnect()
            return event

        event = async_to_sync(_run)()
        self._assert_public_closed_payload(event, auction_id=auction_id)
        self.assertIsNone(event['winning_bidder'])
        self.assertEqual(event['current_highest_bid'], '200.00')
        auction.refresh_from_db()
        self.assertIsNone(auction.winning_bidder_id)

    def test_reserve_met_includes_winner(self):
        auction = self._auction(reserve_price=Decimal('500.00'))
        Bid.objects.create(
            auction=auction,
            bidder=self.buyer,
            amount=Decimal('500.00'),
        )
        auction.current_highest_bid = Decimal('500.00')
        auction.save(update_fields=['current_highest_bid'])
        auction_id = auction.pk
        buyer_id = self.buyer.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await database_sync_to_async(AuctionLifecycleService.close_auction)(
                auction_id,
                source='manual',
            )
            event = await communicator.receive_json_from(timeout=2)
            await communicator.disconnect()
            return event

        event = async_to_sync(_run)()
        self._assert_public_closed_payload(event, auction_id=auction_id)
        self.assertEqual(
            event['winning_bidder'],
            {'id': buyer_id, 'username': 'rt2_buyer'},
        )
        self.assertEqual(event['current_highest_bid'], '500.00')

    def test_closed_payload_excludes_sensitive_fields(self):
        auction = self._auction(reserve_price=Decimal('999.00'))
        auction.status = Auction.Status.CLOSED
        auction.winning_bidder = self.buyer
        auction.current_highest_bid = Decimal('150.00')
        payload = build_auction_closed_payload(auction)
        self._assert_public_closed_payload(payload, auction_id=auction.pk)
        self.assertEqual(
            payload['winning_bidder'],
            {'id': self.buyer.pk, 'username': 'rt2_buyer'},
        )

    def test_rolled_back_close_does_not_broadcast(self):
        auction = self._auction()
        auction_id = auction.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            def _rollback_after_schedule():
                with transaction.atomic():
                    locked = Auction.objects.select_for_update().get(pk=auction_id)
                    locked.status = Auction.Status.CLOSED
                    locked.winning_bidder = None
                    locked.save(update_fields=['status', 'winning_bidder'])
                    schedule_auction_closed_broadcast(locked)
                    transaction.set_rollback(True)

            await database_sync_to_async(_rollback_after_schedule)()
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))
            await communicator.disconnect()

        async_to_sync(_run)()
        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.ACTIVE)

    def test_reclose_does_not_emit_second_event(self):
        auction = self._auction()
        auction_id = auction.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            _, first = await database_sync_to_async(
                AuctionLifecycleService.close_auction
            )(auction_id, source='manual')
            self.assertTrue(first)
            event = await communicator.receive_json_from(timeout=2)

            _, second = await database_sync_to_async(
                AuctionLifecycleService.close_auction
            )(auction_id, source='manual')
            self.assertFalse(second)
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))

            await communicator.disconnect()
            return event

        event = async_to_sync(_run)()
        self.assertEqual(event['type'], AUCTION_CLOSED_EVENT)

    def test_close_room_isolation(self):
        auction_a = self._auction(product=self._product('A'))
        auction_b = self._auction(product=self._product('B'))
        id_a = auction_a.pk
        id_b = auction_b.pk

        async def _run():
            room_a = self._communicator(id_a)
            room_b = self._communicator(id_b)
            connected_a, _ = await room_a.connect()
            connected_b, _ = await room_b.connect()
            self.assertTrue(connected_a)
            self.assertTrue(connected_b)

            await database_sync_to_async(AuctionLifecycleService.close_auction)(
                id_a,
                source='manual',
            )
            event = await room_a.receive_json_from(timeout=2)
            self.assertTrue(await room_b.receive_nothing(timeout=0.5))

            await room_a.disconnect()
            await room_b.disconnect()
            return event

        event = async_to_sync(_run)()
        self.assertEqual(event['auction_id'], id_a)
        self.assertEqual(event['type'], AUCTION_CLOSED_EVENT)

    def test_manual_transition_broadcasts_closed(self):
        auction = self._auction()
        Bid.objects.create(
            auction=auction,
            bidder=self.buyer,
            amount=Decimal('180.00'),
        )
        auction.current_highest_bid = Decimal('180.00')
        auction.save(update_fields=['current_highest_bid'])
        auction_id = auction.pk
        token = Token.objects.create(user=self.seller)
        self.api.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            def _post():
                return self.api.post(
                    f'/api/auctions/{auction_id}/transition/',
                    {'status': 'CLOSED'},
                    format='json',
                )

            response = await database_sync_to_async(_post)()
            event = await communicator.receive_json_from(timeout=2)
            await communicator.disconnect()
            return response, event

        response, event = async_to_sync(_run)()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self._assert_public_closed_payload(event, auction_id=auction_id)
        self.assertEqual(
            event['winning_bidder'],
            {'id': self.buyer.pk, 'username': 'rt2_buyer'},
        )

    def test_late_bid_emits_closed_not_accepted(self):
        auction = self._auction(
            end_time=self.now - timedelta(seconds=1),
            start_time=self.now - timedelta(hours=2),
        )
        Bid.objects.create(
            auction=auction,
            bidder=self.buyer,
            amount=Decimal('160.00'),
        )
        auction.current_highest_bid = Decimal('160.00')
        auction.save(update_fields=['current_highest_bid'])
        auction_id = auction.pk
        buyer_id = self.buyer.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            with self.assertRaises(ValidationError):
                await database_sync_to_async(BidService.place_bid)(
                    auction_id,
                    self.buyer_b,
                    Decimal('200.00'),
                )

            event = await communicator.receive_json_from(timeout=2)
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))
            await communicator.disconnect()
            return event

        event = async_to_sync(_run)()
        self._assert_public_closed_payload(event, auction_id=auction_id)
        self.assertEqual(event['type'], AUCTION_CLOSED_EVENT)
        self.assertNotEqual(event['type'], BID_ACCEPTED_EVENT)
        self.assertEqual(
            event['winning_bidder'],
            {'id': buyer_id, 'username': 'rt2_buyer'},
        )
        self.assertFalse(
            Bid.objects.filter(
                auction_id=auction_id,
                amount=Decimal('200.00'),
            ).exists()
        )
        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.CLOSED)

    def test_lazy_retrieve_expired_broadcasts_closed(self):
        auction = self._auction(
            end_time=self.now - timedelta(seconds=1),
            start_time=self.now - timedelta(hours=2),
        )
        Bid.objects.create(
            auction=auction,
            bidder=self.buyer,
            amount=Decimal('170.00'),
        )
        auction.current_highest_bid = Decimal('170.00')
        auction.save(update_fields=['current_highest_bid'])
        auction_id = auction.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            def _get():
                return self.api.get(f'/api/auctions/{auction_id}/')

            response = await database_sync_to_async(_get)()
            event = await communicator.receive_json_from(timeout=2)
            await communicator.disconnect()
            return response, event

        response, event = async_to_sync(_run)()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'CLOSED')
        self._assert_public_closed_payload(event, auction_id=auction_id)
        self.assertEqual(
            event['winning_bidder'],
            {'id': self.buyer.pk, 'username': 'rt2_buyer'},
        )

    def test_management_command_close_broadcasts(self):
        auction = self._auction(
            end_time=self.now - timedelta(seconds=1),
            start_time=self.now - timedelta(hours=2),
        )
        auction_id = auction.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            def _cmd():
                call_command('close_expired_auctions')

            await database_sync_to_async(_cmd)()
            event = await communicator.receive_json_from(timeout=2)
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))
            await communicator.disconnect()
            return event

        event = async_to_sync(_run)()
        self._assert_public_closed_payload(event, auction_id=auction_id)
        self.assertIsNone(event['winning_bidder'])
        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.CLOSED)

    def test_cancel_does_not_emit_auction_closed(self):
        auction = self._auction()
        auction_id = auction.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            _, cancelled = await database_sync_to_async(
                AuctionLifecycleService.cancel_auction
            )(auction_id)
            self.assertTrue(cancelled)
            self.assertTrue(await communicator.receive_nothing(timeout=0.5))
            await communicator.disconnect()

        async_to_sync(_run)()
        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.CANCELLED)

    def test_client_cannot_inject_auction_closed(self):
        auction = self._auction()
        auction_id = auction.pk

        async def _run():
            communicator = self._communicator(auction_id)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.send_json_to(
                {
                    'type': 'auction.closed',
                    'auction_id': auction_id,
                    'status': 'CLOSED',
                }
            )
            reply = await communicator.receive_json_from(timeout=2)
            await communicator.disconnect()
            return reply

        reply = async_to_sync(_run)()
        self.assertEqual(reply['type'], 'error')
        self.assertEqual(reply['code'], 'unsupported_message')
        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.ACTIVE)

    def test_bid_accepted_shape_unchanged(self):
        auction = self._auction()
        bid = Bid.objects.create(
            auction=auction,
            bidder=self.buyer,
            amount=Decimal('140.00'),
        )
        bid.bidder = self.buyer
        auction.current_highest_bid = Decimal('140.00')
        payload = build_bid_accepted_payload(bid, auction)
        self.assertEqual(
            set(payload.keys()),
            {'type', 'auction_id', 'bid', 'current_highest_bid'},
        )
        self.assertEqual(payload['type'], BID_ACCEPTED_EVENT)
