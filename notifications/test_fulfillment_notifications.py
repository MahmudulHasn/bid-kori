"""
Tests for Winner Fulfillment Notifications & Realtime Delivery (NOTIF-W01).

Validates:
- Requirements 35-45:
  - 35: SELLER_WINNER_DETAILS_READY on initial completion
  - 36: READY idempotency / duplicate prevention
  - 37: WINNER_DETAILS_UNLOCKED on first paid unlock
  - 38: UNLOCKED idempotency / repeat unlock duplicate prevention
  - 39: SELLER_WINNER_DETAILS_UPDATED on authorized edit post-unlock
  - 40: No-op edit suppression (identical values => no update notification)
  - 41: Pre-unlock edit suppression (buyer edits before unlock => no update notification)
  - 42: Recipient isolation (Seller vs Buyer vs Third Party)
  - 43: Zero PII in Notification rows and messages
  - 44: WebSocket delivery and cross-user isolation
  - 45: Transaction rollback safety (on_commit behavior)
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from django.db import transaction
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token

from auctions.models import Auction, WinnerFulfillmentDetails
from auctions.services import WinnerDetailsUnlockService, WinnerFulfillmentService
from config.asgi import application
from notifications.models import Notification
from notifications.realtime import NOTIFICATION_CREATED_EVENT
from products.models import Product

WS_PATH = '/ws/notifications/'
WS_HEADERS = [(b'origin', b'http://localhost')]


class FulfillmentNotificationTests(TransactionTestCase):
    """End-to-end tests for fulfillment lifecycle notifications."""

    def setUp(self):
        super().setUp()
        self.seller = User.objects.create_user(
            username='seller_notif',
            email='seller_notif@bidkori.com',
            password='Password123!',
        )
        self.buyer = User.objects.create_user(
            username='buyer_notif',
            email='buyer_notif@bidkori.com',
            password='Password123!',
        )
        self.other_user = User.objects.create_user(
            username='other_notif',
            email='other_notif@bidkori.com',
            password='Password123!',
        )

        self.token_seller = Token.objects.create(user=self.seller)
        self.token_buyer = Token.objects.create(user=self.buyer)
        self.token_other = Token.objects.create(user=self.other_user)

        self.product = Product.objects.create(
            seller=self.seller,
            title='Vintage Leica M3',
            description='Legendary rangefinder camera in mint condition.',
        )

        now = timezone.now()
        self.auction = Auction.objects.create(
            product=self.product,
            starting_bid=Decimal('500.00'),
            current_highest_bid=Decimal('1500.00'),
            winning_bidder=self.buyer,
            start_time=now - timedelta(days=2),
            end_time=now - timedelta(hours=1),
            status=Auction.Status.CLOSED,
        )

        self.valid_payload = {
            'full_name': 'Rahim Uddin',
            'phone': '01712345678',
            'email': 'rahim@example.com',
            'address_line': 'House 12, Road 4, Sector 7',
            'area': 'Uttara',
            'district': 'Dhaka',
            'division': 'Dhaka',
            'postal_code': '1230',
            'preferred_contact_method': 'PHONE',
            'delivery_note': 'Ring the bell twice please',
        }

    def _connect(self):
        return WebsocketCommunicator(application, WS_PATH, headers=WS_HEADERS)

    async def _authenticate(self, communicator, token_key: str):
        await communicator.send_json_to({'type': 'authenticate', 'token': token_key})
        return await communicator.receive_json_from(timeout=2)

    def test_35_seller_winner_details_ready_on_submit(self):
        """Buyer completing fulfillment details triggers SELLER_WINNER_DETAILS_READY."""
        details = WinnerFulfillmentService.submit_details(
            self.auction.pk,
            self.buyer,
            data=self.valid_payload,
        )

        self.assertEqual(details.status, WinnerFulfillmentDetails.Status.COMPLETED)

        notifications = Notification.objects.filter(
            type=Notification.Type.SELLER_WINNER_DETAILS_READY
        )
        self.assertEqual(notifications.count(), 1)
        note = notifications.first()
        self.assertEqual(note.user, self.seller)
        self.assertEqual(note.auction, self.auction)
        self.assertIn(self.product.title, note.message)
        self.assertFalse(note.is_read)

    def test_36_ready_notification_idempotency(self):
        """Repeated submit or pre-unlock edits must NOT produce duplicate READY notifications."""
        # Initial submission
        WinnerFulfillmentService.submit_details(
            self.auction.pk,
            self.buyer,
            data=self.valid_payload,
        )
        self.assertEqual(
            Notification.objects.filter(
                type=Notification.Type.SELLER_WINNER_DETAILS_READY
            ).count(),
            1,
        )

        # Repeated identical submit
        WinnerFulfillmentService.submit_details(
            self.auction.pk,
            self.buyer,
            data=self.valid_payload,
        )
        self.assertEqual(
            Notification.objects.filter(
                type=Notification.Type.SELLER_WINNER_DETAILS_READY
            ).count(),
            1,
        )

        # Edit before unlock via submit_details
        edited_payload = dict(self.valid_payload)
        edited_payload['address_line'] = 'House 15, Road 6, Sector 9'
        WinnerFulfillmentService.submit_details(
            self.auction.pk,
            self.buyer,
            data=edited_payload,
        )
        self.assertEqual(
            Notification.objects.filter(
                type=Notification.Type.SELLER_WINNER_DETAILS_READY
            ).count(),
            1,
        )
        self.assertEqual(
            Notification.objects.filter(
                type=Notification.Type.SELLER_WINNER_DETAILS_UPDATED
            ).count(),
            0,
        )

    def test_37_winner_details_unlocked_on_first_unlock(self):
        """Seller acquiring paid unlock triggers WINNER_DETAILS_UNLOCKED for Buyer."""
        # Setup completed details
        WinnerFulfillmentService.submit_details(
            self.auction.pk,
            self.buyer,
            data=self.valid_payload,
        )

        # Seller unlocks
        unlock, newly_unlocked = WinnerDetailsUnlockService.unlock_for_seller(
            self.auction.pk,
            self.seller,
        )

        self.assertTrue(newly_unlocked)
        notifications = Notification.objects.filter(
            type=Notification.Type.WINNER_DETAILS_UNLOCKED
        )
        self.assertEqual(notifications.count(), 1)
        note = notifications.first()
        self.assertEqual(note.user, self.buyer)
        self.assertEqual(note.auction, self.auction)
        self.assertIn(self.product.title, note.message)
        self.assertFalse(note.is_read)

    def test_38_repeat_unlock_idempotency(self):
        """Repeated unlock requests must NOT generate duplicate WINNER_DETAILS_UNLOCKED notifications."""
        # Setup completed details
        WinnerFulfillmentService.submit_details(
            self.auction.pk,
            self.buyer,
            data=self.valid_payload,
        )

        # First unlock
        unlock1, newly1 = WinnerDetailsUnlockService.unlock_for_seller(
            self.auction.pk,
            self.seller,
        )
        self.assertTrue(newly1)
        self.assertEqual(
            Notification.objects.filter(
                type=Notification.Type.WINNER_DETAILS_UNLOCKED
            ).count(),
            1,
        )

        # Second unlock (idempotent repeat)
        unlock2, newly2 = WinnerDetailsUnlockService.unlock_for_seller(
            self.auction.pk,
            self.seller,
        )
        self.assertFalse(newly2)
        self.assertEqual(
            Notification.objects.filter(
                type=Notification.Type.WINNER_DETAILS_UNLOCKED
            ).count(),
            1,
        )

    def test_39_update_after_unlock_triggers_seller_updated(self):
        """Buyer editing relevant field AFTER seller unlocked triggers SELLER_WINNER_DETAILS_UPDATED."""
        # Complete & unlock
        WinnerFulfillmentService.submit_details(
            self.auction.pk,
            self.buyer,
            data=self.valid_payload,
        )
        WinnerDetailsUnlockService.unlock_for_seller(
            self.auction.pk,
            self.seller,
        )

        # Buyer edits phone via save_draft (PATCH flow)
        WinnerFulfillmentService.save_draft(
            self.auction.pk,
            self.buyer,
            data={'phone': '01899999999'},
        )

        updated_notes = Notification.objects.filter(
            type=Notification.Type.SELLER_WINNER_DETAILS_UPDATED
        )
        self.assertEqual(updated_notes.count(), 1)
        note = updated_notes.first()
        self.assertEqual(note.user, self.seller)
        self.assertEqual(note.auction, self.auction)
        self.assertIn(self.product.title, note.message)

    def test_40_no_op_update_suppression(self):
        """No-op update (identical field values) does NOT emit UPDATED notification."""
        WinnerFulfillmentService.submit_details(
            self.auction.pk,
            self.buyer,
            data=self.valid_payload,
        )
        WinnerDetailsUnlockService.unlock_for_seller(
            self.auction.pk,
            self.seller,
        )

        # Buyer sends exact same phone number
        WinnerFulfillmentService.save_draft(
            self.auction.pk,
            self.buyer,
            data={'phone': '01712345678'},
        )

        self.assertEqual(
            Notification.objects.filter(
                type=Notification.Type.SELLER_WINNER_DETAILS_UPDATED
            ).count(),
            0,
        )

    def test_41_pre_unlock_edit_suppression(self):
        """Buyer editing completed details BEFORE seller has unlocked does NOT emit UPDATED notification."""
        # Submit completed details (READY is emitted, but seller has NOT unlocked)
        WinnerFulfillmentService.submit_details(
            self.auction.pk,
            self.buyer,
            data=self.valid_payload,
        )

        # Buyer edits phone while seller is locked
        WinnerFulfillmentService.save_draft(
            self.auction.pk,
            self.buyer,
            data={'phone': '01888888888'},
        )

        self.assertEqual(
            Notification.objects.filter(
                type=Notification.Type.SELLER_WINNER_DETAILS_UPDATED
            ).count(),
            0,
        )
        # Still only the original READY notification
        self.assertEqual(
            Notification.objects.filter(
                type=Notification.Type.SELLER_WINNER_DETAILS_READY
            ).count(),
            1,
        )

    def test_42_recipient_isolation(self):
        """Notifications are strictly scoped to Seller or winning Buyer, never third parties."""
        WinnerFulfillmentService.submit_details(
            self.auction.pk,
            self.buyer,
            data=self.valid_payload,
        )
        WinnerDetailsUnlockService.unlock_for_seller(
            self.auction.pk,
            self.seller,
        )
        WinnerFulfillmentService.save_draft(
            self.auction.pk,
            self.buyer,
            data={'address_line': 'New Address Line 99'},
        )

        # Third party user has 0 notifications
        self.assertEqual(
            Notification.objects.filter(user=self.other_user).count(),
            0,
        )

        # Seller has exactly 2 notifications (READY and UPDATED)
        seller_types = set(
            Notification.objects.filter(user=self.seller).values_list('type', flat=True)
        )
        self.assertEqual(
            seller_types,
            {
                Notification.Type.SELLER_WINNER_DETAILS_READY,
                Notification.Type.SELLER_WINNER_DETAILS_UPDATED,
            },
        )

        # Buyer has exactly 1 notification (UNLOCKED)
        buyer_types = set(
            Notification.objects.filter(user=self.buyer).values_list('type', flat=True)
        )
        self.assertEqual(
            buyer_types,
            {Notification.Type.WINNER_DETAILS_UNLOCKED},
        )

    def test_43_no_pii_in_notification_records(self):
        """Notification title and message must NEVER contain Buyer contact or delivery PII."""
        WinnerFulfillmentService.submit_details(
            self.auction.pk,
            self.buyer,
            data=self.valid_payload,
        )
        WinnerDetailsUnlockService.unlock_for_seller(
            self.auction.pk,
            self.seller,
        )
        WinnerFulfillmentService.save_draft(
            self.auction.pk,
            self.buyer,
            data={'address_line': 'Confidential Manor 42', 'phone': '01999999999'},
        )

        pii_tokens = [
            '01712345678',
            '01999999999',
            'rahim@example.com',
            'House 12',
            'Sector 7',
            'Uttara',
            'Confidential Manor',
            '1230',
            'Ring the bell twice',
        ]

        for note in Notification.objects.all():
            for pii in pii_tokens:
                self.assertNotIn(
                    pii.lower(),
                    note.title.lower(),
                    f'PII token "{pii}" found in notification title: {note.title}',
                )
                self.assertNotIn(
                    pii.lower(),
                    note.message.lower(),
                    f'PII token "{pii}" found in notification message: {note.message}',
                )

    def test_44_websocket_delivery_and_isolation(self):
        """Connected recipients receive realtime events over WS; unrelated users do not."""
        async def scenario():
            comm_seller = self._connect()
            comm_buyer = self._connect()
            comm_other = self._connect()

            for comm in (comm_seller, comm_buyer, comm_other):
                connected, _ = await comm.connect()
                self.assertTrue(connected)

            auth_seller = await self._authenticate(comm_seller, self.token_seller.key)
            self.assertEqual(auth_seller['type'], 'authenticated')

            auth_buyer = await self._authenticate(comm_buyer, self.token_buyer.key)
            self.assertEqual(auth_buyer['type'], 'authenticated')

            auth_other = await self._authenticate(comm_other, self.token_other.key)
            self.assertEqual(auth_other['type'], 'authenticated')

            # 1. Buyer submits details -> Seller should receive SELLER_WINNER_DETAILS_READY
            await database_sync_to_async(WinnerFulfillmentService.submit_details)(
                self.auction.pk,
                self.buyer,
                data=self.valid_payload,
            )

            seller_event = await comm_seller.receive_json_from(timeout=2)
            self.assertEqual(seller_event['type'], NOTIFICATION_CREATED_EVENT)
            self.assertEqual(
                seller_event['notification']['type'],
                Notification.Type.SELLER_WINNER_DETAILS_READY,
            )
            self.assertEqual(
                seller_event['notification']['auction_id'],
                self.auction.pk,
            )
            # Verify no PII in WebSocket frame
            self.assertNotIn('01712345678', str(seller_event))
            self.assertNotIn('rahim@example.com', str(seller_event))
            self.assertNotIn('Uttara', str(seller_event))

            # Other user and buyer should NOT receive this event
            self.assertTrue(await comm_other.receive_nothing(timeout=0.3))
            self.assertTrue(await comm_buyer.receive_nothing(timeout=0.3))

            # 2. Seller unlocks -> Buyer should receive WINNER_DETAILS_UNLOCKED
            await database_sync_to_async(WinnerDetailsUnlockService.unlock_for_seller)(
                self.auction.pk,
                self.seller,
            )

            buyer_event = await comm_buyer.receive_json_from(timeout=2)
            self.assertEqual(buyer_event['type'], NOTIFICATION_CREATED_EVENT)
            self.assertEqual(
                buyer_event['notification']['type'],
                Notification.Type.WINNER_DETAILS_UNLOCKED,
            )
            self.assertEqual(
                buyer_event['notification']['auction_id'],
                self.auction.pk,
            )

            # Other user and seller should NOT receive this event
            self.assertTrue(await comm_other.receive_nothing(timeout=0.3))
            self.assertTrue(await comm_seller.receive_nothing(timeout=0.3))

            # Clean up communicators
            for comm in (comm_seller, comm_buyer, comm_other):
                await comm.disconnect()

        async_to_sync(scenario)()

    def test_45_transaction_rollback_safety(self):
        """Rolled back transactions do NOT execute on_commit or persist/emit notifications."""
        # Initial state: 0 notifications
        self.assertEqual(Notification.objects.count(), 0)

        try:
            with transaction.atomic():
                WinnerFulfillmentService.submit_details(
                    self.auction.pk,
                    self.buyer,
                    data=self.valid_payload,
                )
                # Force rollback
                raise RuntimeError('Simulated database abort')
        except RuntimeError:
            pass

        # Since transaction rolled back, on_commit did not run and no notification exists
        self.assertEqual(
            Notification.objects.filter(
                type=Notification.Type.SELLER_WINNER_DETAILS_READY
            ).count(),
            0,
        )
        self.assertEqual(WinnerFulfillmentDetails.objects.count(), 0)
