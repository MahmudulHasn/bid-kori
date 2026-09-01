from datetime import timedelta
from io import BytesIO

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from products.models import Product

from .models import Auction


def _make_test_image(name='test.png'):
    buffer = BytesIO()
    Image.new('RGB', (10, 10), color='red').save(buffer, format='PNG')
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type='image/png')


@override_settings(
    STORAGES={
        'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
        'staticfiles': {
            'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
        },
    }
)
class AuctionAuthorizationTests(APITestCase):
    """Object-level authorization for auction management endpoints."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username='owner',
            email='owner@test.com',
            password='pass12345',
        )
        self.other = User.objects.create_user(
            username='other',
            email='other@test.com',
            password='pass12345',
        )
        self.owner_token = Token.objects.create(user=self.owner)
        self.other_token = Token.objects.create(user=self.other)

    def _create_auction(self, seller=None):
        seller = seller or self.owner
        now = timezone.now()
        product = Product.objects.create(
            seller=seller,
            title='Test Item',
            description='Desc',
        )
        return Auction.objects.create(
            product=product,
            starting_bid=100,
            current_highest_bid=100,
            min_increment=10,
            start_time=now,
            end_time=now + timedelta(days=1),
            status=Auction.Status.ACTIVE,
        )

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_owner_can_patch_own_auction(self):
        auction = self._create_auction()
        self._auth(self.owner_token)
        response = self.client.patch(
            f'/api/auctions/{auction.pk}/',
            {'min_increment': '15.00'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        auction.refresh_from_db()
        self.assertEqual(float(auction.min_increment), 15.0)

    def test_non_owner_cannot_put_auction(self):
        auction = self._create_auction()
        now = timezone.now()
        self._auth(self.other_token)
        response = self.client.put(
            f'/api/auctions/{auction.pk}/',
            {
                'product': {
                    'title': 'Hijacked title',
                    'description': 'Hijacked desc',
                    'condition': 'NEW',
                },
                'starting_bid': '100.00',
                'min_increment': '20.00',
                'start_time': now.isoformat(),
                'end_time': (now + timedelta(days=2)).isoformat(),
            },
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        auction.product.refresh_from_db()
        self.assertEqual(auction.product.title, 'Test Item')

    def test_non_owner_cannot_patch_auction(self):
        auction = self._create_auction()
        self._auth(self.other_token)
        response = self.client.patch(
            f'/api/auctions/{auction.pk}/',
            {'min_increment': '15.00'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        auction.refresh_from_db()
        self.assertEqual(float(auction.min_increment), 10.0)

    def test_owner_can_delete_own_auction(self):
        auction = self._create_auction()
        self._auth(self.owner_token)
        response = self.client.delete(f'/api/auctions/{auction.pk}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Auction.objects.filter(pk=auction.pk).exists())

    def test_non_owner_cannot_delete_auction(self):
        auction = self._create_auction()
        self._auth(self.other_token)
        response = self.client.delete(f'/api/auctions/{auction.pk}/')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Auction.objects.filter(pk=auction.pk).exists())

    def test_owner_can_transition_own_auction(self):
        auction = self._create_auction()
        self._auth(self.owner_token)
        response = self.client.post(
            f'/api/auctions/{auction.pk}/transition/',
            {'status': 'CANCELLED'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.CANCELLED)

    def test_non_owner_cannot_transition_auction(self):
        auction = self._create_auction()
        self._auth(self.other_token)
        response = self.client.post(
            f'/api/auctions/{auction.pk}/transition/',
            {'status': 'CANCELLED'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.ACTIVE)

    def test_unauthenticated_cannot_patch_auction(self):
        auction = self._create_auction()
        response = self.client.patch(
            f'/api/auctions/{auction.pk}/',
            {'min_increment': '15.00'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_cannot_transition_auction(self):
        auction = self._create_auction()
        response = self.client.post(
            f'/api/auctions/{auction.pk}/transition/',
            {'status': 'CANCELLED'},
            format='json',
        )
        self.assertIn(response.status_code, (401, 403))

    def test_unauthenticated_can_list_auctions(self):
        self._create_auction()
        response = self.client.get('/api/auctions/')
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data), 1)

    def test_unauthenticated_can_retrieve_auction(self):
        auction = self._create_auction()
        response = self.client.get(f'/api/auctions/{auction.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], auction.pk)

    def test_owner_can_upload_images(self):
        auction = self._create_auction()
        self._auth(self.owner_token)
        response = self.client.post(
            f'/api/auctions/{auction.pk}/images/',
            {'images': _make_test_image()},
            format='multipart',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(auction.images.count(), 1)

    def test_non_owner_cannot_upload_images(self):
        auction = self._create_auction()
        self._auth(self.other_token)
        response = self.client.post(
            f'/api/auctions/{auction.pk}/images/',
            {'images': _make_test_image()},
            format='multipart',
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(auction.images.count(), 0)


class AnalyticsAuthorizationTests(APITestCase):
    """Staff-only access for analytics API and dashboard."""

    def setUp(self):
        self.staff = User.objects.create_user(
            username='staff',
            email='staff@test.com',
            password='pass12345',
            is_staff=True,
        )
        self.regular = User.objects.create_user(
            username='bidder',
            email='bidder@test.com',
            password='pass12345',
        )
        self.staff_token = Token.objects.create(user=self.staff)
        self.regular_token = Token.objects.create(user=self.regular)

        now = timezone.now()
        product = Product.objects.create(
            seller=self.staff,
            title='Analytics Test Item',
            description='Desc',
        )
        auction = Auction.objects.create(
            product=product,
            starting_bid=100,
            current_highest_bid=110,
            min_increment=10,
            start_time=now,
            end_time=now + timedelta(days=1),
            status=Auction.Status.ACTIVE,
        )
        from .models import Bid

        Bid.objects.create(auction=auction, bidder=self.regular, amount=110)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_anonymous_cannot_access_analytics_summary(self):
        response = self.client.get('/api/auctions/analytics/')
        self.assertIn(response.status_code, (401, 403))
        self.assertNotIn('bidder_username', response.content.decode())

    def test_regular_user_cannot_access_analytics_summary(self):
        self._auth(self.regular_token)
        response = self.client.get('/api/auctions/analytics/')
        self.assertEqual(response.status_code, 403)

    def test_staff_can_access_analytics_summary(self):
        self._auth(self.staff_token)
        response = self.client.get('/api/auctions/analytics/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('total_active_auctions', response.data)
        self.assertIn('total_bids_placed', response.data)
        self.assertIn('total_bidding_volume', response.data)
        self.assertIn('category_breakdown', response.data)
        self.assertIn('bid_escalation_history', response.data)
        self.assertIn('top_active_bidders', response.data)
        self.assertGreaterEqual(len(response.data['top_active_bidders']), 1)
        self.assertEqual(
            response.data['top_active_bidders'][0]['username'],
            self.regular.username,
        )

    def test_anonymous_cannot_access_analytics_dashboard(self):
        response = self.client.get('/api/auctions/analytics/dashboard/')
        self.assertEqual(response.status_code, 403)

    def test_regular_user_cannot_access_analytics_dashboard(self):
        self.client.force_login(self.regular)
        response = self.client.get('/api/auctions/analytics/dashboard/')
        self.assertEqual(response.status_code, 403)

    def test_staff_can_access_analytics_dashboard(self):
        self.client.force_login(self.staff)
        response = self.client.get('/api/auctions/analytics/dashboard/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'BidKori Analytics')


class AnalyticsAuthorizationTests(APITestCase):
    """Staff-only access for analytics API and dashboard."""

    def setUp(self):
        self.staff = User.objects.create_user(
            username='staff',
            email='staff@test.com',
            password='pass12345',
            is_staff=True,
        )
        self.regular = User.objects.create_user(
            username='bidder',
            email='bidder@test.com',
            password='pass12345',
        )
        self.staff_token = Token.objects.create(user=self.staff)
        self.regular_token = Token.objects.create(user=self.regular)

        now = timezone.now()
        product = Product.objects.create(
            seller=self.staff,
            title='Analytics Test Item',
            description='Desc',
        )
        auction = Auction.objects.create(
            product=product,
            starting_bid=100,
            current_highest_bid=110,
            min_increment=10,
            start_time=now,
            end_time=now + timedelta(days=1),
            status=Auction.Status.ACTIVE,
        )
        from .models import Bid

        Bid.objects.create(auction=auction, bidder=self.regular, amount=110)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_anonymous_cannot_access_analytics_summary(self):
        response = self.client.get('/api/auctions/analytics/')
        self.assertIn(response.status_code, (401, 403))
        self.assertNotIn('bidder_username', response.content.decode())

    def test_regular_user_cannot_access_analytics_summary(self):
        self._auth(self.regular_token)
        response = self.client.get('/api/auctions/analytics/')
        self.assertEqual(response.status_code, 403)

    def test_staff_can_access_analytics_summary(self):
        self._auth(self.staff_token)
        response = self.client.get('/api/auctions/analytics/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('total_active_auctions', response.data)
        self.assertIn('total_bids_placed', response.data)
        self.assertIn('total_bidding_volume', response.data)
        self.assertIn('category_breakdown', response.data)
        self.assertIn('bid_escalation_history', response.data)
        self.assertIn('top_active_bidders', response.data)
        self.assertGreaterEqual(len(response.data['top_active_bidders']), 1)
        self.assertEqual(
            response.data['top_active_bidders'][0]['username'],
            self.regular.username,
        )

    def test_anonymous_cannot_access_analytics_dashboard(self):
        response = self.client.get('/api/auctions/analytics/dashboard/')
        self.assertEqual(response.status_code, 403)

    def test_regular_user_cannot_access_analytics_dashboard(self):
        self.client.force_login(self.regular)
        response = self.client.get('/api/auctions/analytics/dashboard/')
        self.assertEqual(response.status_code, 403)

    def test_staff_can_access_analytics_dashboard(self):
        self.client.force_login(self.staff)
        response = self.client.get('/api/auctions/analytics/dashboard/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'BidKori Analytics')

