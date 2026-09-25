"""Exhaustive tests for UNLOCK-B01 Seller Winner-Details Unlock Fee + Access Entitlement Backend."""

from datetime import timedelta
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor, as_completed

from django.contrib.auth.models import User
from django.db import connection
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase, APITransactionTestCase

from products.models import Product
from users.models import UserProfile, ensure_user_profile

from .fees import get_winner_details_unlock_fee
from .models import Auction, Bid, WinnerDetailsUnlock, WinnerFulfillmentDetails
from .services import WinnerDetailsUnlockService


class SellerWinnerDetailsUnlockTests(APITestCase):
    """Test suite covering Seller unlock readiness, payment entitlement, authorization, and privacy."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='seller_unlock_test',
            email='seller_unlock@test.local',
            password='Password123!',
        )
        self.other_seller = User.objects.create_user(
            username='other_seller_test',
            email='other_seller@test.local',
            password='Password123!',
        )
        self.winner = User.objects.create_user(
            username='winner_unlock_test',
            email='winner_unlock@test.local',
            password='Password123!',
            first_name='Kavita',
            last_name='Roy',
        )
        self.other_buyer = User.objects.create_user(
            username='other_buyer_unlock_test',
            email='other_buyer_unlock@test.local',
            password='Password123!',
        )

        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.other_seller, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.winner, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.other_buyer, role=UserProfile.Role.BUYER)

        self.seller_token = Token.objects.create(user=self.seller)
        self.other_seller_token = Token.objects.create(user=self.other_seller)
        self.winner_token = Token.objects.create(user=self.winner)
        self.other_buyer_token = Token.objects.create(user=self.other_buyer)

        now = timezone.now()
        self.product = Product.objects.create(
            seller=self.seller,
            title='Classic Leather Bag',
            description='Handcrafted leather messenger bag.',
        )
        self.closed_auction = Auction.objects.create(
            product=self.product,
            starting_bid=Decimal('3000.00'),
            current_highest_bid=Decimal('4500.00'),
            min_increment=Decimal('100.00'),
            start_time=now - timedelta(days=2),
            end_time=now - timedelta(hours=2),
            status=Auction.Status.CLOSED,
            winning_bidder=self.winner,
        )

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def _clear_auth(self):
        self.client.credentials()

    def _create_completed_fulfillment(self, auction=None, buyer=None):
        target_auction = auction or self.closed_auction
        target_buyer = buyer or self.winner
        return WinnerFulfillmentDetails.objects.create(
            auction=target_auction,
            buyer=target_buyer,
            full_name='Kavita Roy',
            phone='+8801711223344',
            email='kavita@test.local',
            address_line='House 12, Road 4, Sector 7',
            area='Uttara',
            district='Dhaka',
            division='Dhaka',
            postal_code='1230',
            preferred_contact_method=WinnerFulfillmentDetails.ContactMethod.PHONE,
            delivery_note='Call before delivery.',
            status=WinnerFulfillmentDetails.Status.COMPLETED,
            completed_step=4,
            submitted_at=timezone.now() - timedelta(hours=1),
        )

    # ------------------------------------------------------------------------
    # 49. STATUS BEFORE COMPLETION
    # ------------------------------------------------------------------------
    def test_status_before_completion_not_started(self):
        """When winner fulfillment has not started, status is NOT_STARTED and can_unlock is False."""
        self._auth(self.seller_token)
        url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/status/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['auction_id'], self.closed_auction.pk)
        self.assertTrue(response.data['winner_exists'])
        self.assertEqual(response.data['details_status'], 'NOT_STARTED')
        self.assertFalse(response.data['can_unlock'])
        self.assertFalse(response.data['is_unlocked'])
        self.assertEqual(response.data['currency'], 'BDT')
        # ZERO Buyer PII
        self.assertNotIn('full_name', response.data)
        self.assertNotIn('phone', response.data)
        self.assertNotIn('address_line', response.data)

    def test_status_before_completion_draft(self):
        """When winner fulfillment is in DRAFT, can_unlock is False with zero PII leaked."""
        WinnerFulfillmentDetails.objects.create(
            auction=self.closed_auction,
            buyer=self.winner,
            full_name='Kavita Draft',
            phone='+8801711223344',
            status=WinnerFulfillmentDetails.Status.DRAFT,
            completed_step=1,
        )
        self._auth(self.seller_token)
        url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/status/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['details_status'], 'DRAFT')
        self.assertFalse(response.data['can_unlock'])
        self.assertFalse(response.data['is_unlocked'])
        # ZERO Buyer PII
        self.assertNotIn('full_name', response.data)
        self.assertNotIn('phone', response.data)

    # ------------------------------------------------------------------------
    # 50. STATUS READY
    # ------------------------------------------------------------------------
    def test_status_ready_when_completed(self):
        """When details are COMPLETED, can_unlock is True and fee is returned without PII."""
        self._create_completed_fulfillment()
        self._auth(self.seller_token)
        url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/status/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['details_status'], 'COMPLETED')
        self.assertTrue(response.data['can_unlock'])
        self.assertFalse(response.data['is_unlocked'])
        self.assertEqual(Decimal(str(response.data['unlock_fee'])), Decimal('90.00'))
        self.assertEqual(Decimal(str(response.data['unlock_fee_percent'])), Decimal('2.00'))
        self.assertEqual(response.data['currency'], 'BDT')
        # ZERO Buyer PII
        self.assertNotIn('full_name', response.data)
        self.assertNotIn('phone', response.data)
        self.assertNotIn('address_line', response.data)

    # ------------------------------------------------------------------------
    # 51. SUCCESSFUL UNLOCK
    # ------------------------------------------------------------------------
    def test_successful_unlock(self):
        """Seller POST unlock records paid mock transaction, snapshots fee, and grants entitlement."""
        self._create_completed_fulfillment()
        self._auth(self.seller_token)
        url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/unlock/'
        response = self.client.post(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['auction_id'], self.closed_auction.pk)
        self.assertEqual(response.data['status'], 'PAID')
        self.assertTrue(response.data['is_unlocked'])
        self.assertFalse(response.data['already_unlocked'])
        self.assertEqual(Decimal(str(response.data['fee_amount'])), Decimal('90.00'))
        self.assertEqual(response.data['currency'], 'BDT')
        self.assertTrue(response.data['payment_reference'].startswith('WDU-'))
        self.assertIsNotNone(response.data['unlocked_at'])

        # Verify DB persistence
        unlock = WinnerDetailsUnlock.objects.get(auction=self.closed_auction)
        self.assertEqual(unlock.seller, self.seller)
        self.assertEqual(unlock.status, WinnerDetailsUnlock.Status.PAID)
        self.assertEqual(unlock.fee_amount, Decimal('90.00'))
        self.assertEqual(unlock.currency, 'BDT')
        self.assertIsNotNone(unlock.paid_at)
        self.assertIsNotNone(unlock.unlocked_at)

    # ------------------------------------------------------------------------
    # 52. DETAILS AFTER UNLOCK
    # ------------------------------------------------------------------------
    def test_details_after_unlock_read_only(self):
        """After paying unlock fee, Seller retrieves Buyer fulfillment details read-only."""
        self._create_completed_fulfillment()
        self._auth(self.seller_token)

        # Unlock first
        self.client.post(f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/unlock/')

        # Retrieve details
        details_url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/'
        response = self.client.get(details_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['full_name'], 'Kavita Roy')
        self.assertEqual(response.data['phone'], '+8801711223344')
        self.assertEqual(response.data['email'], 'kavita@test.local')
        self.assertEqual(response.data['address_line'], 'House 12, Road 4, Sector 7')
        self.assertEqual(response.data['area'], 'Uttara')
        self.assertEqual(response.data['district'], 'Dhaka')
        self.assertEqual(response.data['division'], 'Dhaka')
        self.assertEqual(response.data['postal_code'], '1230')
        self.assertEqual(response.data['preferred_contact_method'], 'PHONE')
        self.assertEqual(response.data['delivery_note'], 'Call before delivery.')
        self.assertEqual(response.data['buyer_username'], self.winner.username)

        # Seller cannot mutate details (read-only endpoint)
        patch_resp = self.client.patch(details_url, {'address_line': 'Hacked Address'})
        self.assertEqual(patch_resp.status_code, 405)
        post_resp = self.client.post(details_url, {'address_line': 'Hacked Address'})
        self.assertEqual(post_resp.status_code, 405)
        del_resp = self.client.delete(details_url)
        self.assertEqual(del_resp.status_code, 405)

    # ------------------------------------------------------------------------
    # 53. DETAILS BEFORE UNLOCK
    # ------------------------------------------------------------------------
    def test_details_before_unlock_denied(self):
        """Seller requesting details before paying unlock fee receives 403 Forbidden with zero PII."""
        self._create_completed_fulfillment()
        self._auth(self.seller_token)
        details_url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/'
        response = self.client.get(details_url)
        self.assertEqual(response.status_code, 403)
        self.assertIn('error', response.data)
        self.assertIn('must be unlocked', response.data['error'])
        # ZERO Buyer PII
        self.assertNotIn('full_name', response.data)
        self.assertNotIn('phone', response.data)
        self.assertNotIn('address_line', response.data)

    # ------------------------------------------------------------------------
    # 54. OTHER SELLER ACCESS (IDOR)
    # ------------------------------------------------------------------------
    def test_other_seller_denied(self):
        """Seller B cannot check status, unlock, or view details for Seller A's auction."""
        self._create_completed_fulfillment()
        self._auth(self.other_seller_token)

        status_url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/status/'
        resp_status = self.client.get(status_url)
        self.assertEqual(resp_status.status_code, 403)
        self.assertIn('error', resp_status.data)

        unlock_url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/unlock/'
        resp_unlock = self.client.post(unlock_url)
        self.assertEqual(resp_unlock.status_code, 403)
        self.assertIn('error', resp_unlock.data)

        details_url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/'
        resp_details = self.client.get(details_url)
        self.assertEqual(resp_details.status_code, 403)
        self.assertIn('error', resp_details.data)

    # ------------------------------------------------------------------------
    # 55. BUYER ACCESS DENIED
    # ------------------------------------------------------------------------
    def test_buyer_denied_seller_endpoints(self):
        """Buyer (including winning buyer) cannot call Seller unlock endpoints."""
        self._create_completed_fulfillment()
        self._auth(self.winner_token)

        status_url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/status/'
        self.assertEqual(self.client.get(status_url).status_code, 403)

        unlock_url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/unlock/'
        self.assertEqual(self.client.post(unlock_url).status_code, 403)

        details_url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/'
        self.assertEqual(self.client.get(details_url).status_code, 403)

    # ------------------------------------------------------------------------
    # 56. ANONYMOUS ACCESS DENIED
    # ------------------------------------------------------------------------
    def test_anonymous_access_denied(self):
        """Unauthenticated requests return 401 Unauthorized with no data leakage."""
        self._clear_auth()
        status_url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/status/'
        self.assertEqual(self.client.get(status_url).status_code, 401)

        unlock_url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/unlock/'
        self.assertEqual(self.client.post(unlock_url).status_code, 401)

        details_url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/'
        self.assertEqual(self.client.get(details_url).status_code, 401)

    # ------------------------------------------------------------------------
    # 57. MASS ASSIGNMENT PROTECTION
    # ------------------------------------------------------------------------
    def test_mass_assignment_protection(self):
        """Client cannot inject fee_amount, currency, seller, or status in request body."""
        self._create_completed_fulfillment()
        self._auth(self.seller_token)
        url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/unlock/'
        malicious_payload = {
            'fee_amount': '0.00',
            'currency': 'USD',
            'seller': self.other_seller.pk,
            'status': 'PENDING',
            'paid_at': '2020-01-01T00:00:00Z',
            'payment_reference': 'HACKED-REF',
        }
        response = self.client.post(url, malicious_payload, format='json')
        self.assertEqual(response.status_code, 200)

        # Authoritative fields must be server-controlled
        self.assertEqual(Decimal(str(response.data['fee_amount'])), Decimal('90.00'))
        self.assertEqual(response.data['currency'], 'BDT')
        self.assertEqual(response.data['status'], 'PAID')
        self.assertNotEqual(response.data['payment_reference'], 'HACKED-REF')

        unlock = WinnerDetailsUnlock.objects.get(auction=self.closed_auction)
        self.assertEqual(unlock.fee_amount, Decimal('90.00'))
        self.assertEqual(unlock.currency, 'BDT')
        self.assertEqual(unlock.seller, self.seller)

    # ------------------------------------------------------------------------
    # 58. IDEMPOTENT UNLOCK
    # ------------------------------------------------------------------------
    def test_idempotent_unlock(self):
        """POST unlock twice returns already_unlocked=True without double-charging or creating a second row."""
        self._create_completed_fulfillment()
        self._auth(self.seller_token)
        url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/unlock/'

        first_resp = self.client.post(url)
        self.assertEqual(first_resp.status_code, 200)
        self.assertFalse(first_resp.data['already_unlocked'])

        second_resp = self.client.post(url)
        self.assertEqual(second_resp.status_code, 200)
        self.assertTrue(second_resp.data['already_unlocked'])
        self.assertEqual(second_resp.data['is_unlocked'], True)
        self.assertEqual(second_resp.data['payment_reference'], first_resp.data['payment_reference'])

        # Exactly 1 record in database
        self.assertEqual(
            WinnerDetailsUnlock.objects.filter(auction=self.closed_auction).count(),
            1,
        )

    # ------------------------------------------------------------------------
    # 60. BUYER UPDATE AFTER UNLOCK
    # ------------------------------------------------------------------------
    def test_buyer_update_after_unlock(self):
        """Buyer editing fulfillment details after Seller unlock does not invalidate entitlement or charge again."""
        self._create_completed_fulfillment()
        self._auth(self.seller_token)

        # Unlock
        self.client.post(f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/unlock/')

        # Buyer edits address
        self._auth(self.winner_token)
        buyer_url = f'/api/buyer/won/{self.closed_auction.pk}/winner-details/'
        edit_resp = self.client.patch(
            buyer_url,
            {'address_line': 'House 99, Road 8, Dhanmondi'},
            format='json',
        )
        self.assertEqual(edit_resp.status_code, 200)

        # Seller views again: updated address is visible without second payment
        self._auth(self.seller_token)
        seller_url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/'
        seller_resp = self.client.get(seller_url)
        self.assertEqual(seller_resp.status_code, 200)
        self.assertEqual(seller_resp.data['address_line'], 'House 99, Road 8, Dhanmondi')

        # No second unlock row
        self.assertEqual(
            WinnerDetailsUnlock.objects.filter(auction=self.closed_auction).count(),
            1,
        )

    # ------------------------------------------------------------------------
    # 61. INVALID AUCTION / FULFILLMENT STATES
    # ------------------------------------------------------------------------
    def test_invalid_states_rejected(self):
        """Unlock is rejected for LIVE, CANCELLED, no-winner, DRAFT, and inconsistent data auctions."""
        now = timezone.now()
        self._auth(self.seller_token)

        # 1. LIVE auction
        p_live = Product.objects.create(seller=self.seller, title='Live Product')
        live_auction = Auction.objects.create(
            product=p_live,
            starting_bid=Decimal('1000.00'),
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            status=Auction.Status.ACTIVE,
        )
        resp_live = self.client.post(f'/api/seller/auctions/{live_auction.pk}/winner-details/unlock/')
        self.assertEqual(resp_live.status_code, 400)

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
        resp_cancel = self.client.post(f'/api/seller/auctions/{cancel_auction.pk}/winner-details/unlock/')
        self.assertEqual(resp_cancel.status_code, 400)

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
        resp_nowin = self.client.post(f'/api/seller/auctions/{nowin_auction.pk}/winner-details/unlock/')
        self.assertEqual(resp_nowin.status_code, 400)

        # 4. Winner details in DRAFT
        p_draft = Product.objects.create(seller=self.seller, title='Draft Fulfillment Product')
        draft_auction = Auction.objects.create(
            product=p_draft,
            starting_bid=Decimal('1000.00'),
            start_time=now - timedelta(hours=5),
            end_time=now - timedelta(hours=1),
            status=Auction.Status.CLOSED,
            winning_bidder=self.winner,
        )
        WinnerFulfillmentDetails.objects.create(
            auction=draft_auction,
            buyer=self.winner,
            status=WinnerFulfillmentDetails.Status.DRAFT,
            completed_step=2,
        )
        resp_draft = self.client.post(f'/api/seller/auctions/{draft_auction.pk}/winner-details/unlock/')
        self.assertEqual(resp_draft.status_code, 400)
        self.assertIn('not ready to unlock yet', resp_draft.data['error'])

        # 5. Inconsistent historical data: fulfillment buyer != auction winner
        p_incons = Product.objects.create(seller=self.seller, title='Inconsistent Product')
        incons_auction = Auction.objects.create(
            product=p_incons,
            starting_bid=Decimal('1000.00'),
            start_time=now - timedelta(hours=5),
            end_time=now - timedelta(hours=1),
            status=Auction.Status.CLOSED,
            winning_bidder=self.winner,
        )
        WinnerFulfillmentDetails.objects.create(
            auction=incons_auction,
            buyer=self.other_buyer,  # Mismatched buyer!
            full_name='Impostor',
            phone='+8801700000000',
            address_line='Nowhere',
            area='Area',
            district='Dhaka',
            division='Dhaka',
            status=WinnerFulfillmentDetails.Status.COMPLETED,
            completed_step=4,
        )
        resp_incons = self.client.post(f'/api/seller/auctions/{incons_auction.pk}/winner-details/unlock/')
        self.assertEqual(resp_incons.status_code, 400)
        self.assertIn('invalid', resp_incons.data['error'])

    # ------------------------------------------------------------------------
    # 62. PII LEAK AUDIT ACROSS ALL ENDPOINTS
    # ------------------------------------------------------------------------
    def test_pii_isolation_across_endpoints(self):
        """Buyer PII never leaks into public, status, seller sales, or bid history before unlock."""
        self._create_completed_fulfillment()

        # 1. Seller status endpoint
        self._auth(self.seller_token)
        status_resp = self.client.get(f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/status/')
        status_text = str(status_resp.data)
        self.assertNotIn('+8801711223344', status_text)
        self.assertNotIn('House 12, Road 4', status_text)
        self.assertNotIn('Kavita Roy', status_text)

        # 2. Public auction detail
        self._clear_auth()
        pub_detail = self.client.get(f'/api/auctions/{self.closed_auction.pk}/')
        pub_text = str(pub_detail.data)
        self.assertNotIn('+8801711223344', pub_text)
        self.assertNotIn('House 12, Road 4', pub_text)
        self.assertNotIn('kavita@test.local', pub_text)

        # 3. Public auction list
        pub_list = self.client.get('/api/auctions/')
        list_text = str(pub_list.data)
        self.assertNotIn('+8801711223344', list_text)
        self.assertNotIn('House 12, Road 4', list_text)

        # 4. Bid history
        history_resp = self.client.get(f'/api/auctions/{self.closed_auction.pk}/history/')
        hist_text = str(history_resp.data)
        self.assertNotIn('+8801711223344', hist_text)
        self.assertNotIn('House 12, Road 4', hist_text)

    # ------------------------------------------------------------------------
    # Configurable Fee Override
    # ------------------------------------------------------------------------
    def test_fee_configuration_override(self):
        """Setting WINNER_DETAILS_UNLOCK_FEE overrides the snapshot fee dynamically."""
        self._create_completed_fulfillment()
        self._auth(self.seller_token)

        with override_settings(WINNER_DETAILS_UNLOCK_FEE=Decimal('75.00')):
            status_resp = self.client.get(f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/status/')
            self.assertEqual(Decimal(str(status_resp.data['unlock_fee'])), Decimal('75.00'))

            unlock_resp = self.client.post(f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/unlock/')
            self.assertEqual(Decimal(str(unlock_resp.data['fee_amount'])), Decimal('75.00'))

        # After setting reverts, the recorded unlock snapshot preserves 75.00
        unlock = WinnerDetailsUnlock.objects.get(auction=self.closed_auction)
        self.assertEqual(unlock.fee_amount, Decimal('75.00'))

    # ------------------------------------------------------------------------
    # 57. SSLCOMMERZ GATEWAY INTEGRATION TESTS
    # ------------------------------------------------------------------------
    def test_sslcommerz_initiate_unlock(self):
        """Initiating unlock with gateway='sslcommerz' returns GatewayPageURL and creates PENDING record."""
        from unittest.mock import patch

        self._create_completed_fulfillment()
        self._auth(self.seller_token)
        url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/unlock/'

        mock_gw_url = 'https://sandbox.sslcommerz.com/EasyCheckOut/testcde12345'
        with patch('auctions.sslcommerz.initiate_sslcommerz_session', return_value=mock_gw_url) as mock_init:
            response = self.client.post(url, {'gateway': 'sslcommerz'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'PENDING')
        self.assertFalse(response.data['is_unlocked'])
        self.assertEqual(response.data['gateway_url'], mock_gw_url)
        self.assertTrue(response.data['payment_reference'].startswith('WDU-'))
        mock_init.assert_called_once()

        # Check DB state
        unlock = WinnerDetailsUnlock.objects.get(auction=self.closed_auction)
        self.assertEqual(unlock.status, WinnerDetailsUnlock.Status.PENDING)
        self.assertEqual(unlock.payment_method, 'SSLCOMMERZ')
        self.assertEqual(unlock.fee_amount, Decimal('90.00'))

    def test_sslcommerz_success_callback_flow(self):
        """SSLCommerz POST success callback verifies val_id and marks unlock as PAID."""
        from unittest.mock import patch

        self._create_completed_fulfillment()
        self._auth(self.seller_token)

        # Initiate
        tran_id = f'WDU-{self.closed_auction.pk}-TESTABC'
        unlock = WinnerDetailsUnlock.objects.create(
            auction=self.closed_auction,
            seller=self.seller,
            winner_details=self.closed_auction.winner_fulfillment_details,
            fee_amount=Decimal('90.00'),
            currency='BDT',
            status=WinnerDetailsUnlock.Status.PENDING,
            payment_reference=tran_id,
            payment_method='SSLCOMMERZ',
        )

        mock_validation = {
            'status': 'VALID',
            'val_id': 'VAL999888',
            'amount': '90.00',
            'currency': 'BDT',
            'bank_tran_id': 'BKASH123456',
            'card_type': 'BKASH-BKash',
        }

        with patch('auctions.sslcommerz.validate_sslcommerz_payment', return_value=mock_validation):
            callback_resp = self.client.post(
                '/api/seller/payment/success/',
                {
                    'tran_id': tran_id,
                    'val_id': 'VAL999888',
                    'bank_tran_id': 'BKASH123456',
                    'card_type': 'BKASH-BKash',
                },
            )

        self.assertEqual(callback_resp.status_code, 302)
        self.assertIn(f'/seller/auctions/{self.closed_auction.pk}?payment=success', callback_resp.url)

        unlock.refresh_from_db()
        self.assertEqual(unlock.status, WinnerDetailsUnlock.Status.PAID)
        self.assertEqual(unlock.val_id, 'VAL999888')
        self.assertEqual(unlock.bank_tran_id, 'BKASH123456')
        self.assertEqual(unlock.card_type, 'BKASH-BKash')
        self.assertIsNotNone(unlock.paid_at)
        self.assertIsNotNone(unlock.unlocked_at)

        # Winner details are now readable by seller
        details_url = f'/api/seller/auctions/{self.closed_auction.pk}/winner-details/'
        det_resp = self.client.get(details_url)
        self.assertEqual(det_resp.status_code, 200)
        self.assertEqual(det_resp.data['full_name'], 'Kavita Roy')

    def test_sslcommerz_fail_callback_flow(self):
        """SSLCommerz POST fail callback marks unlock as FAILED."""
        self._create_completed_fulfillment()
        tran_id = f'WDU-{self.closed_auction.pk}-FAILABC'
        unlock = WinnerDetailsUnlock.objects.create(
            auction=self.closed_auction,
            seller=self.seller,
            winner_details=self.closed_auction.winner_fulfillment_details,
            fee_amount=Decimal('90.00'),
            currency='BDT',
            status=WinnerDetailsUnlock.Status.PENDING,
            payment_reference=tran_id,
            payment_method='SSLCOMMERZ',
        )

        resp = self.client.post(
            '/api/seller/payment/fail/',
            {'tran_id': tran_id, 'status': 'FAILED'},
        )
        self.assertEqual(resp.status_code, 302)
        self.assertIn(f'/seller/auctions/{self.closed_auction.pk}?payment=failed', resp.url)

        unlock.refresh_from_db()
        self.assertEqual(unlock.status, WinnerDetailsUnlock.Status.FAILED)


class SellerWinnerDetailsConcurrencyTests(APITransactionTestCase):
    """PostgreSQL concurrency test: simultaneous unlock requests must create exactly one entitlement."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='seller_conc_unlock',
            email='seller_conc_u@test.local',
            password='Password123!',
        )
        self.winner = User.objects.create_user(
            username='winner_conc_unlock',
            email='winner_conc_u@test.local',
            password='Password123!',
        )
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.winner, role=UserProfile.Role.BUYER)
        self.seller_token = Token.objects.create(user=self.seller)

        now = timezone.now()
        self.product = Product.objects.create(
            seller=self.seller,
            title='Concurrent Unlock Product',
            description='Testing concurrent unlock safety.',
        )
        self.auction = Auction.objects.create(
            product=self.product,
            starting_bid=Decimal('2000.00'),
            current_highest_bid=Decimal('3500.00'),
            min_increment=Decimal('100.00'),
            start_time=now - timedelta(days=2),
            end_time=now - timedelta(hours=1),
            status=Auction.Status.CLOSED,
            winning_bidder=self.winner,
        )
        self.fulfillment = WinnerFulfillmentDetails.objects.create(
            auction=self.auction,
            buyer=self.winner,
            full_name='Concurrent Winner',
            phone='+8801811223344',
            email='winner_conc@test.local',
            address_line='Road 1, Dhanmondi',
            area='Dhanmondi',
            district='Dhaka',
            division='Dhaka',
            preferred_contact_method=WinnerFulfillmentDetails.ContactMethod.PHONE,
            status=WinnerFulfillmentDetails.Status.COMPLETED,
            completed_step=4,
            submitted_at=now - timedelta(minutes=30),
        )

    def test_concurrent_unlock_creates_single_record(self):
        """Simultaneous unlock POST requests must result in exactly 1 unlock record and no 500s."""
        if not connection.features.has_select_for_update:
            self.skipTest(
                'Row locking requires select_for_update (PostgreSQL).'
            )

        results = []

        def _attempt():
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f'Token {self.seller_token.key}')
            return client.post(
                f'/api/seller/auctions/{self.auction.pk}/winner-details/unlock/'
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(_attempt) for _ in range(2)]
            for fut in as_completed(futures):
                results.append(fut.result())

        for res in results:
            self.assertEqual(res.status_code, 200)
            self.assertNotEqual(res.status_code, 500)

        # Both return 200, one created=True (already_unlocked=False) and one already_unlocked=True
        already_unlocked_flags = sorted([r.data['already_unlocked'] for r in results])
        self.assertEqual(already_unlocked_flags, [False, True])

        # Exactly 1 record in PostgreSQL
        self.assertEqual(
            WinnerDetailsUnlock.objects.filter(auction=self.auction).count(),
            1,
        )
        unlock = WinnerDetailsUnlock.objects.get(auction=self.auction)
        self.assertEqual(unlock.status, WinnerDetailsUnlock.Status.PAID)
        self.assertEqual(unlock.fee_amount, Decimal('70.00'))



