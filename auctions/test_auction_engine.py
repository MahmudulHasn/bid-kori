"""
Comprehensive auction-engine behavioral tests (API + services).

Covers authentication gates, auction creation validation, bidding/closing
edge cases, and payment checkout rules. Prefers observable business outcomes
over implementation details.

Concurrency: ``BidServiceConcurrencyTests`` in ``tests.py`` runs threaded
contention only when the DB supports ``select_for_update`` (PostgreSQL).
SQLite lacks row locking suitable for that scenario; a sequential contended
bid test still runs on SQLite.
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from products.models import Product

from .models import Auction, Bid, Payment
from .services import AuctionLifecycleService, BidService


class AuthenticationAndProtectedEndpointTests(APITestCase):
    """Registration/login behavior and token-gated auction endpoints."""

    def setUp(self):
        self.password = 'secure-pass-123'
        self.user = User.objects.create_user(
            username='engine_alice',
            email='engine_alice@test.com',
            password=self.password,
        )

    def test_registration_returns_token_and_user(self):
        response = self.client.post(
            '/api/users/register/',
            {
                'username': 'engine_new',
                'email': 'engine_new@test.com',
                'password': 'password12',
                'confirm_password': 'password12',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['username'], 'engine_new')
        created = User.objects.get(username='engine_new')
        self.assertTrue(created.check_password('password12'))
        self.assertNotEqual(created.password, 'password12')

    def test_login_and_invalid_login(self):
        ok = self.client.post(
            '/api/users/login/',
            {'username': 'engine_alice', 'password': self.password},
            format='json',
        )
        self.assertEqual(ok.status_code, 200)
        self.assertIn('token', ok.data)

        bad = self.client.post(
            '/api/users/login/',
            {'username': 'engine_alice', 'password': 'wrong-password'},
            format='json',
        )
        self.assertEqual(bad.status_code, 401)
        self.assertEqual(bad.data.get('error'), 'Invalid credentials.')

    def test_protected_endpoints_reject_anonymous(self):
        now = timezone.now()
        product = Product.objects.create(
            seller=self.user,
            title='Gate Item',
            description='Desc',
        )
        auction = Auction.objects.create(
            product=product,
            starting_bid=100,
            current_highest_bid=100,
            min_increment=10,
            start_time=now - timedelta(minutes=5),
            end_time=now + timedelta(hours=1),
            status=Auction.Status.ACTIVE,
        )

        create = self.client.post(
            '/api/auctions/',
            {
                'product': {
                    'title': 'Blocked',
                    'description': 'x',
                    'condition': 'USED_GOOD',
                },
                'starting_bid': '50.00',
                'start_time': now.isoformat(),
                'end_time': (now + timedelta(days=1)).isoformat(),
            },
            format='json',
        )
        self.assertIn(create.status_code, (401, 403))

        bid = self.client.post(
            f'/api/auctions/{auction.pk}/place-bid/',
            {'amount': '110.00'},
            format='json',
        )
        self.assertIn(bid.status_code, (401, 403))

        my_bids = self.client.get('/api/auctions/my-bids/')
        self.assertIn(my_bids.status_code, (401, 403))

        checkout = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertIn(checkout.status_code, (401, 403))


class AuctionCreationAPITests(APITestCase):
    """POST /api/auctions/ validation for pricing and schedule fields."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='create_seller',
            email='create_seller@test.com',
            password='pass12345',
        )
        from users.models import ensure_user_profile, UserProfile

        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        self.token = Token.objects.create(user=self.seller)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')
        self.now = timezone.now()

    def _payload(self, **overrides):
        body = {
            'product': {
                'title': 'Create Suite Camera',
                'description': 'Body',
                'condition': 'USED_GOOD',
            },
            'starting_bid': '1000.00',
            'min_increment': '50.00',
            'start_time': self.now.isoformat(),
            'end_time': (self.now + timedelta(days=1)).isoformat(),
        }
        body.update(overrides)
        return body

    def test_valid_auction_create(self):
        response = self.client.post(
            '/api/auctions/',
            self._payload(),
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(str(response.data['starting_bid']), '1000.00')
        self.assertEqual(str(response.data['current_highest_bid']), '1000.00')
        self.assertEqual(response.data['status'], Auction.Status.ACTIVE)
        self.assertEqual(response.data['product']['seller'], self.seller.pk)
        self.assertTrue(Auction.objects.filter(pk=response.data['id']).exists())

    def test_invalid_starting_bid_rejected(self):
        response = self.client.post(
            '/api/auctions/',
            self._payload(starting_bid='0.00'),
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Auction.objects.count(), 0)

        response = self.client.post(
            '/api/auctions/',
            self._payload(starting_bid='-10.00'),
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Auction.objects.count(), 0)

    def test_invalid_increment_rejected(self):
        response = self.client.post(
            '/api/auctions/',
            self._payload(min_increment='0.00'),
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Auction.objects.count(), 0)

    def test_invalid_end_time_rejected(self):
        response = self.client.post(
            '/api/auctions/',
            self._payload(
                start_time=self.now.isoformat(),
                end_time=(self.now - timedelta(hours=1)).isoformat(),
            ),
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Auction.objects.count(), 0)

        response = self.client.post(
            '/api/auctions/',
            self._payload(
                start_time=self.now.isoformat(),
                end_time=self.now.isoformat(),
            ),
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Auction.objects.count(), 0)

    def test_missing_required_fields_rejected(self):
        response = self.client.post(
            '/api/auctions/',
            {
                'product': {
                    'title': 'Incomplete',
                    'description': 'x',
                    'condition': 'USED_GOOD',
                },
                # missing starting_bid / times
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Auction.objects.count(), 0)

        response = self.client.post(
            '/api/auctions/',
            {
                'starting_bid': '100.00',
                'start_time': self.now.isoformat(),
                'end_time': (self.now + timedelta(days=1)).isoformat(),
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Auction.objects.count(), 0)


class AuthorizationSellerOnlyTests(APITestCase):
    """Owner vs non-owner for seller-only auction mutations."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username='authz_owner',
            email='authz_owner@test.com',
            password='pass12345',
        )
        self.other = User.objects.create_user(
            username='authz_other',
            email='authz_other@test.com',
            password='pass12345',
        )
        self.owner_token = Token.objects.create(user=self.owner)
        self.other_token = Token.objects.create(user=self.other)
        now = timezone.now()
        product = Product.objects.create(
            seller=self.owner,
            title='Authz Item',
            description='Desc',
        )
        self.auction = Auction.objects.create(
            product=product,
            starting_bid=100,
            current_highest_bid=100,
            min_increment=10,
            start_time=now - timedelta(minutes=5),
            end_time=now + timedelta(hours=2),
            status=Auction.Status.ACTIVE,
        )

    def test_owner_can_cancel_non_owner_cannot(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.other_token.key}')
        denied = self.client.post(
            f'/api/auctions/{self.auction.pk}/transition/',
            {'status': 'CANCELLED'},
            format='json',
        )
        self.assertEqual(denied.status_code, 403)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.ACTIVE)

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.owner_token.key}')
        allowed = self.client.post(
            f'/api/auctions/{self.auction.pk}/transition/',
            {'status': 'CANCELLED'},
            format='json',
        )
        self.assertEqual(allowed.status_code, 200)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CANCELLED)

    def test_unauthenticated_transition_and_image_upload_rejected(self):
        self.client.credentials()
        transition = self.client.post(
            f'/api/auctions/{self.auction.pk}/transition/',
            {'status': 'CANCELLED'},
            format='json',
        )
        self.assertIn(transition.status_code, (401, 403))

        upload = self.client.post(
            f'/api/auctions/{self.auction.pk}/images/',
            {},
            format='multipart',
        )
        self.assertIn(upload.status_code, (401, 403))


class BiddingBehaviorTests(APITestCase):
    """Service + API bidding rules that protect auction integrity."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='bid_beh_seller',
            email='bid_beh_seller@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='bid_beh_buyer',
            email='bid_beh_buyer@test.com',
            password='pass12345',
        )
        self.buyer2 = User.objects.create_user(
            username='bid_beh_buyer2',
            email='bid_beh_buyer2@test.com',
            password='pass12345',
        )
        self.buyer_token = Token.objects.create(user=self.buyer)

    def _auction(self, **kwargs):
        now = timezone.now()
        defaults = dict(
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            start_time=now - timedelta(minutes=5),
            end_time=now + timedelta(hours=1),
            status=Auction.Status.ACTIVE,
        )
        defaults.update(kwargs)
        product = Product.objects.create(
            seller=self.seller,
            title='Bidding Behavior Item',
            description='Desc',
        )
        return Auction.objects.create(product=product, **defaults)

    def test_valid_bid_updates_high_without_winner(self):
        auction = self._auction()
        bid = BidService.place_bid(auction.pk, self.buyer, Decimal('110.00'))
        self.assertEqual(bid.amount, Decimal('110.00'))
        auction.refresh_from_db()
        self.assertEqual(auction.current_highest_bid, Decimal('110.00'))
        self.assertIsNone(auction.winning_bidder)

    def test_low_bid_and_increment_rejected(self):
        auction = self._auction(min_increment=Decimal('25.00'))
        BidService.place_bid(auction.pk, self.buyer, Decimal('125.00'))
        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, self.buyer2, Decimal('130.00'))
        auction.refresh_from_db()
        self.assertEqual(auction.current_highest_bid, Decimal('125.00'))
        self.assertEqual(Bid.objects.filter(auction=auction).count(), 1)

    def test_self_bid_unauthenticated_closed_cancelled_expired(self):
        auction = self._auction()
        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, self.seller, Decimal('110.00'))

        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, None, Decimal('110.00'))

        closed = self._auction(status=Auction.Status.CLOSED)
        with self.assertRaises(ValidationError):
            BidService.place_bid(closed.pk, self.buyer, Decimal('110.00'))

        cancelled = self._auction(status=Auction.Status.CANCELLED)
        with self.assertRaises(ValidationError):
            BidService.place_bid(cancelled.pk, self.buyer, Decimal('110.00'))

        now = timezone.now()
        expired = self._auction(
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(seconds=1),
        )
        with self.assertRaises(ValidationError):
            BidService.place_bid(expired.pk, self.buyer, Decimal('110.00'))
        expired.refresh_from_db()
        self.assertEqual(expired.status, Auction.Status.CLOSED)

    def test_api_valid_bid_and_self_bid_forbidden(self):
        auction = self._auction()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.buyer_token.key}')
        ok = self.client.post(
            f'/api/auctions/{auction.pk}/place-bid/',
            {'amount': '110.00'},
            format='json',
        )
        self.assertEqual(ok.status_code, 201)

        seller_token = Token.objects.create(user=self.seller)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {seller_token.key}')
        forbidden = self.client.post(
            f'/api/auctions/{auction.pk}/place-bid/',
            {'amount': '130.00'},
            format='json',
        )
        self.assertEqual(forbidden.status_code, 403)


class AuctionClosingBehaviorTests(APITestCase):
    """Authoritative close/cancel outcomes including reserve and repeats."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='close_seller',
            email='close_seller@test.com',
            password='pass12345',
        )
        self.buyer_a = User.objects.create_user(
            username='close_buyer_a',
            email='close_buyera@test.com',
            password='pass12345',
        )
        self.buyer_b = User.objects.create_user(
            username='close_buyer_b',
            email='close_buyerb@test.com',
            password='pass12345',
        )

    def _auction(self, **kwargs):
        now = timezone.now()
        defaults = dict(
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            start_time=now - timedelta(minutes=5),
            end_time=now + timedelta(hours=1),
            status=Auction.Status.ACTIVE,
            reserve_price=None,
        )
        defaults.update(kwargs)
        product = Product.objects.create(
            seller=self.seller,
            title='Close Behavior Item',
            description='Desc',
        )
        return Auction.objects.create(product=product, **defaults)

    def test_close_after_expiration_via_close_if_expired(self):
        now = timezone.now()
        auction = self._auction(
            end_time=now - timedelta(seconds=1),
        )
        Bid.objects.create(auction=auction, bidder=self.buyer_a, amount=Decimal('120'))
        closed, did_close = AuctionLifecycleService.close_if_expired(auction.pk)
        self.assertTrue(did_close)
        self.assertEqual(closed.status, Auction.Status.CLOSED)
        self.assertEqual(closed.winning_bidder, self.buyer_a)

    def test_close_before_expiration_manual_still_finalizes(self):
        """Manual close (seller/admin path) may run before end_time."""
        auction = self._auction()
        Bid.objects.create(auction=auction, bidder=self.buyer_b, amount=Decimal('150'))
        self.assertGreater(auction.end_time, timezone.now())
        closed, did_close = AuctionLifecycleService.close_auction(auction.pk)
        self.assertTrue(did_close)
        self.assertEqual(closed.status, Auction.Status.CLOSED)
        self.assertEqual(closed.winning_bidder, self.buyer_b)

    def test_close_if_expired_before_end_time_is_noop(self):
        auction = self._auction()
        closed, did_close = AuctionLifecycleService.close_if_expired(auction.pk)
        self.assertFalse(did_close)
        self.assertEqual(closed.status, Auction.Status.ACTIVE)
        self.assertIsNone(closed.winning_bidder)

    def test_highest_bidder_wins_no_bids_and_reserve_paths(self):
        auction = self._auction()
        Bid.objects.create(auction=auction, bidder=self.buyer_a, amount=Decimal('110'))
        Bid.objects.create(auction=auction, bidder=self.buyer_b, amount=Decimal('140'))
        closed, _ = AuctionLifecycleService.close_auction(auction.pk)
        self.assertEqual(closed.winning_bidder, self.buyer_b)
        self.assertEqual(closed.current_highest_bid, Decimal('140.00'))

        empty = self._auction()
        closed_empty, _ = AuctionLifecycleService.close_auction(empty.pk)
        self.assertEqual(closed_empty.status, Auction.Status.CLOSED)
        self.assertIsNone(closed_empty.winning_bidder)

        reserved = self._auction(reserve_price=Decimal('200.00'))
        Bid.objects.create(
            auction=reserved,
            bidder=self.buyer_a,
            amount=Decimal('150.00'),
        )
        closed_low, _ = AuctionLifecycleService.close_auction(reserved.pk)
        self.assertIsNone(closed_low.winning_bidder)

        reserved_met = self._auction(reserve_price=Decimal('200.00'))
        Bid.objects.create(
            auction=reserved_met,
            bidder=self.buyer_a,
            amount=Decimal('200.00'),
        )
        closed_met, _ = AuctionLifecycleService.close_auction(reserved_met.pk)
        self.assertEqual(closed_met.winning_bidder, self.buyer_a)

    def test_repeated_close_and_cancelled_auction(self):
        auction = self._auction()
        Bid.objects.create(auction=auction, bidder=self.buyer_a, amount=Decimal('110'))
        first, first_closed = AuctionLifecycleService.close_auction(auction.pk)
        self.assertTrue(first_closed)
        second, second_closed = AuctionLifecycleService.close_auction(auction.pk)
        self.assertFalse(second_closed)
        self.assertEqual(second.status, Auction.Status.CLOSED)
        self.assertEqual(second.winning_bidder_id, first.winning_bidder_id)

        cancelled = self._auction()
        AuctionLifecycleService.cancel_auction(cancelled.pk)
        with self.assertRaises(ValidationError):
            AuctionLifecycleService.close_auction(cancelled.pk)
        cancelled.refresh_from_db()
        self.assertEqual(cancelled.status, Auction.Status.CANCELLED)
        self.assertIsNone(cancelled.winning_bidder)


class PaymentCheckoutBehaviorTests(APITestCase):
    """Checkout is winner-only, closed-only, and not double-chargeable."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='pay_seller',
            email='pay_seller@test.com',
            password='pass12345',
        )
        self.winner = User.objects.create_user(
            username='pay_winner',
            email='pay_winner@test.com',
            password='pass12345',
        )
        self.loser = User.objects.create_user(
            username='pay_loser',
            email='pay_loser@test.com',
            password='pass12345',
        )
        self.winner_token = Token.objects.create(user=self.winner)
        self.loser_token = Token.objects.create(user=self.loser)

    def _closed_auction_with_winner(self):
        now = timezone.now()
        product = Product.objects.create(
            seller=self.seller,
            title='Payment Item',
            description='Desc',
        )
        auction = Auction.objects.create(
            product=product,
            starting_bid=100,
            current_highest_bid=100,
            min_increment=10,
            start_time=now - timedelta(hours=2),
            end_time=now + timedelta(hours=1),
            status=Auction.Status.ACTIVE,
        )
        Bid.objects.create(auction=auction, bidder=self.loser, amount=110)
        Bid.objects.create(auction=auction, bidder=self.winner, amount=130)
        closed, _ = AuctionLifecycleService.close_auction(auction.pk)
        self.assertEqual(closed.winning_bidder, self.winner)
        return closed

    def test_winner_can_checkout(self):
        auction = self._closed_auction_with_winner()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.winner_token.key}')
        response = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], Payment.Status.COMPLETED)
        self.assertTrue(response.data.get('transaction_id'))
        auction.refresh_from_db()
        self.assertTrue(auction.is_paid)

    def test_non_winner_cannot_checkout(self):
        auction = self._closed_auction_with_winner()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.loser_token.key}')
        response = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(response.status_code, 403)
        auction.refresh_from_db()
        self.assertFalse(auction.is_paid)

    def test_open_auction_cannot_checkout(self):
        now = timezone.now()
        product = Product.objects.create(
            seller=self.seller,
            title='Open Pay Item',
            description='Desc',
        )
        auction = Auction.objects.create(
            product=product,
            starting_bid=100,
            current_highest_bid=130,
            min_increment=10,
            start_time=now - timedelta(minutes=5),
            end_time=now + timedelta(hours=1),
            status=Auction.Status.ACTIVE,
            winning_bidder=None,
        )
        Bid.objects.create(auction=auction, bidder=self.winner, amount=130)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.winner_token.key}')
        response = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('CLOSED', str(response.data))

    def test_already_paid_cannot_pay_again(self):
        auction = self._closed_auction_with_winner()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.winner_token.key}')
        first = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(first.status_code, 200)
        first_txn = first.data['transaction_id']

        second = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(second.status_code, 400)
        self.assertIn('already', str(second.data).lower())
        auction.refresh_from_db()
        self.assertTrue(auction.is_paid)
        self.assertEqual(Payment.objects.filter(auction=auction).count(), 1)
        self.assertEqual(
            Payment.objects.get(auction=auction).transaction_id,
            first_txn,
        )
