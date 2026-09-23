"""Tests for Admin Fulfillment Audit API (ADMIN-W01).

Covers:
- Staff authorization (list, detail, summary)
- Buyer/Seller/Anonymous denied
- All 4 derived states (NOT_STARTED, DRAFT, COMPLETED_LOCKED, UNLOCKED)
- Unlock revenue Decimal accuracy
- Filtering (status, unlock_status, seller, winner, search)
- Pagination
- PII leak assertions
- Integrity warning derivation
- Notification audit metadata
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from auctions.models import (
    Auction,
    Bid,
    Payment,
    WinnerDetailsUnlock,
    WinnerFulfillmentDetails,
)
from notifications.models import Notification
from products.models import Category, Product
from users.models import UserProfile, ensure_user_profile

# PII fields that must NEVER appear in admin responses
PII_FIELDS = (
    'phone', 'email', 'full_name', 'address_line', 'area',
    'district', 'division', 'postal_code', 'delivery_note',
)


class AdminFulfillmentBaseTestCase(APITestCase):
    """Shared fixture setup for admin fulfillment tests."""

    def setUp(self):
        self.now = timezone.now()

        # Users
        self.admin = User.objects.create_user(
            username='ful_admin', email='ful_admin@test.com',
            password='Password123!', is_staff=True,
        )
        self.seller = User.objects.create_user(
            username='ful_seller', email='ful_seller@test.com',
            password='Password123!',
        )
        self.buyer1 = User.objects.create_user(
            username='ful_buyer1', email='ful_buyer1@test.com',
            password='Password123!',
        )
        self.buyer2 = User.objects.create_user(
            username='ful_buyer2', email='ful_buyer2@test.com',
            password='Password123!',
        )
        self.buyer3 = User.objects.create_user(
            username='ful_buyer3', email='ful_buyer3@test.com',
            password='Password123!',
        )
        self.buyer4 = User.objects.create_user(
            username='ful_buyer4', email='ful_buyer4@test.com',
            password='Password123!',
        )
        ensure_user_profile(self.admin, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.buyer1, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.buyer2, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.buyer3, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.buyer4, role=UserProfile.Role.BUYER)

        # Category + Products
        self.cat = Category.objects.create(name='AdminTest', slug='admin-test')
        products = []
        for i in range(1, 5):
            products.append(Product.objects.create(
                seller=self.seller, category=self.cat,
                title=f'AdminTest Product {i}',
                description=f'Test {i}', condition='NEW',
            ))
        self.products = products

        # Auction 1: NOT_STARTED (closed, winner, but NO WFD)
        self.auction_not_started = Auction.objects.create(
            product=products[0],
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('500.00'),
            start_time=self.now - timedelta(hours=5),
            end_time=self.now - timedelta(hours=1),
            status=Auction.Status.CLOSED,
            winning_bidder=self.buyer1,
        )

        # Auction 2: DRAFT
        self.auction_draft = Auction.objects.create(
            product=products[1],
            starting_bid=Decimal('200.00'),
            current_highest_bid=Decimal('800.00'),
            start_time=self.now - timedelta(hours=5),
            end_time=self.now - timedelta(hours=1),
            status=Auction.Status.CLOSED,
            winning_bidder=self.buyer2,
        )
        self.wfd_draft = WinnerFulfillmentDetails.objects.create(
            auction=self.auction_draft,
            buyer=self.buyer2,
            full_name='Draft Buyer',
            phone='01712345678',
            email='draft@test.com',
            address_line='123 Draft St',
            area='Test Area',
            district='Dhaka',
            division='Dhaka',
            postal_code='1200',
            status=WinnerFulfillmentDetails.Status.DRAFT,
            completed_step=2,
        )

        # Auction 3: COMPLETED_LOCKED
        self.auction_locked = Auction.objects.create(
            product=products[2],
            starting_bid=Decimal('300.00'),
            current_highest_bid=Decimal('1200.00'),
            start_time=self.now - timedelta(hours=5),
            end_time=self.now - timedelta(hours=1),
            status=Auction.Status.CLOSED,
            winning_bidder=self.buyer3,
        )
        self.wfd_locked = WinnerFulfillmentDetails.objects.create(
            auction=self.auction_locked,
            buyer=self.buyer3,
            full_name='Locked Buyer',
            phone='01712345679',
            email='locked@test.com',
            address_line='456 Locked Ave',
            area='Locked Area',
            district='Chittagong',
            division='Chittagong',
            postal_code='4000',
            status=WinnerFulfillmentDetails.Status.COMPLETED,
            completed_step=4,
            submitted_at=self.now - timedelta(hours=2),
        )

        # Auction 4: UNLOCKED
        self.auction_unlocked = Auction.objects.create(
            product=products[3],
            starting_bid=Decimal('500.00'),
            current_highest_bid=Decimal('2000.00'),
            start_time=self.now - timedelta(hours=5),
            end_time=self.now - timedelta(hours=1),
            status=Auction.Status.CLOSED,
            winning_bidder=self.buyer4,
        )
        self.wfd_unlocked = WinnerFulfillmentDetails.objects.create(
            auction=self.auction_unlocked,
            buyer=self.buyer4,
            full_name='Unlocked Buyer',
            phone='01712345680',
            email='unlocked@test.com',
            address_line='789 Unlocked Blvd',
            area='Unlocked Area',
            district='Rajshahi',
            division='Rajshahi',
            postal_code='6000',
            status=WinnerFulfillmentDetails.Status.COMPLETED,
            completed_step=4,
            submitted_at=self.now - timedelta(hours=3),
        )
        self.unlock = WinnerDetailsUnlock.objects.create(
            auction=self.auction_unlocked,
            seller=self.seller,
            winner_details=self.wfd_unlocked,
            fee_amount=Decimal('99.50'),
            currency='BDT',
            status=WinnerDetailsUnlock.Status.PAID,
            payment_reference='MOCK-UNLOCK-TEST-001',
            paid_at=self.now - timedelta(hours=1),
            unlocked_at=self.now - timedelta(hours=1),
        )

        # Notifications for audit
        Notification.objects.create(
            user=self.seller,
            type=Notification.Type.SELLER_WINNER_DETAILS_READY,
            title='Winner details ready',
            message='Buyer submitted details for Auction #test',
            auction=self.auction_unlocked,
        )
        Notification.objects.create(
            user=self.buyer4,
            type=Notification.Type.WINNER_DETAILS_UNLOCKED,
            title='Details unlocked',
            message='Seller unlocked your details',
            auction=self.auction_unlocked,
        )

        self.list_url = '/api/admin/fulfillment/'
        self.summary_url = '/api/admin/fulfillment/summary/'
        self.detail_url = f'/api/admin/fulfillment/{self.auction_unlocked.id}/'


# ──────────────────────────────────────────────────────────
# Authorization Tests
# ──────────────────────────────────────────────────────────

class AdminFulfillmentAuthTests(AdminFulfillmentBaseTestCase):

    def test_anonymous_list_denied(self):
        res = self.client.get(self.list_url)
        self.assertIn(res.status_code, [401, 403])

    def test_anonymous_summary_denied(self):
        res = self.client.get(self.summary_url)
        self.assertIn(res.status_code, [401, 403])

    def test_anonymous_detail_denied(self):
        res = self.client.get(self.detail_url)
        self.assertIn(res.status_code, [401, 403])

    def test_buyer_list_denied(self):
        self.client.force_authenticate(user=self.buyer1)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, 403)

    def test_buyer_detail_denied(self):
        self.client.force_authenticate(user=self.buyer1)
        res = self.client.get(self.detail_url)
        self.assertEqual(res.status_code, 403)

    def test_buyer_summary_denied(self):
        self.client.force_authenticate(user=self.buyer1)
        res = self.client.get(self.summary_url)
        self.assertEqual(res.status_code, 403)

    def test_seller_list_denied(self):
        self.client.force_authenticate(user=self.seller)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, 403)

    def test_seller_detail_denied(self):
        self.client.force_authenticate(user=self.seller)
        res = self.client.get(self.detail_url)
        self.assertEqual(res.status_code, 403)

    def test_seller_summary_denied(self):
        self.client.force_authenticate(user=self.seller)
        res = self.client.get(self.summary_url)
        self.assertEqual(res.status_code, 403)

    def test_staff_list_allowed(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, 200)

    def test_staff_detail_allowed(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.detail_url)
        self.assertEqual(res.status_code, 200)

    def test_staff_summary_allowed(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.summary_url)
        self.assertEqual(res.status_code, 200)

    def test_superuser_allowed(self):
        superuser = User.objects.create_superuser(
            username='ful_super', email='super@test.com', password='Password123!',
        )
        self.client.force_authenticate(user=superuser)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, 200)


# ──────────────────────────────────────────────────────────
# Summary Tests
# ──────────────────────────────────────────────────────────

class AdminFulfillmentSummaryTests(AdminFulfillmentBaseTestCase):

    def test_summary_counts(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.summary_url)
        data = res.json()
        self.assertEqual(data['total_requiring_fulfillment'], 4)
        self.assertEqual(data['not_started'], 1)
        self.assertEqual(data['draft'], 1)
        self.assertEqual(data['completed_locked'], 1)
        self.assertEqual(data['unlocked'], 1)

    def test_unlock_revenue_decimal_accuracy(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.summary_url)
        data = res.json()
        self.assertEqual(data['unlock_revenue'], '99.50')
        self.assertEqual(data['unlock_count'], 1)

    def test_summary_disclosure(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.summary_url)
        data = res.json()
        self.assertIn('disclosure', data)
        self.assertIn('mock', data['disclosure'].lower())

    def test_recent_unlocks_7d(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.summary_url)
        data = res.json()
        self.assertEqual(data['recent_unlocks_7d'], 1)


# ──────────────────────────────────────────────────────────
# List Tests
# ──────────────────────────────────────────────────────────

class AdminFulfillmentListTests(AdminFulfillmentBaseTestCase):

    def test_list_returns_all_states(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url)
        data = res.json()
        results = data.get('results', data)
        statuses = {r['fulfillment_status'] for r in results}
        self.assertIn('NOT_STARTED', statuses)
        self.assertIn('DRAFT', statuses)
        self.assertIn('COMPLETED_LOCKED', statuses)
        self.assertIn('UNLOCKED', statuses)

    def test_list_contains_required_fields(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url)
        data = res.json()
        results = data.get('results', data)
        item = results[0]
        required = [
            'auction_id', 'auction_title', 'product_title',
            'seller_username', 'winner_username', 'fulfillment_status',
            'integrity_status',
        ]
        for field in required:
            self.assertIn(field, item, f'Missing field: {field}')

    def test_list_pii_absent(self):
        """P0: Admin list must NOT expose Buyer PII."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url)
        content = res.content.decode()
        for pii_field in PII_FIELDS:
            # Ensure PII field names are not keys in the response
            self.assertNotIn(f'"{pii_field}"', content,
                             f'PII field "{pii_field}" found in list response')

    def test_list_pagination(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url)
        data = res.json()
        # Paginated response should have count/results
        self.assertIn('count', data)
        self.assertIn('results', data)
        self.assertEqual(data['count'], 4)


# ──────────────────────────────────────────────────────────
# Detail Tests
# ──────────────────────────────────────────────────────────

class AdminFulfillmentDetailTests(AdminFulfillmentBaseTestCase):

    def test_detail_metadata(self):
        self.client.force_authenticate(user=self.admin)
        url = f'/api/admin/fulfillment/{self.auction_unlocked.id}/'
        res = self.client.get(url)
        data = res.json()
        self.assertEqual(data['auction_id'], self.auction_unlocked.id)
        self.assertEqual(data['seller_username'], 'ful_seller')
        self.assertEqual(data['winner_username'], 'ful_buyer4')
        self.assertEqual(data['fulfillment_status'], 'UNLOCKED')
        self.assertEqual(data['unlock_status'], 'PAID')
        self.assertEqual(data['fee_amount'], '99.50')
        self.assertEqual(data['currency'], 'BDT')
        self.assertIsNotNone(data['payment_reference'])
        self.assertIsNotNone(data['unlocked_at'])

    def test_detail_pii_absent(self):
        """P0: Admin detail must NOT expose Buyer PII."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/admin/fulfillment/{self.auction_unlocked.id}/'
        res = self.client.get(url)
        content = res.content.decode()
        for pii_field in PII_FIELDS:
            self.assertNotIn(f'"{pii_field}"', content,
                             f'PII field "{pii_field}" found in detail response')

    def test_detail_not_started(self):
        self.client.force_authenticate(user=self.admin)
        url = f'/api/admin/fulfillment/{self.auction_not_started.id}/'
        res = self.client.get(url)
        data = res.json()
        self.assertEqual(data['fulfillment_status'], 'NOT_STARTED')
        self.assertIsNone(data['fulfillment_id'])
        self.assertIsNone(data['unlock_id'])

    def test_detail_integrity_ok(self):
        self.client.force_authenticate(user=self.admin)
        url = f'/api/admin/fulfillment/{self.auction_unlocked.id}/'
        res = self.client.get(url)
        data = res.json()
        self.assertEqual(data['integrity_status'], 'OK')
        self.assertEqual(data['integrity_issues'], [])

    def test_detail_notification_audit(self):
        self.client.force_authenticate(user=self.admin)
        url = f'/api/admin/fulfillment/{self.auction_unlocked.id}/'
        res = self.client.get(url)
        data = res.json()
        audit = data['notification_audit']
        self.assertTrue(audit['details_ready_notified'])
        self.assertTrue(audit['unlock_notified'])

    def test_detail_404(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/admin/fulfillment/99999/')
        self.assertEqual(res.status_code, 404)


# ──────────────────────────────────────────────────────────
# Filter Tests
# ──────────────────────────────────────────────────────────

class AdminFulfillmentFilterTests(AdminFulfillmentBaseTestCase):

    def test_filter_not_started(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url, {'status': 'NOT_STARTED'})
        results = res.json().get('results', res.json())
        for r in results:
            self.assertEqual(r['fulfillment_status'], 'NOT_STARTED')

    def test_filter_draft(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url, {'status': 'DRAFT'})
        results = res.json().get('results', res.json())
        for r in results:
            self.assertEqual(r['fulfillment_status'], 'DRAFT')

    def test_filter_completed_locked(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url, {'status': 'COMPLETED_LOCKED'})
        results = res.json().get('results', res.json())
        for r in results:
            self.assertEqual(r['fulfillment_status'], 'COMPLETED_LOCKED')

    def test_filter_unlocked(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url, {'status': 'UNLOCKED'})
        results = res.json().get('results', res.json())
        self.assertTrue(len(results) >= 1)
        for r in results:
            self.assertEqual(r['fulfillment_status'], 'UNLOCKED')

    def test_filter_seller(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url, {'seller': 'ful_seller'})
        results = res.json().get('results', res.json())
        self.assertEqual(len(results), 4)

    def test_filter_winner(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url, {'winner': 'ful_buyer1'})
        results = res.json().get('results', res.json())
        self.assertEqual(len(results), 1)

    def test_search_product(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url, {'search': 'Product 1'})
        results = res.json().get('results', res.json())
        self.assertTrue(len(results) >= 1)

    def test_filter_unlock_status_paid(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url, {'unlock_status': 'PAID'})
        results = res.json().get('results', res.json())
        self.assertTrue(len(results) >= 1)
        for r in results:
            self.assertEqual(r['unlock_status'], 'PAID')


# ──────────────────────────────────────────────────────────
# Integrity Warning Tests
# ──────────────────────────────────────────────────────────

class AdminFulfillmentIntegrityTests(AdminFulfillmentBaseTestCase):

    def test_buyer_mismatch_warning(self):
        """WFD buyer != auction winner triggers integrity warning."""
        # Create mismatched WFD
        extra_product = Product.objects.create(
            seller=self.seller, category=self.cat,
            title='Mismatch Product', description='Test', condition='NEW',
        )
        auction = Auction.objects.create(
            product=extra_product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('500.00'),
            start_time=self.now - timedelta(hours=5),
            end_time=self.now - timedelta(hours=1),
            status=Auction.Status.CLOSED,
            winning_bidder=self.buyer1,
        )
        WinnerFulfillmentDetails.objects.create(
            auction=auction,
            buyer=self.buyer2,  # Mismatch!
            status=WinnerFulfillmentDetails.Status.COMPLETED,
            completed_step=4,
            submitted_at=self.now,
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f'/api/admin/fulfillment/{auction.id}/')
        data = res.json()
        self.assertEqual(data['integrity_status'], 'WARNING')
        self.assertTrue(
            any('buyer' in issue.lower() for issue in data['integrity_issues'])
        )

    def test_paid_unlock_missing_unlocked_at(self):
        """PAID unlock with null unlocked_at triggers integrity warning."""
        extra_product = Product.objects.create(
            seller=self.seller, category=self.cat,
            title='Missing Timestamp', description='Test', condition='NEW',
        )
        auction = Auction.objects.create(
            product=extra_product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('500.00'),
            start_time=self.now - timedelta(hours=5),
            end_time=self.now - timedelta(hours=1),
            status=Auction.Status.CLOSED,
            winning_bidder=self.buyer1,
        )
        wfd = WinnerFulfillmentDetails.objects.create(
            auction=auction,
            buyer=self.buyer1,
            status=WinnerFulfillmentDetails.Status.COMPLETED,
            completed_step=4,
            submitted_at=self.now,
        )
        WinnerDetailsUnlock.objects.create(
            auction=auction,
            seller=self.seller,
            winner_details=wfd,
            fee_amount=Decimal('50.00'),
            currency='BDT',
            status=WinnerDetailsUnlock.Status.PAID,
            payment_reference='MOCK-MISSING-TS',
            paid_at=self.now,
            unlocked_at=None,  # Missing!
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f'/api/admin/fulfillment/{auction.id}/')
        data = res.json()
        self.assertEqual(data['integrity_status'], 'WARNING')
        self.assertTrue(
            any('unlocked_at' in issue for issue in data['integrity_issues'])
        )

    def test_notification_consistency_warning(self):
        """Completed WFD without READY notification triggers advisory warning."""
        # auction_locked has COMPLETED WFD but no notifications
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f'/api/admin/fulfillment/{self.auction_locked.id}/')
        data = res.json()
        self.assertEqual(data['integrity_status'], 'WARNING')
        self.assertTrue(
            any('SELLER_WINNER_DETAILS_READY' in issue for issue in data['integrity_issues'])
        )


# ──────────────────────────────────────────────────────────
# IDOR Test
# ──────────────────────────────────────────────────────────

class AdminFulfillmentIDORTests(AdminFulfillmentBaseTestCase):

    def test_buyer_cannot_access_admin_detail(self):
        """Normal authenticated user calling admin detail must be denied."""
        self.client.force_authenticate(user=self.buyer1)
        res = self.client.get(self.detail_url)
        self.assertEqual(res.status_code, 403)
