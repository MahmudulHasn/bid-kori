"""Exhaustive tests for WIN-F01 Buyer Winner Fulfillment Details."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase, APITransactionTestCase

from products.models import Product
from users.models import UserProfile, ensure_user_profile

from .models import Auction, Bid, WinnerFulfillmentDetails
from .realtime import build_auction_closed_payload, build_bid_accepted_payload
from .serializers import AuctionDetailSerializer, AuctionSerializer, BidSerializer, SellerSaleSerializer


class WinnerFulfillmentDetailsTests(APITestCase):
    def setUp(self):
        self.seller = User.objects.create_user(
            username='seller_win_test',
            email='seller@test.local',
            password='Password123!',
        )
        self.winner = User.objects.create_user(
            username='winner_buyer_test',
            email='winner@test.local',
            password='Password123!',
            first_name='Rahim',
            last_name='Uddin',
        )
        self.other_buyer = User.objects.create_user(
            username='other_buyer_test',
            email='other@test.local',
            password='Password123!',
        )
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.winner, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.other_buyer, role=UserProfile.Role.BUYER)

        self.seller_token = Token.objects.create(user=self.seller)
        self.winner_token = Token.objects.create(user=self.winner)
        self.other_buyer_token = Token.objects.create(user=self.other_buyer)

        # Create closed won auction
        now = timezone.now()
        self.product = Product.objects.create(
            seller=self.seller,
            title='Vintage Film Camera',
            description='Authentic 35mm rangefinder.',
        )
        self.closed_auction = Auction.objects.create(
            product=self.product,
            starting_bid=Decimal('5000.00'),
            current_highest_bid=Decimal('7500.00'),
            min_increment=Decimal('100.00'),
            start_time=now - timedelta(days=2),
            end_time=now - timedelta(hours=1),
            status=Auction.Status.CLOSED,
            winning_bidder=self.winner,
        )

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def _clear_auth(self):
        self.client.credentials()

    def test_anonymous_access_denied(self):
        """Anonymous requests must return 401 Unauthorized."""
        self._clear_auth()
        url = f'/api/buyer/won/{self.closed_auction.pk}/winner-details/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, 401)

        patch_resp = self.client.patch(url, {'full_name': 'Hacker'})
        self.assertEqual(patch_resp.status_code, 401)

        submit_resp = self.client.post(f'{url}submit/')
        self.assertEqual(submit_resp.status_code, 401)

    def test_non_winner_buyer_denied_idor(self):
        """Buyer B attempting to access or modify Buyer A's won auction receives 403 Forbidden."""
        self._auth(self.other_buyer_token)
        url = f'/api/buyer/won/{self.closed_auction.pk}/winner-details/'

        get_resp = self.client.get(url)
        self.assertEqual(get_resp.status_code, 403)
        self.assertIn('error', get_resp.data)

        patch_resp = self.client.patch(url, {'full_name': 'Intruder'})
        self.assertEqual(patch_resp.status_code, 403)

        submit_resp = self.client.post(f'{url}submit/')
        self.assertEqual(submit_resp.status_code, 403)

    def test_seller_denied_access(self):
        """Listing seller attempting to access Buyer winner-details receives 403 Forbidden."""
        self._auth(self.seller_token)
        url = f'/api/buyer/won/{self.closed_auction.pk}/winner-details/'

        get_resp = self.client.get(url)
        self.assertEqual(get_resp.status_code, 403)

        patch_resp = self.client.patch(url, {'address_line': 'Seller edit'})
        self.assertEqual(patch_resp.status_code, 403)

    def test_invalid_auction_states_rejected(self):
        """Cannot create or fetch winner details for LIVE, UPCOMING, CANCELLED, or no-winner auctions."""
        self._auth(self.winner_token)
        now = timezone.now()

        # 1. LIVE auction
        p_live = Product.objects.create(seller=self.seller, title='Live Product')
        live_auction = Auction.objects.create(
            product=p_live,
            starting_bid=Decimal('1000.00'),
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            status=Auction.Status.ACTIVE,
        )
        url_live = f'/api/buyer/won/{live_auction.pk}/winner-details/'
        self.assertEqual(self.client.get(url_live).status_code, 400)

        # 2. CANCELLED auction
        p_cancel = Product.objects.create(seller=self.seller, title='Cancelled Product')
        cancel_auction = Auction.objects.create(
            product=p_cancel,
            starting_bid=Decimal('1000.00'),
            start_time=now - timedelta(hours=5),
            end_time=now - timedelta(hours=1),
            status=Auction.Status.CANCELLED,
            winning_bidder=self.winner,
        )
        url_cancel = f'/api/buyer/won/{cancel_auction.pk}/winner-details/'
        self.assertEqual(self.client.get(url_cancel).status_code, 400)

        # 3. CLOSED with no winner
        p_nowin = Product.objects.create(seller=self.seller, title='No Winner Product')
        nowin_auction = Auction.objects.create(
            product=p_nowin,
            starting_bid=Decimal('1000.00'),
            start_time=now - timedelta(hours=5),
            end_time=now - timedelta(hours=1),
            status=Auction.Status.CLOSED,
            winning_bidder=None,
        )
        url_nowin = f'/api/buyer/won/{nowin_auction.pk}/winner-details/'
        self.assertEqual(self.client.get(url_nowin).status_code, 400)

    def test_first_get_returns_not_started_without_creating_row(self):
        """Initial GET returns NOT_STARTED and prefilled values; does not insert an empty DB row."""
        self._auth(self.winner_token)
        url = f'/api/buyer/won/{self.closed_auction.pk}/winner-details/'

        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'NOT_STARTED')
        self.assertEqual(response.data['completed_step'], 0)
        self.assertEqual(response.data['full_name'], 'Rahim Uddin')
        self.assertEqual(response.data['email'], 'winner@test.local')

        # Verify no DB row was created
        self.assertFalse(
            WinnerFulfillmentDetails.objects.filter(auction=self.closed_auction).exists()
        )

    def test_stepwise_draft_persistence_and_resume(self):
        """Winner completes Step 1, Step 2, Step 3, reloads, and resumes from draft."""
        self._auth(self.winner_token)
        url = f'/api/buyer/won/{self.closed_auction.pk}/winner-details/'

        # --- Step 1: Personal Information ---
        step1_payload = {
            'full_name': 'Rahim Uddin',
            'phone': '01712345678',
            'email': 'rahim@example.com',
            'completed_step': 1,
        }
        res1 = self.client.patch(url, step1_payload)
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res1.data['status'], 'DRAFT')
        self.assertEqual(res1.data['completed_step'], 1)
        self.assertEqual(res1.data['phone'], '01712345678')

        # Check DB row created
        db_details = WinnerFulfillmentDetails.objects.get(auction=self.closed_auction)
        self.assertEqual(db_details.completed_step, 1)
        self.assertEqual(db_details.buyer, self.winner)

        # --- Step 2: Delivery Address ---
        step2_payload = {
            'address_line': 'House 12, Road 4, Dhanmondi',
            'area': 'Dhanmondi',
            'district': 'Dhaka',
            'division': 'Dhaka',
            'postal_code': '1205',
            'completed_step': 2,
        }
        res2 = self.client.patch(url, step2_payload)
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.data['completed_step'], 2)
        self.assertEqual(res2.data['address_line'], 'House 12, Road 4, Dhanmondi')
        # Full name from Step 1 preserved
        self.assertEqual(res2.data['full_name'], 'Rahim Uddin')

        # Verify exactly ONE record exists in DB
        self.assertEqual(
            WinnerFulfillmentDetails.objects.filter(auction=self.closed_auction).count(),
            1,
        )

        # Simulate page refresh / resume
        reload_res = self.client.get(url)
        self.assertEqual(reload_res.status_code, 200)
        self.assertEqual(reload_res.data['status'], 'DRAFT')
        self.assertEqual(reload_res.data['completed_step'], 2)
        self.assertEqual(reload_res.data['address_line'], 'House 12, Road 4, Dhanmondi')

        # --- Step 3: Delivery Preferences ---
        step3_payload = {
            'preferred_contact_method': 'EMAIL',
            'delivery_note': 'Please call before delivery in the afternoon.',
            'completed_step': 3,
        }
        res3 = self.client.patch(url, step3_payload)
        self.assertEqual(res3.status_code, 200)
        self.assertEqual(res3.data['completed_step'], 3)
        self.assertEqual(res3.data['preferred_contact_method'], 'EMAIL')

    def test_final_submission_validation_and_completion(self):
        """Final submit validates all required fields, marks COMPLETED, sets submitted_at."""
        self._auth(self.winner_token)
        url = f'/api/buyer/won/{self.closed_auction.pk}/winner-details/'
        submit_url = f'{url}submit/'

        # Incomplete submission rejected
        incomplete_resp = self.client.post(submit_url)
        self.assertEqual(incomplete_resp.status_code, 400)
        self.assertIn('error', incomplete_resp.data)

        # Provide complete data via draft then submit
        full_payload = {
            'full_name': 'Rahim Uddin',
            'phone': '+8801712345678',
            'email': 'rahim@example.com',
            'address_line': 'Plot 45, Sector 7, Uttara',
            'area': 'Uttara',
            'district': 'Dhaka',
            'division': 'Dhaka',
            'postal_code': '1230',
            'preferred_contact_method': 'PHONE',
            'delivery_note': 'Fragile optics inside.',
            'completed_step': 3,
        }
        self.client.patch(url, full_payload)

        submit_resp = self.client.post(submit_url)
        self.assertEqual(submit_resp.status_code, 200)
        self.assertEqual(submit_resp.data['status'], 'COMPLETED')
        self.assertEqual(submit_resp.data['completed_step'], 4)
        self.assertIsNotNone(submit_resp.data['submitted_at'])

        # DB verification
        db_row = WinnerFulfillmentDetails.objects.get(auction=self.closed_auction)
        self.assertEqual(db_row.status, WinnerFulfillmentDetails.Status.COMPLETED)
        self.assertEqual(db_row.completed_step, 4)
        self.assertIsNotNone(db_row.submitted_at)

    def test_re_edit_after_completed_preserves_completed_status(self):
        """Editing details after submission updates data and timestamps but keeps COMPLETED status."""
        self._auth(self.winner_token)
        url = f'/api/buyer/won/{self.closed_auction.pk}/winner-details/'
        submit_url = f'{url}submit/'

        # Complete submission
        self.client.patch(url, {
            'full_name': 'Rahim Uddin',
            'phone': '01812345678',
            'address_line': 'House 1, Road 2',
            'area': 'Gulshan',
            'district': 'Dhaka',
            'division': 'Dhaka',
            'completed_step': 3,
        })
        self.client.post(submit_url)

        # Update note and address after completion
        edit_resp = self.client.patch(url, {
            'delivery_note': 'Updated instructions: leave with security.',
            'address_line': 'House 1 (Flat 4B), Road 2',
        })
        self.assertEqual(edit_resp.status_code, 200)
        self.assertEqual(edit_resp.data['status'], 'COMPLETED')
        self.assertEqual(edit_resp.data['delivery_note'], 'Updated instructions: leave with security.')
        self.assertEqual(edit_resp.data['address_line'], 'House 1 (Flat 4B), Road 2')

    def test_mass_assignment_protection(self):
        """Protected fields (buyer, auction, status, submitted_at) cannot be overridden by client."""
        self._auth(self.winner_token)
        url = f'/api/buyer/won/{self.closed_auction.pk}/winner-details/'

        malicious_payload = {
            'full_name': 'Rahim Genuine',
            'phone': '01711223344',
            'buyer': self.other_buyer.pk,
            'buyer_id': self.other_buyer.pk,
            'status': 'COMPLETED',
            'submitted_at': '2020-01-01T00:00:00Z',
        }
        res = self.client.patch(url, malicious_payload)
        self.assertEqual(res.status_code, 200)

        db_row = WinnerFulfillmentDetails.objects.get(auction=self.closed_auction)
        self.assertEqual(db_row.buyer, self.winner)
        self.assertEqual(db_row.status, 'DRAFT')
        self.assertIsNone(db_row.submitted_at)

    def test_phone_validation_normalizes_and_rejects_invalid(self):
        """Phone validation accepts valid BD numbers and rejects invalid numbers."""
        self._auth(self.winner_token)
        url = f'/api/buyer/won/{self.closed_auction.pk}/winner-details/'

        # Valid with spaces / dashes
        res = self.client.patch(url, {'phone': '019 1234-5678'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['phone'], '01912345678')

        # Invalid phone (too short)
        res_bad = self.client.patch(url, {'phone': '12345'})
        self.assertEqual(res_bad.status_code, 400)
        self.assertIn('phone', res_bad.data['error'])

    def test_pii_safety_audit(self):
        """Ensure winner PII (phone, email, address) is NEVER leaked in public, seller, bid, or WS payloads."""
        # 1. Create a completed fulfillment record
        WinnerFulfillmentDetails.objects.create(
            auction=self.closed_auction,
            buyer=self.winner,
            full_name='Rahim Secret Uddin',
            phone='01799887766',
            email='confidential@example.com',
            address_line='Confidential Secret Address 99',
            area='Banani',
            district='Dhaka',
            division='Dhaka',
            status=WinnerFulfillmentDetails.Status.COMPLETED,
            completed_step=4,
        )

        # 2. Public AuctionSerializer
        self._clear_auth()
        pub_ser = AuctionSerializer(self.closed_auction, context={'request': None}).data
        self.assertNotIn('phone', pub_ser)
        self.assertNotIn('email', pub_ser)
        self.assertNotIn('address_line', pub_ser)
        self.assertNotIn('full_name', pub_ser)
        # Context-sensitive status for anonymous is None
        self.assertIsNone(pub_ser.get('winner_fulfillment_status'))

        # 3. Seller Auction Serializer check (when seller views auction)
        seller_request = type('Request', (), {'user': self.seller})()
        seller_ser = AuctionDetailSerializer(
            self.closed_auction,
            context={'request': seller_request},
        ).data
        self.assertNotIn('phone', seller_ser)
        self.assertNotIn('email', seller_ser)
        self.assertNotIn('address_line', seller_ser)
        # Seller cannot see winner fulfillment status
        self.assertIsNone(seller_ser.get('winner_fulfillment_status'))

        # 4. Winner sees status NOT PII on auction detail
        winner_request = type('Request', (), {'user': self.winner})()
        winner_ser = AuctionSerializer(
            self.closed_auction,
            context={'request': winner_request},
        ).data
        self.assertEqual(winner_ser.get('winner_fulfillment_status'), 'COMPLETED')
        self.assertNotIn('phone', winner_ser)
        self.assertNotIn('email', winner_ser)
        self.assertNotIn('address_line', winner_ser)

        # 5. BidSerializer
        bid = Bid.objects.create(
            auction=self.closed_auction,
            bidder=self.winner,
            amount=Decimal('7500.00'),
        )
        bid_data = BidSerializer(bid).data
        self.assertNotIn('phone', bid_data)
        self.assertNotIn('address_line', bid_data)

        # 6. WebSocket broadcast payloads
        closed_payload = build_auction_closed_payload(self.closed_auction)
        self.assertNotIn('phone', closed_payload)
        self.assertNotIn('email', closed_payload)
        self.assertNotIn('address', closed_payload)

        bid_payload = build_bid_accepted_payload(bid, self.closed_auction)
        self.assertNotIn('phone', bid_payload)
        self.assertNotIn('address', bid_payload)

    def test_preferred_contact_method_email_requires_valid_email(self):
        """Cross-field check: If EMAIL is selected as preferred contact method, email is required."""
        self._auth(self.winner_token)
        payload = {
            'full_name': 'Rahim Uddin',
            'phone': '01712345678',
            'email': '',  # Blank email with preferred contact EMAIL
            'address_line': 'House 12, Road 4',
            'area': 'Dhanmondi',
            'district': 'Dhaka',
            'division': 'Dhaka',
            'postal_code': '1205',
            'preferred_contact_method': 'EMAIL',
        }
        res = self.client.post(
            f'/api/buyer/won/{self.closed_auction.pk}/winner-details/submit/',
            payload,
            format='json',
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('email', str(res.data).lower())

        # With valid email, submission succeeds
        payload['email'] = 'rahim@test.local'
        res_ok = self.client.post(
            f'/api/buyer/won/{self.closed_auction.pk}/winner-details/submit/',
            payload,
            format='json',
        )
        self.assertEqual(res_ok.status_code, 200)
        self.assertEqual(res_ok.data['status'], 'COMPLETED')

    def test_client_cannot_force_completed_step_4_in_draft(self):
        """Trust boundary: Draft PATCH cannot submit completed_step=4 nor mark COMPLETED."""
        self._auth(self.winner_token)
        patch_payload = {
            'full_name': 'Incomplete User',
            'completed_step': 4,
        }
        res = self.client.patch(
            f'/api/buyer/won/{self.closed_auction.pk}/winner-details/',
            patch_payload,
            format='json',
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('completed_step', str(res.data).lower())

        # Verify no completed status exists
        details = WinnerFulfillmentDetails.objects.filter(auction=self.closed_auction).first()
        if details:
            self.assertNotEqual(details.status, WinnerFulfillmentDetails.Status.COMPLETED)
            self.assertNotEqual(details.completed_step, 4)

    def test_repeated_submit_idempotency_preserves_first_submitted_at(self):
        """Repeated submit remains COMPLETED and preserves the original first-completion timestamp."""
        self._auth(self.winner_token)
        payload = {
            'full_name': 'Rahim Uddin',
            'phone': '01712345678',
            'email': 'rahim@test.local',
            'address_line': 'House 12, Road 4',
            'area': 'Dhanmondi',
            'district': 'Dhaka',
            'division': 'Dhaka',
            'postal_code': '1205',
            'preferred_contact_method': 'PHONE',
        }
        res1 = self.client.post(
            f'/api/buyer/won/{self.closed_auction.pk}/winner-details/submit/',
            payload,
            format='json',
        )
        self.assertEqual(res1.status_code, 200)
        first_submitted_at = res1.data['submitted_at']
        self.assertIsNotNone(first_submitted_at)

        # Repeated submit with same data
        res2 = self.client.post(
            f'/api/buyer/won/{self.closed_auction.pk}/winner-details/submit/',
            payload,
            format='json',
        )
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.data['status'], 'COMPLETED')
        self.assertEqual(res2.data['submitted_at'], first_submitted_at)
        self.assertEqual(WinnerFulfillmentDetails.objects.filter(auction=self.closed_auction).count(), 1)

    def test_completed_details_cannot_be_invalidated_by_patch(self):
        """Edit-after-complete: completed details cannot have required fields blanked out."""
        self._auth(self.winner_token)
        # First complete the details
        payload = {
            'full_name': 'Rahim Uddin',
            'phone': '01712345678',
            'email': 'rahim@test.local',
            'address_line': 'House 12, Road 4',
            'area': 'Dhanmondi',
            'district': 'Dhaka',
            'division': 'Dhaka',
            'postal_code': '1205',
            'preferred_contact_method': 'PHONE',
        }
        submit_res = self.client.post(
            f'/api/buyer/won/{self.closed_auction.pk}/winner-details/submit/',
            payload,
            format='json',
        )
        self.assertEqual(submit_res.status_code, 200)
        original_submitted_at = submit_res.data['submitted_at']

        # Attempt to blank out required address_line via PATCH
        bad_patch = self.client.patch(
            f'/api/buyer/won/{self.closed_auction.pk}/winner-details/',
            {'address_line': ''},
            format='json',
        )
        self.assertEqual(bad_patch.status_code, 400)
        self.assertIn('Cannot invalidate completed details', bad_patch.data.get('error', ''))

        # Verify DB still has valid address and remains COMPLETED
        details = WinnerFulfillmentDetails.objects.get(auction=self.closed_auction)
        self.assertEqual(details.status, WinnerFulfillmentDetails.Status.COMPLETED)
        self.assertEqual(details.address_line, 'House 12, Road 4')

        # Valid edit succeeds, maintains COMPLETED status and original submitted_at
        good_patch = self.client.patch(
            f'/api/buyer/won/{self.closed_auction.pk}/winner-details/',
            {'address_line': 'House 99, Road 8, Dhanmondi', 'delivery_note': 'Leave at desk'},
            format='json',
        )
        self.assertEqual(good_patch.status_code, 200)
        self.assertEqual(good_patch.data['status'], 'COMPLETED')
        self.assertEqual(good_patch.data['address_line'], 'House 99, Road 8, Dhanmondi')
        self.assertEqual(good_patch.data['submitted_at'], original_submitted_at)


class WinnerFulfillmentConcurrencyTests(APITransactionTestCase):
    """Test concurrent draft creation against PostgreSQL to verify row-lock concurrency safety."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='seller_conc_test',
            email='seller_conc@test.local',
            password='Password123!',
        )
        self.winner = User.objects.create_user(
            username='winner_conc_test',
            email='winner_conc@test.local',
            password='Password123!',
        )
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.winner, role=UserProfile.Role.BUYER)
        self.winner_token = Token.objects.create(user=self.winner)

        now = timezone.now()
        self.product = Product.objects.create(
            seller=self.seller,
            title='Concurrency Test Product',
            description='Testing concurrent drafts.',
        )
        self.auction = Auction.objects.create(
            product=self.product,
            starting_bid=Decimal('1000.00'),
            current_highest_bid=Decimal('1500.00'),
            min_increment=Decimal('50.00'),
            start_time=now - timedelta(days=1),
            end_time=now - timedelta(hours=1),
            status=Auction.Status.CLOSED,
            winning_bidder=self.winner,
        )

    def test_concurrent_first_draft_creates_single_row_safely(self):
        """Simultaneous first draft PATCH requests must not cause duplicate rows, IntegrityError, or 500."""
        results = []

        def _attempt(name):
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f'Token {self.winner_token.key}')
            return client.patch(
                f'/api/buyer/won/{self.auction.pk}/winner-details/',
                {'full_name': f'Buyer {name}', 'completed_step': 1},
                format='json',
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(_attempt, f'Worker_{i}') for i in range(2)]
            for fut in as_completed(futures):
                results.append(fut.result())

        for res in results:
            self.assertEqual(res.status_code, 200)

        # Must have exactly one row in PostgreSQL
        count = WinnerFulfillmentDetails.objects.filter(auction=self.auction).count()
        self.assertEqual(count, 1)
