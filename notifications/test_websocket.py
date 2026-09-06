"""
NT-B03: authenticated private notification WebSocket tests.

Uses InMemoryChannelLayer (configured when RUNNING_TESTS). Tokens are never
placed in WebSocket URLs — clients authenticate via a first JSON message.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from auctions.models import Auction
from auctions.services import AuctionLifecycleService, BidService
from config.asgi import application
from notifications.models import Notification
from notifications.realtime import (
    NOTIFICATION_CREATED_EVENT,
    build_notification_created_payload,
    user_notification_group_name,
)
from notifications.services import NotificationService
from products.models import Product


WS_PATH = '/ws/notifications/'
WS_HEADERS = [(b'origin', b'http://localhost')]


class NotificationWebSocketAuthTests(TransactionTestCase):
    """Token handshake, isolation, and push delivery."""

    def setUp(self):
        self.user_a = User.objects.create_user(
            username='ws_a',
            email='a@test.com',
            password='pass12345',
        )
        self.user_b = User.objects.create_user(
            username='ws_b',
            email='b@test.com',
            password='pass12345',
        )
        self.token_a = Token.objects.create(user=self.user_a)
        self.token_b = Token.objects.create(user=self.user_b)
        self.seller = User.objects.create_user(
            username='ws_seller',
            email='seller@test.com',
            password='pass12345',
        )
        self.token_seller = Token.objects.create(user=self.seller)
        now = timezone.now()
        self.product = Product.objects.create(
            seller=self.seller,
            title='WS Notify Item',
            description='nt-b03',
        )
        self.auction = Auction.objects.create(
            product=self.product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            status=Auction.Status.ACTIVE,
        )

    def _connect(self):
        return WebsocketCommunicator(application, WS_PATH, headers=WS_HEADERS)

    async def _authenticate(self, communicator, token_key: str):
        await communicator.send_json_to(
            {'type': 'authenticate', 'token': token_key}
        )
        response = await communicator.receive_json_from(timeout=2)
        return response

    def test_valid_token_receives_private_notification(self):
        async def scenario():
            communicator = self._connect()
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            auth = await self._authenticate(communicator, self.token_a.key)
            self.assertEqual(auth['type'], 'authenticated')
            self.assertEqual(auth['user_id'], self.user_a.pk)

            note = await database_sync_to_async(
                NotificationService.create_outbid_notification
            )(
                user_id=self.user_a.pk,
                auction_id=self.auction.pk,
                product_title='WS Notify Item',
            )
            self.assertIsNotNone(note)

            event = await communicator.receive_json_from(timeout=2)
            self.assertEqual(event['type'], NOTIFICATION_CREATED_EVENT)
            self.assertEqual(event['notification']['id'], note.pk)
            self.assertEqual(event['notification']['type'], Notification.Type.OUTBID)
            self.assertEqual(event['notification']['auction_id'], self.auction.pk)
            self.assertFalse(event['notification']['is_read'])
            self.assertNotIn('user', event['notification'])
            self.assertNotIn('email', str(event).lower())

            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_invalid_token_rejected(self):
        async def scenario():
            communicator = self._connect()
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            await communicator.send_json_to(
                {'type': 'authenticate', 'token': 'not-a-real-token'}
            )
            err = await communicator.receive_json_from(timeout=2)
            self.assertEqual(err['type'], 'error')
            self.assertEqual(err['code'], 'authentication_failed')

            # Socket should close; further receives fail.
            closed = await communicator.receive_output(timeout=2)
            self.assertEqual(closed['type'], 'websocket.close')
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_missing_token_rejected(self):
        async def scenario():
            communicator = self._connect()
            await communicator.connect()
            await communicator.send_json_to({'type': 'authenticate'})
            err = await communicator.receive_json_from(timeout=2)
            self.assertEqual(err['code'], 'authentication_failed')
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_malformed_json_does_not_authenticate(self):
        async def scenario():
            communicator = self._connect()
            await communicator.connect()
            await communicator.send_to(text_data='{not-json')
            err = await communicator.receive_json_from(timeout=2)
            self.assertEqual(err['type'], 'error')
            self.assertEqual(err['code'], 'authentication_failed')
            closed = await communicator.receive_output(timeout=2)
            self.assertEqual(closed['type'], 'websocket.close')
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_auth_timeout_closes_socket(self):
        async def scenario():
            with patch('notifications.consumers.AUTH_TIMEOUT_SECONDS', 0.05):
                communicator = self._connect()
                await communicator.connect()
                err = await communicator.receive_json_from(timeout=2)
                self.assertEqual(err['code'], 'auth_timeout')
                closed = await communicator.receive_output(timeout=2)
                self.assertEqual(closed['type'], 'websocket.close')
                await communicator.disconnect()

        async_to_sync(scenario)()

    def test_cross_user_isolation(self):
        async def scenario():
            a = self._connect()
            b = self._connect()
            await a.connect()
            await b.connect()
            auth_a = await self._authenticate(a, self.token_a.key)
            auth_b = await self._authenticate(b, self.token_b.key)
            self.assertEqual(auth_a['user_id'], self.user_a.pk)
            self.assertEqual(auth_b['user_id'], self.user_b.pk)

            note_a = await database_sync_to_async(
                NotificationService.create_outbid_notification
            )(
                user_id=self.user_a.pk,
                auction_id=self.auction.pk,
                product_title='WS Notify Item',
            )
            event_a = await a.receive_json_from(timeout=2)
            self.assertEqual(event_a['notification']['id'], note_a.pk)

            # B must not receive A's notification.
            self.assertTrue(await b.receive_nothing(timeout=0.3))

            note_b = await database_sync_to_async(
                NotificationService.create_seller_new_bid_notification
            )(
                seller_id=self.user_b.pk,
                auction_id=self.auction.pk,
                product_title='WS Notify Item',
                amount=Decimal('120.00'),
            )
            event_b = await b.receive_json_from(timeout=2)
            self.assertEqual(event_b['notification']['id'], note_b.pk)
            self.assertTrue(await a.receive_nothing(timeout=0.3))

            await a.disconnect()
            await b.disconnect()

        async_to_sync(scenario)()

    def test_spoofed_user_id_ignored(self):
        async def scenario():
            communicator = self._connect()
            await communicator.connect()
            await communicator.send_json_to(
                {
                    'type': 'authenticate',
                    'token': self.token_a.key,
                    'user_id': self.user_b.pk,
                }
            )
            auth = await communicator.receive_json_from(timeout=2)
            self.assertEqual(auth['type'], 'authenticated')
            self.assertEqual(auth['user_id'], self.user_a.pk)

            await database_sync_to_async(
                NotificationService.create_outbid_notification
            )(
                user_id=self.user_b.pk,
                auction_id=self.auction.pk,
                product_title='WS Notify Item',
            )
            self.assertTrue(await communicator.receive_nothing(timeout=0.3))

            note_a = await database_sync_to_async(
                NotificationService.create_outbid_notification
            )(
                user_id=self.user_a.pk,
                auction_id=self.auction.pk,
                product_title='WS Notify Item',
            )
            event = await communicator.receive_json_from(timeout=2)
            self.assertEqual(event['notification']['id'], note_a.pk)
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_reauthenticate_does_not_switch_user(self):
        async def scenario():
            communicator = self._connect()
            await communicator.connect()
            await self._authenticate(communicator, self.token_a.key)

            await communicator.send_json_to(
                {'type': 'authenticate', 'token': self.token_b.key}
            )
            err = await communicator.receive_json_from(timeout=2)
            self.assertEqual(err['code'], 'already_authenticated')

            note_b = await database_sync_to_async(
                NotificationService.create_outbid_notification
            )(
                user_id=self.user_b.pk,
                auction_id=self.auction.pk,
                product_title='WS Notify Item',
            )
            self.assertTrue(await communicator.receive_nothing(timeout=0.3))
            self.assertIsNotNone(note_b)

            note_a = await database_sync_to_async(
                NotificationService.create_outbid_notification
            )(
                user_id=self.user_a.pk,
                auction_id=self.auction.pk,
                product_title='WS Notify Item',
            )
            event = await communicator.receive_json_from(timeout=2)
            self.assertEqual(event['notification']['id'], note_a.pk)
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_client_cannot_create_notification_via_socket(self):
        async def scenario():
            before = await database_sync_to_async(Notification.objects.count)()
            communicator = self._connect()
            await communicator.connect()
            await self._authenticate(communicator, self.token_a.key)

            await communicator.send_json_to(
                {
                    'type': 'notification.created',
                    'notification': {
                        'type': Notification.Type.AUCTION_WON,
                        'title': 'Fake',
                        'message': 'should not work',
                    },
                }
            )
            err = await communicator.receive_json_from(timeout=2)
            self.assertEqual(err['code'], 'unsupported_message')
            after = await database_sync_to_async(Notification.objects.count)()
            self.assertEqual(after, before)
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_offline_persistence_without_socket(self):
        note = NotificationService.create_outbid_notification(
            user_id=self.user_a.pk,
            auction_id=self.auction.pk,
            product_title='WS Notify Item',
        )
        self.assertIsNotNone(note)
        self.assertTrue(
            Notification.objects.filter(pk=note.pk, user=self.user_a).exists()
        )

    def test_service_push_matches_rest_inbox(self):
        async def scenario():
            communicator = self._connect()
            await communicator.connect()
            await self._authenticate(communicator, self.token_a.key)

            await database_sync_to_async(BidService.place_bid)(
                self.auction.pk,
                self.user_a,
                Decimal('110.00'),
            )
            await database_sync_to_async(BidService.place_bid)(
                self.auction.pk,
                self.user_b,
                Decimal('130.00'),
            )

            # Drain seller? A should get OUTBID.
            # May also receive nothing else for A from first bid.
            # Collect until OUTBID appears (bounded).
            found = None
            for _ in range(5):
                event = await communicator.receive_json_from(timeout=2)
                if (
                    event.get('type') == NOTIFICATION_CREATED_EVENT
                    and event['notification']['type'] == Notification.Type.OUTBID
                ):
                    found = event
                    break
            self.assertIsNotNone(found)
            note_id = found['notification']['id']

            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_a.key}')
            response = await database_sync_to_async(client.get)(
                '/api/notifications/'
            )
            self.assertEqual(response.status_code, 200)
            ids = {row['id'] for row in response.data['results']}
            self.assertIn(note_id, ids)

            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_push_failure_keeps_persisted_row(self):
        with patch(
            'notifications.realtime.async_to_sync',
            side_effect=RuntimeError('channel boom'),
        ):
            note = NotificationService.create_outbid_notification(
                user_id=self.user_a.pk,
                auction_id=self.auction.pk,
                product_title='WS Notify Item',
            )
        self.assertIsNotNone(note)
        self.assertTrue(Notification.objects.filter(pk=note.pk).exists())

    def test_terminal_close_push_won_and_lost(self):
        other = User.objects.create_user(
            username='ws_other',
            email='other@test.com',
            password='pass12345',
        )
        other_token = Token.objects.create(user=other)

        async def scenario():
            winner_ws = self._connect()
            loser_ws = self._connect()
            other_ws = self._connect()
            await winner_ws.connect()
            await loser_ws.connect()
            await other_ws.connect()
            await self._authenticate(winner_ws, self.token_b.key)
            await self._authenticate(loser_ws, self.token_a.key)
            await self._authenticate(other_ws, other_token.key)

            await database_sync_to_async(BidService.place_bid)(
                self.auction.pk,
                self.user_a,
                Decimal('110.00'),
            )
            await database_sync_to_async(BidService.place_bid)(
                self.auction.pk,
                self.user_b,
                Decimal('130.00'),
            )

            outbid = await loser_ws.receive_json_from(timeout=2)
            self.assertEqual(outbid['notification']['type'], Notification.Type.OUTBID)

            await database_sync_to_async(AuctionLifecycleService.close_auction)(
                self.auction.pk
            )

            won = await winner_ws.receive_json_from(timeout=2)
            self.assertEqual(won['notification']['type'], Notification.Type.AUCTION_WON)

            lost = await loser_ws.receive_json_from(timeout=2)
            self.assertEqual(lost['notification']['type'], Notification.Type.AUCTION_LOST)

            self.assertTrue(await other_ws.receive_nothing(timeout=0.3))

            await winner_ws.disconnect()
            await loser_ws.disconnect()
            await other_ws.disconnect()

        async_to_sync(scenario)()

    def test_no_winner_no_terminal_push(self):
        async def scenario():
            communicator = self._connect()
            await communicator.connect()
            await self._authenticate(communicator, self.token_a.key)

            await database_sync_to_async(AuctionLifecycleService.close_auction)(
                self.auction.pk
            )
            self.assertTrue(await communicator.receive_nothing(timeout=0.4))
            count = await database_sync_to_async(
                lambda: Notification.objects.filter(
                    type__in=[
                        Notification.Type.AUCTION_WON,
                        Notification.Type.AUCTION_LOST,
                    ]
                ).count()
            )()
            self.assertEqual(count, 0)
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_group_name_helper(self):
        self.assertEqual(user_notification_group_name(42), 'user_42')

    def test_payload_builder_shape(self):
        note = Notification.objects.create(
            user=self.user_a,
            type=Notification.Type.OUTBID,
            title='t',
            message='m',
            auction=self.auction,
            is_read=False,
        )
        payload = build_notification_created_payload(note)
        self.assertEqual(payload['type'], NOTIFICATION_CREATED_EVENT)
        self.assertEqual(
            set(payload['notification'].keys()),
            {'id', 'type', 'title', 'message', 'auction_id', 'is_read', 'created_at'},
        )

    def test_ws_path_has_no_token_query(self):
        self.assertNotIn('token', WS_PATH)
        self.assertNotIn('?', WS_PATH)

    def test_public_auction_socket_still_connects_without_token(self):
        async def scenario():
            path = f'/ws/auctions/{self.auction.pk}/'
            communicator = WebsocketCommunicator(
                application,
                path,
                headers=WS_HEADERS,
            )
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.disconnect()

        async_to_sync(scenario)()
