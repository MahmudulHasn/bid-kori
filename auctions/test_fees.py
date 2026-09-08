"""Successful-sale fee calculation and mock checkout fee snapshot tests."""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.exceptions import ImproperlyConfigured, ValidationError
from django.db import IntegrityError, connection
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from products.models import Product

from .fees import (
    FeeCalculationError,
    calculate_sale_fee_snapshot,
    get_platform_success_fee_percent,
    parse_platform_success_fee_percent,
)
from .models import Auction, Bid, Payment
from .services import (
    AuctionLifecycleService,
    CheckoutAlreadyCompleted,
    CheckoutService,
)


class FeeCalculationUnitTests(TestCase):
    def test_1000_at_5_percent(self):
        snap = calculate_sale_fee_snapshot(Decimal('1000.00'), Decimal('5.00'))
        self.assertEqual(snap.fee_rate, Decimal('5.00'))
        self.assertEqual(snap.platform_fee, Decimal('50.00'))
        self.assertEqual(snap.seller_net_amount, Decimal('950.00'))
        self.assertEqual(
            snap.platform_fee + snap.seller_net_amount,
            Decimal('1000.00'),
        )

    def test_rounding_half_up(self):
        # 33.33 * 5% = 1.6665 → 1.67 half-up; net = 31.66
        snap = calculate_sale_fee_snapshot(Decimal('33.33'), Decimal('5.00'))
        self.assertEqual(snap.platform_fee, Decimal('1.67'))
        self.assertEqual(snap.seller_net_amount, Decimal('31.66'))
        self.assertEqual(
            snap.platform_fee + snap.seller_net_amount,
            Decimal('33.33'),
        )

    def test_zero_percent(self):
        snap = calculate_sale_fee_snapshot(Decimal('1000.00'), Decimal('0.00'))
        self.assertEqual(snap.platform_fee, Decimal('0.00'))
        self.assertEqual(snap.seller_net_amount, Decimal('1000.00'))

    def test_hundred_percent(self):
        snap = calculate_sale_fee_snapshot(Decimal('1000.00'), Decimal('100.00'))
        self.assertEqual(snap.platform_fee, Decimal('1000.00'))
        self.assertEqual(snap.seller_net_amount, Decimal('0.00'))

    def test_over_100_rejects(self):
        with self.assertRaises(FeeCalculationError):
            calculate_sale_fee_snapshot(Decimal('100.00'), Decimal('100.01'))

    def test_negative_rate_rejects(self):
        with self.assertRaises(FeeCalculationError):
            calculate_sale_fee_snapshot(Decimal('100.00'), Decimal('-1.00'))

    def test_negative_gross_rejects(self):
        with self.assertRaises(FeeCalculationError):
            calculate_sale_fee_snapshot(Decimal('-1.00'), Decimal('5.00'))

    def test_zero_gross_rejects(self):
        with self.assertRaises(FeeCalculationError):
            calculate_sale_fee_snapshot(Decimal('0.00'), Decimal('5.00'))

    def test_invariant_exact_for_varied_amounts(self):
        for gross, rate in (
            (Decimal('1.00'), Decimal('5.00')),
            (Decimal('99.99'), Decimal('7.50')),
            (Decimal('250.25'), Decimal('3.00')),
            (Decimal('10.00'), Decimal('0.01')),
        ):
            snap = calculate_sale_fee_snapshot(gross, rate)
            self.assertEqual(snap.platform_fee + snap.seller_net_amount, gross)

    def test_parse_invalid_setting(self):
        with self.assertRaises(ImproperlyConfigured):
            parse_platform_success_fee_percent('not-a-number')
        with self.assertRaises(ImproperlyConfigured):
            parse_platform_success_fee_percent('150')
        with self.assertRaises(ImproperlyConfigured):
            parse_platform_success_fee_percent('-0.01')


@override_settings(PLATFORM_SUCCESS_FEE_PERCENT=Decimal('5.00'))
class PaymentFeeCheckoutTests(APITestCase):
    def setUp(self):
        self.seller = User.objects.create_user(
            username='fee_seller',
            email='fee_seller@test.com',
            password='pass12345',
        )
        self.winner = User.objects.create_user(
            username='fee_winner',
            email='fee_winner@test.com',
            password='pass12345',
        )
        self.loser = User.objects.create_user(
            username='fee_loser',
            email='fee_loser@test.com',
            password='pass12345',
        )
        self.winner_token = Token.objects.create(user=self.winner)
        self.loser_token = Token.objects.create(user=self.loser)

    def _closed_auction(self, high=Decimal('1000.00')):
        now = timezone.now()
        product = Product.objects.create(
            seller=self.seller,
            title='Fee Item',
            description='Desc',
        )
        auction = Auction.objects.create(
            product=product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            start_time=now - timedelta(hours=2),
            end_time=now + timedelta(hours=1),
            status=Auction.Status.ACTIVE,
        )
        Bid.objects.create(
            auction=auction,
            bidder=self.loser,
            amount=high - Decimal('50.00'),
        )
        Bid.objects.create(auction=auction, bidder=self.winner, amount=high)
        closed, _ = AuctionLifecycleService.close_auction(auction.pk)
        self.assertEqual(closed.winning_bidder, self.winner)
        self.assertEqual(closed.current_highest_bid, high)
        return closed

    def test_checkout_writes_fee_snapshots(self):
        auction = self._closed_auction(Decimal('1000.00'))
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.winner_token.key}'
        )
        response = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(str(response.data['amount'])), Decimal('1000.00'))
        self.assertEqual(response.data['status'], Payment.Status.COMPLETED)
        # Buyer-facing serializer omits seller fee fields.
        self.assertNotIn('platform_fee', response.data)
        self.assertNotIn('seller_net_amount', response.data)
        self.assertNotIn('fee_rate', response.data)

        payment = Payment.objects.get(auction=auction)
        self.assertEqual(payment.fee_rate, Decimal('5.00'))
        self.assertEqual(payment.platform_fee, Decimal('50.00'))
        self.assertEqual(payment.seller_net_amount, Decimal('950.00'))
        auction.refresh_from_db()
        self.assertTrue(auction.is_paid)

    def test_client_tampering_ignored(self):
        auction = self._closed_auction(Decimal('1000.00'))
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.winner_token.key}'
        )
        response = self.client.post(
            f'/api/auctions/{auction.pk}/checkout/',
            {
                'amount': '1.00',
                'fee_rate': '0',
                'platform_fee': '0',
                'seller_net_amount': '999999',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        payment = Payment.objects.get(auction=auction)
        self.assertEqual(payment.amount, Decimal('1000.00'))
        self.assertEqual(payment.fee_rate, Decimal('5.00'))
        self.assertEqual(payment.platform_fee, Decimal('50.00'))
        self.assertEqual(payment.seller_net_amount, Decimal('950.00'))

    def test_non_winner_no_payment(self):
        auction = self._closed_auction()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.loser_token.key}'
        )
        response = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Payment.objects.filter(auction=auction).exists())
        auction.refresh_from_db()
        self.assertFalse(auction.is_paid)

    def test_reserve_unmet_no_payment(self):
        now = timezone.now()
        product = Product.objects.create(
            seller=self.seller,
            title='Reserve Fee Item',
            description='Desc',
        )
        auction = Auction.objects.create(
            product=product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            reserve_price=Decimal('500.00'),
            start_time=now - timedelta(hours=2),
            end_time=now + timedelta(hours=1),
            status=Auction.Status.ACTIVE,
        )
        Bid.objects.create(
            auction=auction,
            bidder=self.winner,
            amount=Decimal('200.00'),
        )
        closed, _ = AuctionLifecycleService.close_auction(auction.pk)
        self.assertIsNone(closed.winning_bidder)
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.winner_token.key}'
        )
        response = self.client.post(f'/api/auctions/{closed.pk}/checkout/')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Payment.objects.filter(auction=closed).exists())

    def test_cancelled_no_checkout(self):
        now = timezone.now()
        product = Product.objects.create(
            seller=self.seller,
            title='Cancelled Fee Item',
            description='Desc',
        )
        auction = Auction.objects.create(
            product=product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            start_time=now - timedelta(hours=2),
            end_time=now + timedelta(hours=1),
            status=Auction.Status.ACTIVE,
        )
        Bid.objects.create(
            auction=auction,
            bidder=self.winner,
            amount=Decimal('130.00'),
        )
        cancelled, _ = AuctionLifecycleService.cancel_auction(auction.pk)
        self.assertEqual(cancelled.status, Auction.Status.CANCELLED)
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.winner_token.key}'
        )
        response = self.client.post(f'/api/auctions/{cancelled.pk}/checkout/')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Payment.objects.filter(auction=cancelled).exists())

    def test_duplicate_sequential_preserves_snapshots(self):
        auction = self._closed_auction(Decimal('1000.00'))
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.winner_token.key}'
        )
        first = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(first.status_code, 200)
        payment = Payment.objects.get(auction=auction)
        first_txn = payment.transaction_id
        first_fee = payment.platform_fee

        with override_settings(PLATFORM_SUCCESS_FEE_PERCENT=Decimal('3.00')):
            second = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(second.status_code, 400)
        self.assertEqual(Payment.objects.filter(auction=auction).count(), 1)
        payment.refresh_from_db()
        self.assertEqual(payment.transaction_id, first_txn)
        self.assertEqual(payment.platform_fee, first_fee)
        self.assertEqual(payment.fee_rate, Decimal('5.00'))

    def test_historical_rate_immutability_across_checkouts(self):
        auction_a = self._closed_auction(Decimal('1000.00'))
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.winner_token.key}'
        )
        first = self.client.post(f'/api/auctions/{auction_a.pk}/checkout/')
        self.assertEqual(first.status_code, 200)
        pay_a = Payment.objects.get(auction=auction_a)
        self.assertEqual(pay_a.fee_rate, Decimal('5.00'))
        self.assertEqual(pay_a.platform_fee, Decimal('50.00'))

        with override_settings(PLATFORM_SUCCESS_FEE_PERCENT=Decimal('3.00')):
            self.assertEqual(
                get_platform_success_fee_percent(),
                Decimal('3.00'),
            )
            auction_b = self._closed_auction(Decimal('1000.00'))
            second = self.client.post(f'/api/auctions/{auction_b.pk}/checkout/')
            self.assertEqual(second.status_code, 200)
            pay_b = Payment.objects.get(auction=auction_b)
            self.assertEqual(pay_b.fee_rate, Decimal('3.00'))
            self.assertEqual(pay_b.platform_fee, Decimal('30.00'))
            self.assertEqual(pay_b.seller_net_amount, Decimal('970.00'))

        pay_a.refresh_from_db()
        self.assertEqual(pay_a.fee_rate, Decimal('5.00'))
        self.assertEqual(pay_a.platform_fee, Decimal('50.00'))
        self.assertEqual(pay_a.seller_net_amount, Decimal('950.00'))

    def test_legacy_null_fee_not_backfilled_on_retry(self):
        auction = self._closed_auction(Decimal('1000.00'))
        Payment.objects.create(
            auction=auction,
            user=self.winner,
            amount=Decimal('1000.00'),
            status=Payment.Status.COMPLETED,
            transaction_id='TXN-LEGACYNULL0001',
            fee_rate=None,
            platform_fee=None,
            seller_net_amount=None,
        )
        auction.is_paid = True
        auction.save(update_fields=['is_paid'])

        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.winner_token.key}'
        )
        response = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(response.status_code, 400)
        payment = Payment.objects.get(auction=auction)
        self.assertIsNone(payment.fee_rate)
        self.assertIsNone(payment.platform_fee)
        self.assertIsNone(payment.seller_net_amount)

    def test_is_paid_without_payment_rejects(self):
        auction = self._closed_auction()
        auction.is_paid = True
        auction.save(update_fields=['is_paid'])
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.winner_token.key}'
        )
        response = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Payment.objects.filter(auction=auction).exists())

    def test_completed_payment_is_paid_false_rejects_without_repair(self):
        auction = self._closed_auction(Decimal('1000.00'))
        Payment.objects.create(
            auction=auction,
            user=self.winner,
            amount=Decimal('1000.00'),
            status=Payment.Status.COMPLETED,
            transaction_id='TXN-ORPHANPAID00001',
            fee_rate=Decimal('5.00'),
            platform_fee=Decimal('50.00'),
            seller_net_amount=Decimal('950.00'),
        )
        self.assertFalse(auction.is_paid)
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.winner_token.key}'
        )
        response = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(response.status_code, 400)
        auction.refresh_from_db()
        self.assertFalse(auction.is_paid)
        self.assertEqual(Payment.objects.filter(auction=auction).count(), 1)

    def test_stored_fee_columns_not_settings_derived(self):
        auction = self._closed_auction(Decimal('1000.00'))
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.winner_token.key}'
        )
        self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        payment = Payment.objects.get(auction=auction)
        payment.platform_fee = Decimal('12.34')
        payment.seller_net_amount = Decimal('987.66')
        payment.fee_rate = Decimal('1.23')
        payment.save(
            update_fields=['platform_fee', 'seller_net_amount', 'fee_rate']
        )

        with override_settings(PLATFORM_SUCCESS_FEE_PERCENT=Decimal('99.00')):
            payment.refresh_from_db()
            self.assertEqual(payment.platform_fee, Decimal('12.34'))
            self.assertEqual(payment.fee_rate, Decimal('1.23'))

    def test_checkout_rollback_on_fee_failure(self):
        auction = self._closed_auction(Decimal('1000.00'))
        with patch(
            'auctions.services.calculate_sale_fee_snapshot',
            side_effect=FeeCalculationError('boom'),
        ):
            with self.assertRaises(ValidationError):
                CheckoutService.checkout_for_winner(auction.pk, self.winner)
        auction.refresh_from_db()
        self.assertFalse(auction.is_paid)
        self.assertFalse(Payment.objects.filter(auction=auction).exists())

    def test_integrity_error_after_race_maps_to_already_completed(self):
        auction = self._closed_auction(Decimal('1000.00'))
        Payment.objects.create(
            auction=auction,
            user=self.winner,
            amount=Decimal('1000.00'),
            status=Payment.Status.COMPLETED,
            transaction_id='TXN-RACEEXISTING0001',
            fee_rate=Decimal('5.00'),
            platform_fee=Decimal('50.00'),
            seller_net_amount=Decimal('950.00'),
        )
        # Simulate lock miss: skip completed check by forcing create path.
        with patch.object(
            CheckoutService,
            '_existing_payment',
            return_value=None,
        ):
            with patch.object(
                Payment.objects,
                'create',
                side_effect=IntegrityError('auction_id unique'),
            ):
                with self.assertRaises(CheckoutAlreadyCompleted) as ctx:
                    CheckoutService.checkout_for_winner(auction.pk, self.winner)
        self.assertEqual(ctx.exception.payment.pk, auction.payment.pk)
        self.assertEqual(Payment.objects.filter(auction=auction).count(), 1)


@override_settings(PLATFORM_SUCCESS_FEE_PERCENT=Decimal('5.00'))
class CheckoutConcurrencyTests(TransactionTestCase):
    """Concurrent checkout serialization (PostgreSQL select_for_update)."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='conc_fee_seller',
            email='conc_fee_seller@test.com',
            password='pass12345',
        )
        self.winner = User.objects.create_user(
            username='conc_fee_winner',
            email='conc_fee_winner@test.com',
            password='pass12345',
        )
        self.winner_token = Token.objects.create(user=self.winner)

    def _closed_auction(self):
        now = timezone.now()
        product = Product.objects.create(
            seller=self.seller,
            title='Conc Fee Item',
            description='Desc',
        )
        auction = Auction.objects.create(
            product=product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            start_time=now - timedelta(hours=2),
            end_time=now + timedelta(hours=1),
            status=Auction.Status.ACTIVE,
        )
        Bid.objects.create(
            auction=auction,
            bidder=self.winner,
            amount=Decimal('1000.00'),
        )
        closed, _ = AuctionLifecycleService.close_auction(auction.pk)
        return closed

    def test_concurrent_checkout_one_payment(self):
        if not connection.features.has_select_for_update:
            self.skipTest(
                'Concurrent checkout locking requires select_for_update '
                '(PostgreSQL). SQLite covers sequential duplicate path.'
            )

        auction = self._closed_auction()
        results = []

        def _attempt():
            client = APIClient()
            client.credentials(
                HTTP_AUTHORIZATION=f'Token {self.winner_token.key}'
            )
            return client.post(f'/api/auctions/{auction.pk}/checkout/')

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(_attempt) for _ in range(2)]
            for fut in as_completed(futures):
                results.append(fut.result())

        statuses = sorted(r.status_code for r in results)
        self.assertEqual(statuses, [200, 400])
        self.assertEqual(Payment.objects.filter(auction=auction).count(), 1)
        payment = Payment.objects.get(auction=auction)
        self.assertEqual(payment.status, Payment.Status.COMPLETED)
        self.assertIsNotNone(payment.fee_rate)
        self.assertIsNotNone(payment.platform_fee)
        self.assertIsNotNone(payment.seller_net_amount)
        self.assertEqual(
            payment.amount,
            payment.platform_fee + payment.seller_net_amount,
        )
        auction.refresh_from_db()
        self.assertTrue(auction.is_paid)
        for response in results:
            self.assertNotEqual(response.status_code, 500)
