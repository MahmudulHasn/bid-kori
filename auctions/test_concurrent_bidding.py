"""Automated tests for concurrent bidding, idempotency, and auction integrity.

Covers all 12 required scenarios:
1. One valid bid.
2. Bid below current bid.
3. Bid equal to current bid.
4. Two simultaneous equal bids.
5. Two simultaneous different bids.
6. Lower bid arriving after a higher bid.
7. Auction expiration during submission.
8. Multiple concurrent bids.
9. Duplicate request submission (idempotency).
10. Bid count consistency.
11. Current bid consistency.
12. Highest bidder consistency.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import timedelta
from decimal import Decimal
import threading

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import connection
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from products.models import Category, Product
from .models import Auction, Bid
from .services import BidPlacementError, BidService


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ConcurrentBiddingTestSuite(TransactionTestCase):
    """Full test suite covering all 12 concurrent bidding scenarios and API responses."""

    def setUp(self):
        super().setUp()
        self.seller = User.objects.create_user(
            username='seller_user',
            email='seller@test.com',
            password='password123',
        )
        self.buyer_a = User.objects.create_user(
            username='buyer_a',
            email='buyera@test.com',
            password='password123',
        )
        self.buyer_b = User.objects.create_user(
            username='buyer_b',
            email='buyerb@test.com',
            password='password123',
        )
        self.buyer_c = User.objects.create_user(
            username='buyer_c',
            email='buyerc@test.com',
            password='password123',
        )
        self.category = Category.objects.create(name='Electronics', slug='electronics')
        self.product = Product.objects.create(
            seller=self.seller,
            category=self.category,
            title='iPhone 15 Pro',
            description='Brand new 256GB',
            condition=Product.Condition.NEW,
        )
        now = timezone.now()
        self.auction = Auction.objects.create(
            product=self.product,
            starting_bid=Decimal('50000.00'),
            current_highest_bid=Decimal('50000.00'),
            min_increment=Decimal('500.00'),
            start_time=now - timedelta(minutes=10),
            end_time=now + timedelta(hours=2),
            status=Auction.Status.ACTIVE,
        )

        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.buyer_a)

        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.buyer_b)

    # 1. One valid bid
    def test_01_one_valid_bid(self):
        """A valid bid strictly exceeding starting bid + min_increment is accepted."""
        response = self.client_a.post(
            f'/api/auctions/{self.auction.pk}/place-bid/',
            {'amount': '50500.00'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['status'], 'ACCEPTED')
        self.assertEqual(Decimal(str(data['accepted_amount'])), Decimal('50500.00'))
        self.assertEqual(Decimal(str(data['current_bid'])), Decimal('50500.00'))
        self.assertTrue(data['is_highest_bidder'])

        self.auction.refresh_from_db()
        self.assertEqual(self.auction.current_highest_bid, Decimal('50500.00'))
        self.assertEqual(self.auction.bids.count(), 1)
        latest_bid = self.auction.bids.order_by('-amount', 'timestamp').first()
        self.assertIsNotNone(latest_bid)
        self.assertEqual(latest_bid.bidder, self.buyer_a)

    # 2. Bid below current bid
    def test_02_bid_below_current_bid(self):
        """A bid lower than the current bid must be rejected with BID_AMOUNT_NO_LONGER_VALID."""
        # Current is 50,000; submitting 49,000
        response = self.client_a.post(
            f'/api/auctions/{self.auction.pk}/place-bid/',
            {'amount': '49000.00'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        data = response.json()
        self.assertFalse(data['success'])
        self.assertEqual(data['status'], 'REJECTED')
        self.assertEqual(data['error_code'], 'BID_AMOUNT_NO_LONGER_VALID')
        self.assertIn('equal or higher bid', data['message'])
        self.assertEqual(Decimal(str(data['current_bid'])), Decimal('50000.00'))

    # 3. Bid equal to current bid
    def test_03_bid_equal_to_current_bid(self):
        """A bid equal to current bid must be rejected because it does not exceed required minimum."""
        response = self.client_a.post(
            f'/api/auctions/{self.auction.pk}/place-bid/',
            {'amount': '50000.00'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        data = response.json()
        self.assertFalse(data['success'])
        self.assertEqual(data['status'], 'REJECTED')
        self.assertEqual(data['error_code'], 'BID_AMOUNT_NO_LONGER_VALID')
        self.assertEqual(
            data['message'],
            'Another buyer has already placed an equal or higher bid. Please submit a higher amount.',
        )

    # 4. Two simultaneous equal bids
    def test_04_two_simultaneous_equal_bids(self):
        """Two buyers submitting the exact same amount concurrently: at most one accepted."""
        barrier = threading.Barrier(2)

        def submit_bid(client):
            connection.close()
            try:
                barrier.wait(timeout=5)
            except Exception:
                pass
            return client.post(
                f'/api/auctions/{self.auction.pk}/place-bid/',
                {'amount': '50500.00'},
                format='json',
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            future_a = executor.submit(submit_bid, self.client_a)
            future_b = executor.submit(submit_bid, self.client_b)
            resp_a = future_a.result()
            resp_b = future_b.result()

        responses = [resp_a, resp_b]
        accepted = [r for r in responses if r.status_code == status.HTTP_201_CREATED]
        rejected = [r for r in responses if r.status_code == status.HTTP_400_BAD_REQUEST]

        self.assertEqual(len(accepted), 1, "Exactly one bid must be accepted")
        self.assertEqual(len(rejected), 1, "Exactly one bid must be rejected")

        acc_data = accepted[0].json()
        self.assertTrue(acc_data['success'])
        self.assertEqual(acc_data['status'], 'ACCEPTED')
        self.assertEqual(Decimal(str(acc_data['accepted_amount'])), Decimal('50500.00'))

        rej_data = rejected[0].json()
        self.assertFalse(rej_data['success'])
        self.assertEqual(rej_data['status'], 'REJECTED')
        self.assertEqual(rej_data['error_code'], 'BID_AMOUNT_NO_LONGER_VALID')
        self.assertEqual(
            rej_data['message'],
            'Another buyer has already placed an equal or higher bid. Please submit a higher amount.',
        )
        self.assertEqual(Decimal(str(rej_data['current_bid'])), Decimal('50500.00'))

        self.auction.refresh_from_db()
        self.assertEqual(self.auction.current_highest_bid, Decimal('50500.00'))
        self.assertEqual(self.auction.bids.count(), 1)

    # 5. Two simultaneous different bids
    def test_05_two_simultaneous_different_bids(self):
        """Buyer A submits 50,500 and Buyer B submits 51,000 concurrently. Both or latest high accepted."""
        barrier = threading.Barrier(2)

        def submit(client, amount):
            connection.close()
            try:
                barrier.wait(timeout=5)
            except Exception:
                pass
            return client.post(
                f'/api/auctions/{self.auction.pk}/place-bid/',
                {'amount': amount},
                format='json',
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            future_a = executor.submit(submit, self.client_a, '50500.00')
            future_b = executor.submit(submit, self.client_b, '51000.00')
            resp_a = future_a.result()
            resp_b = future_b.result()

        self.auction.refresh_from_db()
        # Regardless of execution order:
        # If 50,500 ran first: 50,500 accepted, then 51,000 accepted. (2 bids total, high = 51,000)
        # If 51,000 ran first: 51,000 accepted, then 50,500 rejected. (1 bid total, high = 51,000)
        self.assertEqual(self.auction.current_highest_bid, Decimal('51000.00'))
        latest_bid = self.auction.bids.order_by('-amount', 'timestamp').first()
        self.assertEqual(latest_bid.bidder, self.buyer_b)
        self.assertEqual(latest_bid.amount, Decimal('51000.00'))

    # 6. Lower bid arriving after a higher bid
    def test_06_lower_bid_arriving_after_higher_bid(self):
        """A bid arriving with an amount lower than an already accepted bid must be rejected."""
        resp_high = self.client_b.post(
            f'/api/auctions/{self.auction.pk}/place-bid/',
            {'amount': '52000.00'},
            format='json',
        )
        self.assertEqual(resp_high.status_code, status.HTTP_201_CREATED)

        resp_lower = self.client_a.post(
            f'/api/auctions/{self.auction.pk}/place-bid/',
            {'amount': '51000.00'},
            format='json',
        )
        self.assertEqual(resp_lower.status_code, status.HTTP_400_BAD_REQUEST)
        data = resp_lower.json()
        self.assertEqual(data['error_code'], 'BID_AMOUNT_NO_LONGER_VALID')
        self.assertEqual(Decimal(str(data['current_bid'])), Decimal('52000.00'))

        self.auction.refresh_from_db()
        self.assertEqual(self.auction.current_highest_bid, Decimal('52000.00'))

    # 7. Auction expiration during submission
    def test_07_auction_expiration_during_submission(self):
        """An auction that expired before lock acquisition must be rejected as AUCTION_EXPIRED."""
        self.auction.end_time = timezone.now() - timedelta(seconds=5)
        self.auction.save(update_fields=['end_time'])

        response = self.client_a.post(
            f'/api/auctions/{self.auction.pk}/place-bid/',
            {'amount': '51000.00'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        data = response.json()
        self.assertFalse(data['success'])
        self.assertEqual(data['status'], 'REJECTED')
        self.assertEqual(data['error_code'], 'AUCTION_EXPIRED')

    # 8. Multiple concurrent bids
    def test_08_multiple_concurrent_bids(self):
        """Multiple concurrent bids from different buyers under heavy contention."""
        buyers = [
            User.objects.create_user(
                username=f'conc_mult_{i}',
                password='password123',
            )
            for i in range(8)
        ]
        amounts = [
            Decimal('50500.00'),
            Decimal('51000.00'),
            Decimal('50500.00'),  # duplicate amount
            Decimal('51500.00'),
            Decimal('52000.00'),
            Decimal('51000.00'),  # duplicate amount
            Decimal('52500.00'),
            Decimal('53000.00'),
        ]

        def attempt(buyer, amount):
            connection.close()
            try:
                bid = BidService.place_bid(self.auction.pk, buyer, amount)
                return ('ok', amount, bid.pk)
            except BidPlacementError as e:
                return ('rejected', amount, e.error_code)
            except Exception as exc:  # noqa: BLE001
                return ('error', amount, str(exc))

        results = []
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = [
                executor.submit(attempt, buyers[i], amounts[i])
                for i in range(len(buyers))
            ]
            for f in as_completed(futures):
                results.append(f.result())

        errors = [r for r in results if r[0] == 'error']
        self.assertEqual(errors, [], f"Unexpected runtime errors: {errors}")

        self.auction.refresh_from_db()
        accepted_db_bids = list(
            self.auction.bids.order_by('amount').values_list('amount', flat=True)
        )
        # Ensure no duplicates in accepted amounts
        self.assertEqual(len(accepted_db_bids), len(set(accepted_db_bids)))
        self.assertEqual(self.auction.current_highest_bid, max(accepted_db_bids))

    # 9. Duplicate request submission (idempotency)
    def test_09_duplicate_request_submission(self):
        """Rapid double-click / network retry with identical amount from same user is idempotent."""
        resp1 = self.client_a.post(
            f'/api/auctions/{self.auction.pk}/place-bid/',
            {'amount': '51000.00'},
            format='json',
        )
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)
        data1 = resp1.json()

        # Immediate retry with same amount by Buyer A
        resp2 = self.client_a.post(
            f'/api/auctions/{self.auction.pk}/place-bid/',
            {'amount': '51000.00'},
            format='json',
        )
        self.assertIn(resp2.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        data2 = resp2.json()
        self.assertTrue(data2['success'])
        self.assertEqual(data2['status'], 'ACCEPTED')
        self.assertEqual(data2['bid_id'], data1['bid_id'])

        # Only one bid row created in DB
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.bids.count(), 1)
        self.assertEqual(self.auction.current_highest_bid, Decimal('51000.00'))

    # 10. Bid count consistency
    def test_10_bid_count_consistency(self):
        """Accepted bid count matches the count of Bid objects in the database exactly."""
        BidService.place_bid(self.auction.pk, self.buyer_a, Decimal('50500.00'))
        BidService.place_bid(self.auction.pk, self.buyer_b, Decimal('51000.00'))
        BidService.place_bid(self.auction.pk, self.buyer_a, Decimal('51500.00'))

        # Failed attempt
        with self.assertRaises(BidPlacementError):
            BidService.place_bid(self.auction.pk, self.buyer_b, Decimal('51000.00'))

        self.auction.refresh_from_db()
        self.assertEqual(self.auction.bids.count(), 3)
        self.assertEqual(Bid.objects.filter(auction=self.auction).count(), 3)

    # 11. Current bid consistency
    def test_11_current_bid_consistency(self):
        """Auction.current_highest_bid strictly equals max(bids.amount)."""
        bids = [
            (self.buyer_a, Decimal('50500.00')),
            (self.buyer_b, Decimal('51000.00')),
            (self.buyer_c, Decimal('52500.00')),
        ]
        for buyer, amt in bids:
            BidService.place_bid(self.auction.pk, buyer, amt)

        self.auction.refresh_from_db()
        max_amount = max(b.amount for b in self.auction.bids.all())
        self.assertEqual(self.auction.current_highest_bid, max_amount)
        self.assertEqual(self.auction.current_highest_bid, Decimal('52500.00'))

    # 12. Highest bidder consistency
    def test_12_highest_bidder_consistency(self):
        """Current highest bidder strictly reflects the buyer who submitted the highest accepted bid."""
        BidService.place_bid(self.auction.pk, self.buyer_a, Decimal('50500.00'))
        self.assertEqual(
            self.auction.bids.order_by('-amount', 'timestamp').first().bidder,
            self.buyer_a,
        )

        BidService.place_bid(self.auction.pk, self.buyer_b, Decimal('51000.00'))
        self.assertEqual(
            self.auction.bids.order_by('-amount', 'timestamp').first().bidder,
            self.buyer_b,
        )

        # Rejected attempt does NOT change highest bidder
        with self.assertRaises(BidPlacementError):
            BidService.place_bid(self.auction.pk, self.buyer_c, Decimal('50800.00'))

        self.assertEqual(
            self.auction.bids.order_by('-amount', 'timestamp').first().bidder,
            self.buyer_b,
        )
