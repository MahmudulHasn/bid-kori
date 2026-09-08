"""Seller earnings + Admin platform-revenue visibility tests (MON-F01)."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from products.models import Product
from users.models import UserProfile, ensure_user_profile

from .models import Auction, Bid, Payment
from .services import AuctionLifecycleService, CheckoutService


@override_settings(PLATFORM_SUCCESS_FEE_PERCENT=Decimal('5.00'))
class SellerAdminFinancialVisibilityTests(APITestCase):
    def setUp(self):
        self.seller_a = User.objects.create_user(
            username='fin_seller_a',
            email='fin_a@test.com',
            password='pass12345',
        )
        self.seller_b = User.objects.create_user(
            username='fin_seller_b',
            email='fin_b@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='fin_buyer',
            email='fin_buyer@test.com',
            password='pass12345',
        )
        self.admin = User.objects.create_user(
            username='fin_admin',
            email='fin_admin@test.com',
            password='pass12345',
            is_staff=True,
        )
        ensure_user_profile(self.seller_a, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.seller_b, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.admin, role=UserProfile.Role.BUYER)

        self.seller_a_token = Token.objects.create(user=self.seller_a)
        self.seller_b_token = Token.objects.create(user=self.seller_b)
        self.buyer_token = Token.objects.create(user=self.buyer)
        self.admin_token = Token.objects.create(user=self.admin)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def _closed_won(self, seller, winner, amount, title='Sale Item'):
        now = timezone.now()
        product = Product.objects.create(
            seller=seller,
            title=title,
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
        Bid.objects.create(auction=auction, bidder=winner, amount=amount)
        closed, _ = AuctionLifecycleService.close_auction(auction.pk)
        self.assertEqual(closed.winning_bidder_id, winner.pk)
        return closed

    def _legacy_payment(self, auction, buyer, amount):
        Payment.objects.create(
            auction=auction,
            user=buyer,
            amount=amount,
            status=Payment.Status.COMPLETED,
            transaction_id=f'TXN-LEGACY-{auction.pk}',
            fee_rate=None,
            platform_fee=None,
            seller_net_amount=None,
        )
        auction.is_paid = True
        auction.save(update_fields=['is_paid'])

    def test_seller_earnings_new_snapshot(self):
        auction = self._closed_won(
            self.seller_a,
            self.buyer,
            Decimal('1000.00'),
        )
        CheckoutService.checkout_for_winner(auction.pk, self.buyer)
        self._auth(self.seller_a_token)
        response = self.client.get('/api/seller/earnings/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['completed_sales_count'], 1)
        self.assertEqual(response.data['gross_sales'], '1000.00')
        self.assertEqual(response.data['platform_fees'], '50.00')
        self.assertEqual(response.data['net_earnings'], '950.00')
        self.assertEqual(response.data['accounted_sales_count'], 1)
        self.assertEqual(response.data['legacy_completed_sales_count'], 0)
        self.assertEqual(response.data['legacy_gross_sales'], '0.00')
        self.assertIn('mock checkout', response.data['disclosure'].lower())

    def test_legacy_null_snapshots_not_invented(self):
        auction = self._closed_won(
            self.seller_a,
            self.buyer,
            Decimal('1000.00'),
            title='Legacy Sale',
        )
        self._legacy_payment(auction, self.buyer, Decimal('1000.00'))
        self._auth(self.seller_a_token)
        earnings = self.client.get('/api/seller/earnings/')
        self.assertEqual(earnings.status_code, 200)
        self.assertEqual(earnings.data['completed_sales_count'], 1)
        self.assertEqual(earnings.data['gross_sales'], '1000.00')
        self.assertEqual(earnings.data['platform_fees'], '0.00')
        self.assertEqual(earnings.data['net_earnings'], '0.00')
        self.assertEqual(earnings.data['accounted_sales_count'], 0)
        self.assertEqual(earnings.data['legacy_completed_sales_count'], 1)
        self.assertEqual(earnings.data['legacy_gross_sales'], '1000.00')

        sales = self.client.get('/api/seller/sales/')
        self.assertEqual(sales.status_code, 200)
        self.assertEqual(sales.data['count'], 1)
        row = sales.data['results'][0]
        self.assertIsNone(row['fee_rate'])
        self.assertIsNone(row['platform_fee'])
        self.assertIsNone(row['seller_net_amount'])
        self.assertFalse(row['has_fee_snapshot'])

        self._auth(self.admin_token)
        admin = self.client.get('/api/admin/finance/summary/')
        self.assertEqual(admin.status_code, 200)
        self.assertEqual(admin.data['gross_paid_volume'], '1000.00')
        self.assertEqual(admin.data['platform_revenue'], '0.00')
        self.assertEqual(admin.data['seller_net_total'], '0.00')
        self.assertEqual(admin.data['legacy_completed_sales_count'], 1)
        self.assertEqual(admin.data['legacy_gross_paid_volume'], '1000.00')

    def test_mixed_legacy_and_new(self):
        legacy_auction = self._closed_won(
            self.seller_a,
            self.buyer,
            Decimal('1000.00'),
            title='Legacy Mixed',
        )
        self._legacy_payment(legacy_auction, self.buyer, Decimal('1000.00'))

        new_auction = self._closed_won(
            self.seller_a,
            self.buyer,
            Decimal('2000.00'),
            title='New Mixed',
        )
        CheckoutService.checkout_for_winner(new_auction.pk, self.buyer)

        self._auth(self.seller_a_token)
        earnings = self.client.get('/api/seller/earnings/')
        self.assertEqual(earnings.data['gross_sales'], '3000.00')
        self.assertEqual(earnings.data['platform_fees'], '100.00')
        self.assertEqual(earnings.data['net_earnings'], '1900.00')
        self.assertEqual(earnings.data['legacy_completed_sales_count'], 1)
        self.assertEqual(earnings.data['legacy_gross_sales'], '1000.00')
        self.assertEqual(earnings.data['accounted_sales_count'], 1)

        self._auth(self.admin_token)
        admin = self.client.get('/api/admin/finance/summary/')
        self.assertEqual(admin.data['gross_paid_volume'], '3000.00')
        self.assertEqual(admin.data['platform_revenue'], '100.00')
        self.assertEqual(admin.data['seller_net_total'], '1900.00')

    def test_pending_failed_excluded(self):
        auction = self._closed_won(
            self.seller_a,
            self.buyer,
            Decimal('500.00'),
            title='Pending Item',
        )
        Payment.objects.create(
            auction=auction,
            user=self.buyer,
            amount=Decimal('500.00'),
            status=Payment.Status.PENDING,
            transaction_id='TXN-PENDING-1',
            fee_rate=Decimal('5.00'),
            platform_fee=Decimal('25.00'),
            seller_net_amount=Decimal('475.00'),
        )
        other = self._closed_won(
            self.seller_a,
            self.buyer,
            Decimal('400.00'),
            title='Failed Item',
        )
        Payment.objects.create(
            auction=other,
            user=self.buyer,
            amount=Decimal('400.00'),
            status=Payment.Status.FAILED,
            transaction_id='TXN-FAILED-1',
            fee_rate=Decimal('5.00'),
            platform_fee=Decimal('20.00'),
            seller_net_amount=Decimal('380.00'),
        )
        self._auth(self.seller_a_token)
        earnings = self.client.get('/api/seller/earnings/')
        self.assertEqual(earnings.data['completed_sales_count'], 0)
        self.assertEqual(earnings.data['gross_sales'], '0.00')
        self.assertEqual(earnings.data['platform_fees'], '0.00')
        sales = self.client.get('/api/seller/sales/')
        self.assertEqual(sales.data['count'], 0)

    def test_seller_isolation(self):
        auction_a = self._closed_won(
            self.seller_a,
            self.buyer,
            Decimal('1000.00'),
            title='A Sale',
        )
        CheckoutService.checkout_for_winner(auction_a.pk, self.buyer)
        auction_b = self._closed_won(
            self.seller_b,
            self.buyer,
            Decimal('2000.00'),
            title='B Sale',
        )
        CheckoutService.checkout_for_winner(auction_b.pk, self.buyer)

        self._auth(self.seller_a_token)
        earnings_a = self.client.get('/api/seller/earnings/')
        sales_a = self.client.get('/api/seller/sales/')
        self.assertEqual(earnings_a.data['gross_sales'], '1000.00')
        self.assertEqual(sales_a.data['count'], 1)
        self.assertEqual(sales_a.data['results'][0]['auction_title'], 'A Sale')

        self._auth(self.seller_b_token)
        earnings_b = self.client.get('/api/seller/earnings/')
        self.assertEqual(earnings_b.data['gross_sales'], '2000.00')
        self.assertEqual(earnings_b.data['platform_fees'], '100.00')

    def test_buyer_forbidden_seller_endpoints(self):
        self._auth(self.buyer_token)
        self.assertEqual(self.client.get('/api/seller/earnings/').status_code, 403)
        self.assertEqual(self.client.get('/api/seller/sales/').status_code, 403)

    def test_admin_summary_permissions(self):
        self.assertEqual(
            self.client.get('/api/admin/finance/summary/').status_code,
            401,
        )
        self._auth(self.buyer_token)
        self.assertEqual(
            self.client.get('/api/admin/finance/summary/').status_code,
            403,
        )
        self._auth(self.seller_a_token)
        self.assertEqual(
            self.client.get('/api/admin/finance/summary/').status_code,
            403,
        )
        self._auth(self.admin_token)
        self.assertEqual(
            self.client.get('/api/admin/finance/summary/').status_code,
            200,
        )

    def test_seller_sales_pagination_and_summary_all_rows(self):
        for i in range(21):
            auction = self._closed_won(
                self.seller_a,
                self.buyer,
                Decimal('100.00') + Decimal(i),
                title=f'Page Sale {i}',
            )
            CheckoutService.checkout_for_winner(auction.pk, self.buyer)

        self._auth(self.seller_a_token)
        page1 = self.client.get('/api/seller/sales/')
        self.assertEqual(page1.status_code, 200)
        self.assertEqual(page1.data['count'], 21)
        self.assertEqual(len(page1.data['results']), 20)
        self.assertIsNotNone(page1.data['next'])

        page2 = self.client.get('/api/seller/sales/?page=2')
        self.assertEqual(page2.status_code, 200)
        self.assertEqual(len(page2.data['results']), 1)

        earnings = self.client.get('/api/seller/earnings/')
        self.assertEqual(earnings.data['completed_sales_count'], 21)
        # Sum 100..120 = 21*110 = 2310; fee 5% = 115.50; net = 2194.50
        self.assertEqual(earnings.data['gross_sales'], '2310.00')
        self.assertEqual(earnings.data['platform_fees'], '115.50')
        self.assertEqual(earnings.data['net_earnings'], '2194.50')

    def test_aggregates_use_full_queryset(self):
        """Summary helpers must Sum/Count the full Payment queryset."""
        import inspect

        from auctions import financial as financial_mod

        source = inspect.getsource(financial_mod.summarize_completed_payments)
        self.assertNotIn('[:100]', source)
        self.assertNotIn('[0:100]', source)
        self.assertIn('Sum(', source)
        self.assertIn('Count(', source)

        for i in range(5):
            auction = self._closed_won(
                self.seller_a,
                self.buyer,
                Decimal('100.00'),
                title=f'Agg Sale {i}',
            )
            CheckoutService.checkout_for_winner(auction.pk, self.buyer)

        self._auth(self.admin_token)
        response = self.client.get('/api/admin/finance/summary/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['completed_sales_count'], 5)
        self.assertEqual(response.data['gross_paid_volume'], '500.00')
        self.assertEqual(response.data['platform_revenue'], '25.00')

    def test_seller_sale_row_includes_fee_fields(self):
        auction = self._closed_won(
            self.seller_a,
            self.buyer,
            Decimal('1000.00'),
            title='Snapshot Sale',
        )
        CheckoutService.checkout_for_winner(auction.pk, self.buyer)
        self._auth(self.seller_a_token)
        sales = self.client.get('/api/seller/sales/')
        row = sales.data['results'][0]
        self.assertEqual(row['amount'], '1000.00')
        self.assertEqual(row['fee_rate'], '5.00')
        self.assertEqual(row['platform_fee'], '50.00')
        self.assertEqual(row['seller_net_amount'], '950.00')
        self.assertTrue(row['has_fee_snapshot'])
        self.assertEqual(row['buyer_username'], 'fin_buyer')
        self.assertNotIn('email', row)
