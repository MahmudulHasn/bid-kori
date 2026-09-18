"""Tests for Admin Dashboard Summary API (ADMIN-X01)."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from auctions.models import Auction, Bid, Payment
from products.models import Category, Product
from users.models import UserProfile, ensure_user_profile


class AdminDashboardSummaryApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='dash_admin',
            email='dash_admin@test.com',
            password='Password123!',
            is_staff=True,
        )
        self.seller = User.objects.create_user(
            username='dash_seller',
            email='dash_seller@test.com',
            password='Password123!',
        )
        self.buyer = User.objects.create_user(
            username='dash_buyer',
            email='dash_buyer@test.com',
            password='Password123!',
        )
        self.suspended_user = User.objects.create_user(
            username='dash_suspended',
            email='dash_suspended@test.com',
            password='Password123!',
            is_active=False,
        )

        ensure_user_profile(self.admin, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.suspended_user, role=UserProfile.Role.BUYER)

        self.category = Category.objects.create(name='Test Category', slug='test-category')
        self.product1 = Product.objects.create(
            seller=self.seller,
            category=self.category,
            title='Test Product 1',
            description='Test Description 1',
            condition='NEW',
        )
        self.product2 = Product.objects.create(
            seller=self.seller,
            category=self.category,
            title='Test Product 2',
            description='Test Description 2',
            condition='NEW',
        )
        self.product3 = Product.objects.create(
            seller=self.seller,
            category=self.category,
            title='Test Product 3',
            description='Test Description 3',
            condition='NEW',
        )
        self.product4 = Product.objects.create(
            seller=self.seller,
            category=self.category,
            title='Test Product 4',
            description='Test Description 4',
            condition='NEW',
        )

        now = timezone.now()
        # Create one live auction
        self.live_auction = Auction.objects.create(
            product=self.product1,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('150.00'),
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            status=Auction.Status.ACTIVE,
        )
        # Create one upcoming auction
        self.upcoming_auction = Auction.objects.create(
            product=self.product2,
            starting_bid=Decimal('200.00'),
            start_time=now + timedelta(hours=1),
            end_time=now + timedelta(hours=3),
            status=Auction.Status.ACTIVE,
        )
        # Create one closed auction
        self.closed_auction = Auction.objects.create(
            product=self.product3,
            starting_bid=Decimal('50.00'),
            current_highest_bid=Decimal('300.00'),
            start_time=now - timedelta(hours=5),
            end_time=now - timedelta(hours=1),
            status=Auction.Status.CLOSED,
            winning_bidder=self.buyer,
        )
        # Create one cancelled auction
        self.cancelled_auction = Auction.objects.create(
            product=self.product4,
            starting_bid=Decimal('50.00'),
            start_time=now - timedelta(hours=5),
            end_time=now + timedelta(hours=1),
            status=Auction.Status.CANCELLED,
        )

        # Place a bid
        self.bid = Bid.objects.create(
            auction=self.live_auction,
            bidder=self.buyer,
            amount=Decimal('150.00'),
        )

        # Create a completed payment
        self.payment = Payment.objects.create(
            auction=self.closed_auction,
            user=self.buyer,
            amount=Decimal('300.00'),
            platform_fee=Decimal('15.00'),
            seller_net_amount=Decimal('285.00'),
            fee_rate=Decimal('5.00'),
            status=Payment.Status.COMPLETED,
            transaction_id='TX_TEST_123',
        )

        self.url = '/api/admin/dashboard/summary/'

    def test_anonymous_access_denied(self):
        res = self.client.get(self.url)
        self.assertIn(res.status_code, [401, 403])

    def test_buyer_access_denied(self):
        self.client.force_authenticate(user=self.buyer)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 403)

    def test_seller_access_denied(self):
        self.client.force_authenticate(user=self.seller)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 403)

    def test_admin_access_allowed_and_data_structure(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)

        data = res.json()

        # User stats
        self.assertIn('users', data)
        self.assertEqual(data['users']['total'], 4)
        self.assertEqual(data['users']['admins'], 1)
        self.assertEqual(data['users']['sellers'], 1)
        self.assertEqual(data['users']['buyers'], 2)  # buyer + suspended_user
        self.assertEqual(data['users']['active'], 3)
        self.assertEqual(data['users']['suspended'], 1)

        # Auction stats
        self.assertIn('auctions', data)
        self.assertEqual(data['auctions']['total'], 4)
        self.assertEqual(data['auctions']['live'], 1)
        self.assertEqual(data['auctions']['upcoming'], 1)
        self.assertEqual(data['auctions']['closed'], 1)
        self.assertEqual(data['auctions']['cancelled'], 1)

        # Product & bid stats
        self.assertEqual(data['products']['total'], 4)
        self.assertEqual(data['bids']['total'], 1)

        # Financial stats
        self.assertIn('finance', data)
        self.assertEqual(data['finance']['completed_sales_count'], 1)
        self.assertEqual(data['finance']['gross_paid_volume'], '300.00')
        self.assertEqual(data['finance']['platform_revenue'], '15.00')
        self.assertEqual(data['finance']['seller_net_total'], '285.00')

        # Moderation stats
        self.assertIn('moderation', data)
        self.assertEqual(data['moderation']['cancelled_auctions_count'], 1)
        self.assertEqual(data['moderation']['suspended_users_count'], 1)
        self.assertGreaterEqual(data['moderation']['total_attention_required'], 2)

        # Recent activity capped at 5
        self.assertIn('recent_activity', data)
        self.assertLessEqual(len(data['recent_activity']['users']), 5)
        self.assertLessEqual(len(data['recent_activity']['products']), 5)
        self.assertLessEqual(len(data['recent_activity']['auctions']), 5)
        self.assertLessEqual(len(data['recent_activity']['bids']), 5)
        self.assertLessEqual(len(data['recent_activity']['payments']), 5)

        # System health
        self.assertIn('system_health', data)
        self.assertEqual(data['system_health']['api'], 'healthy')
        self.assertIn(data['system_health']['database'], ['healthy', 'unreachable'])
