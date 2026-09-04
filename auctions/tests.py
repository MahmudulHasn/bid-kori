from datetime import timedelta
from io import BytesIO

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TransactionTestCase, override_settings
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
            start_time=now + timedelta(hours=1),
            end_time=now + timedelta(days=1),
            status=Auction.Status.ACTIVE,
        )

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_owner_can_patch_own_auction(self):
        now = timezone.now()
        seller = self.owner
        product = Product.objects.create(
            seller=seller,
            title='Editable Item',
            description='Desc',
        )
        auction = Auction.objects.create(
            product=product,
            starting_bid=100,
            current_highest_bid=100,
            min_increment=10,
            start_time=now + timedelta(days=1),
            end_time=now + timedelta(days=2),
            status=Auction.Status.ACTIVE,
        )
        self._auth(self.owner_token)
        response = self.client.patch(
            f'/api/auctions/{auction.pk}/',
            {'min_increment': '15.00'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
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
        self.assertIsNone(auction.winning_bidder)

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


class AuctionLifecycleTests(APITestCase):
    """Authoritative close/cancel and bidding lifecycle."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='seller',
            email='seller@test.com',
            password='pass12345',
        )
        self.buyer_a = User.objects.create_user(
            username='buyer_a',
            email='buyera@test.com',
            password='pass12345',
        )
        self.buyer_b = User.objects.create_user(
            username='buyer_b',
            email='buyerb@test.com',
            password='pass12345',
        )
        self.seller_token = Token.objects.create(user=self.seller)
        self.buyer_a_token = Token.objects.create(user=self.buyer_a)
        self.buyer_b_token = Token.objects.create(user=self.buyer_b)

    def _create_auction(
        self,
        *,
        start_offset=timedelta(seconds=-60),
        end_offset=timedelta(hours=1),
        starting_bid=100,
        min_increment=10,
    ):
        now = timezone.now()
        product = Product.objects.create(
            seller=self.seller,
            title='Lifecycle Item',
            description='Desc',
        )
        return Auction.objects.create(
            product=product,
            starting_bid=starting_bid,
            current_highest_bid=starting_bid,
            min_increment=min_increment,
            start_time=now + start_offset,
            end_time=now + end_offset,
            status=Auction.Status.ACTIVE,
        )

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_close_auction_with_bids_assigns_highest_bidder(self):
        from .models import Bid
        from .services import AuctionLifecycleService

        auction = self._create_auction()
        Bid.objects.create(auction=auction, bidder=self.buyer_a, amount=110)
        Bid.objects.create(auction=auction, bidder=self.buyer_b, amount=120)

        closed, did_close = AuctionLifecycleService.close_auction(auction.pk)
        self.assertTrue(did_close)
        self.assertEqual(closed.status, Auction.Status.CLOSED)
        self.assertEqual(closed.winning_bidder, self.buyer_b)
        self.assertEqual(float(closed.current_highest_bid), 120.0)

    def test_close_auction_with_no_bids(self):
        from .services import AuctionLifecycleService

        auction = self._create_auction()
        closed, did_close = AuctionLifecycleService.close_auction(auction.pk)
        self.assertTrue(did_close)
        self.assertEqual(closed.status, Auction.Status.CLOSED)
        self.assertIsNone(closed.winning_bidder)

    def test_equal_bid_amounts_earliest_timestamp_wins(self):
        from datetime import datetime

        from django.utils.timezone import make_aware

        from .models import Bid
        from .services import AuctionLifecycleService

        auction = self._create_auction()
        earlier = make_aware(datetime(2026, 1, 1, 12, 0, 0))
        later = make_aware(datetime(2026, 1, 1, 12, 5, 0))
        Bid.objects.create(
            auction=auction,
            bidder=self.buyer_a,
            amount=150,
            timestamp=earlier,
        )
        Bid.objects.create(
            auction=auction,
            bidder=self.buyer_b,
            amount=150,
            timestamp=later,
        )

        closed, _ = AuctionLifecycleService.close_auction(auction.pk)
        self.assertEqual(closed.winning_bidder, self.buyer_a)

    def test_close_already_closed_is_idempotent(self):
        from .services import AuctionLifecycleService

        auction = self._create_auction(end_offset=timedelta(hours=-1))
        auction.status = Auction.Status.CLOSED
        auction.save(update_fields=['status'])

        closed, did_close = AuctionLifecycleService.close_auction(auction.pk)
        self.assertFalse(did_close)
        self.assertEqual(closed.status, Auction.Status.CLOSED)

    def test_close_if_expired_does_nothing_before_end_time(self):
        from .services import AuctionLifecycleService

        auction = self._create_auction(end_offset=timedelta(hours=1))
        _, closed = AuctionLifecycleService.close_if_expired(auction.pk)
        self.assertFalse(closed)
        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.ACTIVE)

    def test_cancel_active_clears_winner(self):
        from .models import Bid
        from .services import AuctionLifecycleService

        auction = self._create_auction()
        auction.winning_bidder = self.buyer_a
        auction.save(update_fields=['winning_bidder'])
        Bid.objects.create(auction=auction, bidder=self.buyer_a, amount=110)

        cancelled, did_cancel = AuctionLifecycleService.cancel_auction(auction.pk)
        self.assertTrue(did_cancel)
        self.assertEqual(cancelled.status, Auction.Status.CANCELLED)
        self.assertIsNone(cancelled.winning_bidder)

    def test_cannot_cancel_closed_auction(self):
        from .services import AuctionLifecycleService

        auction = self._create_auction()
        AuctionLifecycleService.close_auction(auction.pk)
        with self.assertRaises(ValidationError):
            AuctionLifecycleService.cancel_auction(auction.pk)

    def test_bid_before_end_time_succeeds(self):
        from .services import BidService

        auction = self._create_auction()
        bid = BidService.place_bid(auction.pk, self.buyer_a, 110)
        self.assertEqual(float(bid.amount), 110.0)
        auction.refresh_from_db()
        self.assertEqual(float(auction.current_highest_bid), 110.0)
        self.assertIsNone(auction.winning_bidder)

    def test_bid_at_or_after_end_time_rejected_and_closes(self):
        from .services import BidService, AuctionLifecycleService

        auction = self._create_auction(end_offset=timedelta(seconds=-1))
        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, self.buyer_a, 110)

        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.CLOSED)

    def test_bid_on_closed_auction_rejected(self):
        from .services import AuctionLifecycleService, BidService

        auction = self._create_auction()
        AuctionLifecycleService.close_auction(auction.pk)
        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, self.buyer_a, 110)

    def test_bid_on_cancelled_auction_rejected(self):
        from .services import AuctionLifecycleService, BidService

        auction = self._create_auction()
        AuctionLifecycleService.cancel_auction(auction.pk)
        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, self.buyer_a, 110)

    def test_future_start_time_prevents_bidding(self):
        from .services import BidService

        auction = self._create_auction(start_offset=timedelta(hours=1))
        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, self.buyer_a, 110)

    def test_retrieve_expired_auction_returns_closed_with_winner(self):
        from .models import Bid

        auction = self._create_auction(end_offset=timedelta(seconds=-1))
        Bid.objects.create(auction=auction, bidder=self.buyer_a, amount=110)

        response = self.client.get(f'/api/auctions/{auction.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], Auction.Status.CLOSED)
        self.assertEqual(response.data['winning_bidder'], self.buyer_a.pk)

    def test_close_expired_auctions_command(self):
        from io import StringIO

        from django.core.management import call_command

        from .models import Bid

        auction = self._create_auction(end_offset=timedelta(seconds=-1))
        Bid.objects.create(auction=auction, bidder=self.buyer_b, amount=115)

        out = StringIO()
        call_command('close_expired_auctions', stdout=out)
        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.CLOSED)
        self.assertEqual(auction.winning_bidder, self.buyer_b)

    def test_transition_to_closed_assigns_final_winner(self):
        from .models import Bid

        auction = self._create_auction()
        Bid.objects.create(auction=auction, bidder=self.buyer_a, amount=110)
        self._auth(self.seller_token)

        response = self.client.post(
            f'/api/auctions/{auction.pk}/transition/',
            {'status': 'CLOSED'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.CLOSED)
        self.assertEqual(auction.winning_bidder, self.buyer_a)

    def test_transition_to_cancelled_clears_winner(self):
        auction = self._create_auction()
        auction.winning_bidder = self.buyer_a
        auction.save(update_fields=['winning_bidder'])
        self._auth(self.seller_token)

        response = self.client.post(
            f'/api/auctions/{auction.pk}/transition/',
            {'status': 'CANCELLED'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.CANCELLED)
        self.assertIsNone(auction.winning_bidder)

    def test_cancelled_auction_cannot_checkout(self):
        from .services import AuctionLifecycleService

        auction = self._create_auction()
        AuctionLifecycleService.cancel_auction(auction.pk)
        self._auth(self.buyer_a_token)
        response = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(response.status_code, 400)

    def test_closed_no_winner_cannot_checkout(self):
        from .services import AuctionLifecycleService

        auction = self._create_auction()
        AuctionLifecycleService.close_auction(auction.pk)
        self._auth(self.buyer_a_token)
        response = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(response.status_code, 400)

    def test_winner_can_checkout_after_authoritative_close(self):
        from .models import Bid
        from .services import AuctionLifecycleService

        auction = self._create_auction()
        Bid.objects.create(auction=auction, bidder=self.buyer_a, amount=110)
        AuctionLifecycleService.close_auction(auction.pk)

        self._auth(self.buyer_a_token)
        response = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('transaction_id', response.data)


class ReservePriceTests(APITestCase):
    """Reserve-price evaluation at authoritative close."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='reserve_seller',
            email='reserve_seller@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='reserve_buyer',
            email='reserve_buyer@test.com',
            password='pass12345',
        )
        self.seller_token = Token.objects.create(user=self.seller)

    def _create_auction(self, *, reserve_price=None, starting_bid=100):
        now = timezone.now()
        product = Product.objects.create(
            seller=self.seller,
            title='Reserve Item',
            description='Desc',
        )
        return Auction.objects.create(
            product=product,
            starting_bid=starting_bid,
            current_highest_bid=starting_bid,
            min_increment=10,
            reserve_price=reserve_price,
            start_time=now - timedelta(minutes=5),
            end_time=now + timedelta(hours=1),
            status=Auction.Status.ACTIVE,
        )

    def test_no_reserve_highest_bid_wins(self):
        from .models import Bid
        from .services import AuctionLifecycleService

        auction = self._create_auction(reserve_price=None)
        Bid.objects.create(auction=auction, bidder=self.buyer, amount=150)

        closed, did_close = AuctionLifecycleService.close_auction(auction.pk)
        self.assertTrue(did_close)
        self.assertEqual(closed.status, Auction.Status.CLOSED)
        self.assertEqual(closed.winning_bidder, self.buyer)
        self.assertEqual(float(closed.current_highest_bid), 150.0)

    def test_highest_bid_below_reserve_no_winner(self):
        from .models import Bid
        from .services import AuctionLifecycleService

        auction = self._create_auction(reserve_price=200)
        Bid.objects.create(auction=auction, bidder=self.buyer, amount=150)

        closed, _ = AuctionLifecycleService.close_auction(auction.pk)
        self.assertEqual(closed.status, Auction.Status.CLOSED)
        self.assertIsNone(closed.winning_bidder)
        self.assertEqual(float(closed.current_highest_bid), 150.0)

    def test_highest_bid_exactly_equal_to_reserve_wins(self):
        from .models import Bid
        from .services import AuctionLifecycleService

        auction = self._create_auction(reserve_price=200)
        Bid.objects.create(auction=auction, bidder=self.buyer, amount=200)

        closed, _ = AuctionLifecycleService.close_auction(auction.pk)
        self.assertEqual(closed.winning_bidder, self.buyer)
        self.assertEqual(float(closed.current_highest_bid), 200.0)

    def test_highest_bid_above_reserve_wins(self):
        from .models import Bid
        from .services import AuctionLifecycleService

        auction = self._create_auction(reserve_price=200)
        Bid.objects.create(auction=auction, bidder=self.buyer, amount=250)

        closed, _ = AuctionLifecycleService.close_auction(auction.pk)
        self.assertEqual(closed.winning_bidder, self.buyer)
        self.assertEqual(float(closed.current_highest_bid), 250.0)

    def test_no_bids_with_reserve_no_winner(self):
        from .services import AuctionLifecycleService

        auction = self._create_auction(reserve_price=200)
        closed, _ = AuctionLifecycleService.close_auction(auction.pk)
        self.assertEqual(closed.status, Auction.Status.CLOSED)
        self.assertIsNone(closed.winning_bidder)

    def test_repeated_close_with_reserve_is_idempotent(self):
        from .models import Bid
        from .services import AuctionLifecycleService

        auction = self._create_auction(reserve_price=200)
        Bid.objects.create(auction=auction, bidder=self.buyer, amount=150)

        first, first_closed = AuctionLifecycleService.close_auction(auction.pk)
        self.assertTrue(first_closed)
        self.assertIsNone(first.winning_bidder)

        second, second_closed = AuctionLifecycleService.close_auction(auction.pk)
        self.assertFalse(second_closed)
        self.assertEqual(second.status, Auction.Status.CLOSED)
        self.assertIsNone(second.winning_bidder)
        self.assertEqual(float(second.current_highest_bid), 150.0)

    def test_reserve_price_not_exposed_on_public_retrieve(self):
        auction = self._create_auction(reserve_price=500)
        response = self.client.get(f'/api/auctions/{auction.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('reserve_price', response.data)

    def test_below_reserve_closed_auction_cannot_checkout(self):
        from .models import Bid
        from .services import AuctionLifecycleService

        auction = self._create_auction(reserve_price=200)
        Bid.objects.create(auction=auction, bidder=self.buyer, amount=150)
        AuctionLifecycleService.close_auction(auction.pk)

        token = Token.objects.create(user=self.buyer)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.post(f'/api/auctions/{auction.pk}/checkout/')
        self.assertEqual(response.status_code, 400)


class BidServiceHardeningTests(APITestCase):
    """Hardened BidService.place_bid validation, atomicity, and winner semantics."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='bid_seller',
            email='bid_seller@test.com',
            password='pass12345',
        )
        self.buyer_a = User.objects.create_user(
            username='bid_buyer_a',
            email='bid_buyera@test.com',
            password='pass12345',
        )
        self.buyer_b = User.objects.create_user(
            username='bid_buyer_b',
            email='bid_buyerb@test.com',
            password='pass12345',
        )
        self.buyer_a_token = Token.objects.create(user=self.buyer_a)
        self.seller_token = Token.objects.create(user=self.seller)

    def _create_auction(
        self,
        *,
        start_offset=timedelta(minutes=-5),
        end_offset=timedelta(hours=1),
        starting_bid=100,
        min_increment=10,
        status=Auction.Status.ACTIVE,
    ):
        now = timezone.now()
        product = Product.objects.create(
            seller=self.seller,
            title='Bid Hardening Item',
            description='Desc',
        )
        return Auction.objects.create(
            product=product,
            starting_bid=starting_bid,
            current_highest_bid=starting_bid,
            min_increment=min_increment,
            start_time=now + start_offset,
            end_time=now + end_offset,
            status=status,
        )

    def test_valid_bid(self):
        from .models import Bid
        from .services import BidService

        auction = self._create_auction()
        bid = BidService.place_bid(auction.pk, self.buyer_a, 110)
        self.assertEqual(float(bid.amount), 110.0)
        auction.refresh_from_db()
        self.assertEqual(float(auction.current_highest_bid), 110.0)
        self.assertIsNone(auction.winning_bidder)
        self.assertEqual(Bid.objects.filter(auction=auction).count(), 1)

    def test_invalid_low_bid(self):
        from .models import Bid
        from .services import BidService

        auction = self._create_auction()
        BidService.place_bid(auction.pk, self.buyer_a, 110)
        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, self.buyer_b, 105)
        self.assertEqual(Bid.objects.filter(auction=auction).count(), 1)
        auction.refresh_from_db()
        self.assertEqual(float(auction.current_highest_bid), 110.0)

    def test_minimum_increment_enforced(self):
        from .services import BidService

        auction = self._create_auction(min_increment=25)
        BidService.place_bid(auction.pk, self.buyer_a, 125)
        # 125 + 25 = 150 required; 140 is too low
        with self.assertRaises(ValidationError) as ctx:
            BidService.place_bid(auction.pk, self.buyer_b, 140)
        self.assertIn('at least', str(ctx.exception))

    def test_seller_self_bid_rejected_by_service(self):
        from .models import Bid
        from .services import BidService

        auction = self._create_auction()
        with self.assertRaises(ValidationError) as ctx:
            BidService.place_bid(auction.pk, self.seller, 110)
        self.assertIn('Sellers cannot bid', str(ctx.exception))
        self.assertEqual(Bid.objects.filter(auction=auction).count(), 0)

    def test_seller_self_bid_rejected_by_api(self):
        auction = self._create_auction()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.seller_token.key}')
        response = self.client.post(
            f'/api/auctions/{auction.pk}/place-bid/',
            {'amount': '110.00'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_closed_auction_rejects_bid(self):
        from .services import AuctionLifecycleService, BidService

        auction = self._create_auction()
        AuctionLifecycleService.close_auction(auction.pk)
        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, self.buyer_a, 110)

    def test_cancelled_auction_rejects_bid(self):
        from .services import AuctionLifecycleService, BidService

        auction = self._create_auction()
        AuctionLifecycleService.cancel_auction(auction.pk)
        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, self.buyer_a, 110)

    def test_expired_auction_rejects_bid_and_closes(self):
        from .services import BidService

        auction = self._create_auction(end_offset=timedelta(seconds=-1))
        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, self.buyer_a, 110)
        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.CLOSED)

    def test_failed_bid_rolls_back_database_state(self):
        from .models import Bid
        from .services import BidService

        auction = self._create_auction()
        BidService.place_bid(auction.pk, self.buyer_a, 110)
        before_count = Bid.objects.filter(auction=auction).count()
        before_high = Auction.objects.get(pk=auction.pk).current_highest_bid

        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, self.buyer_b, 111)

        auction.refresh_from_db()
        self.assertEqual(Bid.objects.filter(auction=auction).count(), before_count)
        self.assertEqual(auction.current_highest_bid, before_high)
        self.assertIsNone(auction.winning_bidder)

    def test_active_bid_does_not_set_final_winner(self):
        from .services import BidService

        auction = self._create_auction()
        BidService.place_bid(auction.pk, self.buyer_a, 110)
        BidService.place_bid(auction.pk, self.buyer_b, 120)
        auction.refresh_from_db()
        self.assertIsNone(auction.winning_bidder)
        self.assertEqual(float(auction.current_highest_bid), 120.0)

    def test_final_winner_assigned_only_after_close(self):
        from .services import AuctionLifecycleService, BidService

        auction = self._create_auction()
        BidService.place_bid(auction.pk, self.buyer_a, 110)
        BidService.place_bid(auction.pk, self.buyer_b, 130)
        auction.refresh_from_db()
        self.assertIsNone(auction.winning_bidder)

        closed, _ = AuctionLifecycleService.close_auction(auction.pk)
        self.assertEqual(closed.winning_bidder, self.buyer_b)
        self.assertEqual(float(closed.current_highest_bid), 130.0)

    def test_unauthenticated_bidder_rejected(self):
        from django.contrib.auth.models import AnonymousUser

        from .services import BidService

        auction = self._create_auction()
        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, AnonymousUser(), 110)

    def test_invalid_amount_rejected(self):
        from .services import BidService

        auction = self._create_auction()
        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, self.buyer_a, 0)
        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, self.buyer_a, -10)
        with self.assertRaises(ValidationError):
            BidService.place_bid(auction.pk, self.buyer_a, 'not-a-number')

    def test_place_bid_api_valid_and_auth_required(self):
        auction = self._create_auction()
        response = self.client.post(
            f'/api/auctions/{auction.pk}/place-bid/',
            {'amount': '110.00'},
            format='json',
        )
        self.assertIn(response.status_code, (401, 403))

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.buyer_a_token.key}')
        response = self.client.post(
            f'/api/auctions/{auction.pk}/place-bid/',
            {'amount': '110.00'},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        auction.refresh_from_db()
        self.assertIsNone(auction.winning_bidder)
        self.assertEqual(float(auction.current_highest_bid), 110.0)


class BidServiceConcurrencyTests(TransactionTestCase):
    """Concurrent place_bid attempts.

    PostgreSQL: ``test_concurrent_bids_preserve_highest`` uses threads +
    ``SELECT FOR UPDATE`` to assert only consistent highs survive contention.

    SQLite: that threaded test is skipped (`has_select_for_update` is false).
    ``test_contended_sequential_bids_preserve_highest`` still verifies
    contested amounts applied back-to-back keep Bid rows and
    ``current_highest_bid`` aligned on SQLite.
    """

    def setUp(self):
        self.seller = User.objects.create_user(
            username='conc_seller',
            email='conc_seller@test.com',
            password='pass12345',
        )
        self.buyers = [
            User.objects.create_user(
                username=f'conc_buyer_{i}',
                email=f'conc_buyer_{i}@test.com',
                password='pass12345',
            )
            for i in range(5)
        ]

    def test_contended_sequential_bids_preserve_highest(self):
        """Contended bids applied in rapid succession keep Bid and high in sync."""
        from decimal import Decimal

        from .models import Bid
        from .services import BidService

        now = timezone.now()
        product = Product.objects.create(
            seller=self.seller,
            title='Contended Bid Item',
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
        amounts = [
            Decimal('110'),
            Decimal('120'),
            Decimal('115'),
            Decimal('130'),
            Decimal('140'),
        ]
        accepted = []
        for i, amount in enumerate(amounts):
            try:
                BidService.place_bid(auction.pk, self.buyers[i], amount)
                accepted.append(amount)
            except ValidationError:
                pass

        auction.refresh_from_db()
        self.assertEqual(len(accepted), Bid.objects.filter(auction=auction).count())
        self.assertEqual(auction.current_highest_bid, max(accepted))
        self.assertIsNone(auction.winning_bidder)

    def test_concurrent_bids_preserve_highest(self):
        from concurrent.futures import ThreadPoolExecutor, as_completed
        from decimal import Decimal

        from django.db import connection

        from .models import Bid
        from .services import BidService

        if not connection.features.has_select_for_update:
            self.skipTest(
                'Concurrent bid locking requires select_for_update (PostgreSQL).'
            )

        now = timezone.now()
        product = Product.objects.create(
            seller=self.seller,
            title='Concurrent Bid Item',
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
        amounts = [
            Decimal('110'),
            Decimal('120'),
            Decimal('130'),
            Decimal('115'),
            Decimal('140'),
        ]

        def attempt(index, amount):
            connection.close()
            try:
                BidService.place_bid(auction.pk, self.buyers[index], amount)
                return ('ok', amount)
            except ValidationError:
                return ('reject', amount)
            except Exception as exc:  # noqa: BLE001
                return ('error', str(exc))

        results = []
        with ThreadPoolExecutor(max_workers=5) as pool:
            futures = [
                pool.submit(attempt, i, amount) for i, amount in enumerate(amounts)
            ]
            for future in as_completed(futures):
                results.append(future.result())

        auction.refresh_from_db()
        bid_count = Bid.objects.filter(auction=auction).count()
        accepted = [r for r in results if r[0] == 'ok']
        errors = [r for r in results if r[0] == 'error']

        self.assertEqual(errors, [])
        self.assertEqual(len(accepted), bid_count)
        self.assertGreaterEqual(bid_count, 1)
        max_accepted = max(
            Bid.objects.filter(auction=auction).values_list('amount', flat=True)
        )
        self.assertEqual(auction.current_highest_bid, max_accepted)
        self.assertIsNone(auction.winning_bidder)


@override_settings(
    STORAGES={
        'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
        'staticfiles': {
            'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
        },
    }
)
class AuctionImageUploadHardeningTests(APITestCase):
    """Content-based image upload validation and authorization."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username='img_owner',
            email='img_owner@test.com',
            password='pass12345',
        )
        self.other = User.objects.create_user(
            username='img_other',
            email='img_other@test.com',
            password='pass12345',
        )
        self.owner_token = Token.objects.create(user=self.owner)
        self.other_token = Token.objects.create(user=self.other)
        now = timezone.now()
        product = Product.objects.create(
            seller=self.owner,
            title='Image Listing',
            description='Desc',
        )
        self.auction = Auction.objects.create(
            product=product,
            starting_bid=100,
            current_highest_bid=100,
            min_increment=10,
            start_time=now + timedelta(days=1),
            end_time=now + timedelta(days=2),
            status=Auction.Status.ACTIVE,
        )

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def _upload(self, *, token=None, files=None, auction=None):
        if token is not None:
            self._auth(token)
        else:
            self.client.credentials()
        target = auction or self.auction
        payload = {}
        if files is not None:
            if isinstance(files, list):
                payload['images'] = files
            else:
                payload['images'] = files
        return self.client.post(
            f'/api/auctions/{target.pk}/images/',
            payload,
            format='multipart',
        )

    def test_valid_image_upload_by_owner(self):
        response = self._upload(token=self.owner_token, files=_make_test_image())
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.auction.images.count(), 1)

    def test_invalid_file_rejected_even_with_image_extension(self):
        fake = SimpleUploadedFile(
            'fake.png',
            b'this is not an image payload',
            content_type='image/png',
        )
        response = self._upload(token=self.owner_token, files=fake)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.auction.images.count(), 0)

    @override_settings(AUCTION_IMAGE_MAX_BYTES=200)
    def test_oversized_file_rejected(self):
        buffer = BytesIO()
        # Large enough PNG that exceeds the 200-byte test cap.
        Image.new('RGB', (120, 120), color='blue').save(buffer, format='PNG')
        buffer.seek(0)
        payload = buffer.read()
        self.assertGreater(len(payload), 200)
        oversized = SimpleUploadedFile(
            'big.png',
            payload,
            content_type='image/png',
        )
        response = self._upload(token=self.owner_token, files=oversized)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.auction.images.count(), 0)

    @override_settings(
        AUCTION_IMAGE_MAX_WIDTH=50,
        AUCTION_IMAGE_MAX_HEIGHT=50,
    )
    def test_oversized_dimensions_rejected(self):
        buffer = BytesIO()
        Image.new('RGB', (80, 80), color='green').save(buffer, format='PNG')
        buffer.seek(0)
        large = SimpleUploadedFile(
            'large.png',
            buffer.read(),
            content_type='image/png',
        )
        response = self._upload(token=self.owner_token, files=large)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.auction.images.count(), 0)

    def test_unauthenticated_upload_rejected(self):
        response = self._upload(token=None, files=_make_test_image())
        self.assertIn(response.status_code, (401, 403))
        self.assertEqual(self.auction.images.count(), 0)

    def test_other_seller_cannot_upload_to_auction(self):
        response = self._upload(token=self.other_token, files=_make_test_image())
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.auction.images.count(), 0)

    @override_settings(AUCTION_IMAGE_MAX_PER_AUCTION=1, AUCTION_IMAGE_MAX_PER_REQUEST=2)
    def test_per_auction_quota_enforced(self):
        first = self._upload(token=self.owner_token, files=_make_test_image('one.png'))
        self.assertEqual(first.status_code, 201, first.data)
        second = self._upload(token=self.owner_token, files=_make_test_image('two.png'))
        self.assertEqual(second.status_code, 400)
        self.assertEqual(self.auction.images.count(), 1)

    def test_valid_png_accepted_with_misleading_filename(self):
        buffer = BytesIO()
        Image.new('RGB', (12, 12), color='red').save(buffer, format='PNG')
        buffer.seek(0)
        spoofed = SimpleUploadedFile(
            'not-really.exe',
            buffer.read(),
            content_type='application/octet-stream',
        )
        response = self._upload(token=self.owner_token, files=spoofed)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.auction.images.count(), 1)


class AuctionListFilterAuthorizationTests(APITestCase):
    """List/filter correctness and private queryset scoping."""

    def setUp(self):
        from products.models import Category

        self.seller = User.objects.create_user(
            username='list_seller',
            email='list_seller@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='list_buyer',
            email='list_buyer@test.com',
            password='pass12345',
        )
        self.other_buyer = User.objects.create_user(
            username='other_buyer',
            email='other_buyer@test.com',
            password='pass12345',
        )
        self.buyer_token = Token.objects.create(user=self.buyer)
        self.other_token = Token.objects.create(user=self.other_buyer)

        self.electronics = Category.objects.create(
            name='Electronics',
            slug='electronics',
        )
        self.gaming = Category.objects.create(name='Gaming', slug='gaming')
        self.now = timezone.now()

    def _create_auction(
        self,
        *,
        title='Item',
        description='Desc',
        category=None,
        status=Auction.Status.ACTIVE,
        start_time=None,
        end_time=None,
        starting_bid=100,
    ):
        product = Product.objects.create(
            seller=self.seller,
            title=title,
            description=description,
            category=category,
        )
        return Auction.objects.create(
            product=product,
            starting_bid=starting_bid,
            current_highest_bid=starting_bid,
            min_increment=10,
            start_time=start_time or self.now - timedelta(hours=1),
            end_time=end_time or self.now + timedelta(days=1),
            status=status,
        )

    def test_status_filter_returns_only_matching_auctions(self):
        active = self._create_auction(title='Live Camera')
        closed = self._create_auction(title='Sold Phone', status=Auction.Status.CLOSED)
        cancelled = self._create_auction(
            title='Cancelled Watch',
            status=Auction.Status.CANCELLED,
        )

        response = self.client.get('/api/auctions/', {'status': 'ACTIVE'})
        self.assertEqual(response.status_code, 200)
        ids = {row['id'] for row in response.data}
        self.assertIn(active.pk, ids)
        self.assertNotIn(closed.pk, ids)
        self.assertNotIn(cancelled.pk, ids)

        closed_resp = self.client.get('/api/auctions/', {'status': 'CLOSED'})
        closed_ids = {row['id'] for row in closed_resp.data}
        self.assertEqual(closed_ids, {closed.pk})

    def test_category_filter_by_slug_and_name(self):
        electronics = self._create_auction(
            title='Laptop',
            category=self.electronics,
        )
        gaming = self._create_auction(title='Console', category=self.gaming)

        by_slug = self.client.get('/api/auctions/', {'category': 'electronics'})
        self.assertEqual({row['id'] for row in by_slug.data}, {electronics.pk})

        by_name = self.client.get('/api/auctions/', {'category': 'Gaming'})
        self.assertEqual({row['id'] for row in by_name.data}, {gaming.pk})

    def test_search_is_server_side_on_title_and_description(self):
        match_title = self._create_auction(
            title='Vintage Camera Body',
            description='plain box',
        )
        match_desc = self._create_auction(
            title='Other Item',
            description='Includes vintage lens kit',
        )
        self._create_auction(title='Kitchen Mixer', description='blender')

        response = self.client.get('/api/auctions/', {'search': 'vintage'})
        self.assertEqual(response.status_code, 200)
        ids = {row['id'] for row in response.data}
        self.assertEqual(ids, {match_title.pk, match_desc.pk})

    def test_expired_active_excluded_from_status_active_list(self):
        live = self._create_auction(title='Still Live')
        expired = self._create_auction(
            title='Expired Stale',
            start_time=self.now - timedelta(days=2),
            end_time=self.now - timedelta(minutes=1),
            status=Auction.Status.ACTIVE,
        )

        response = self.client.get('/api/auctions/', {'status': 'ACTIVE'})
        ids = {row['id'] for row in response.data}
        self.assertIn(live.pk, ids)
        self.assertNotIn(expired.pk, ids)
        expired.refresh_from_db()
        self.assertEqual(expired.status, Auction.Status.CLOSED)

    def test_active_endpoint_excludes_inactive_and_not_started(self):
        live = self._create_auction(title='Live Now')
        self._create_auction(title='Closed', status=Auction.Status.CLOSED)
        self._create_auction(title='Cancelled', status=Auction.Status.CANCELLED)
        self._create_auction(
            title='Expired',
            end_time=self.now - timedelta(minutes=1),
        )
        scheduled = self._create_auction(
            title='Not Started',
            start_time=self.now + timedelta(hours=2),
            end_time=self.now + timedelta(days=1),
        )

        response = self.client.get('/api/auctions/active/')
        self.assertEqual(response.status_code, 200)
        ids = {row['id'] for row in response.data}
        self.assertEqual(ids, {live.pk})
        self.assertNotIn(scheduled.pk, ids)

    def test_active_endpoint_supports_category_and_search(self):
        target = self._create_auction(
            title='Retro Camera',
            description='film body',
            category=self.electronics,
        )
        self._create_auction(
            title='Retro Console',
            description='gaming',
            category=self.gaming,
        )

        response = self.client.get(
            '/api/auctions/active/',
            {'category': 'electronics', 'search': 'camera'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual({row['id'] for row in response.data}, {target.pk})

    def test_list_query_params_do_not_break_retrieve(self):
        auction = self._create_auction(title='Detail Target')
        response = self.client.get(
            f'/api/auctions/{auction.pk}/',
            {'status': 'CLOSED', 'search': 'nope', 'category': 'missing'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], auction.pk)

    def test_my_bids_returns_only_authenticated_user_bids(self):
        from .models import Bid

        auction = self._create_auction(title='Bid Target')
        own = Bid.objects.create(auction=auction, bidder=self.buyer, amount=110)
        Bid.objects.create(auction=auction, bidder=self.other_buyer, amount=120)

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.buyer_token.key}')
        response = self.client.get('/api/auctions/my-bids/')
        self.assertEqual(response.status_code, 200)
        ids = {row['id'] for row in response.data}
        self.assertEqual(ids, {own.pk})
        for row in response.data:
            self.assertEqual(row['bidder_username'], self.buyer.username)

    def test_my_bids_requires_authentication(self):
        response = self.client.get('/api/auctions/my-bids/')
        self.assertIn(response.status_code, (401, 403))

    def test_list_response_is_bare_array_not_paginated(self):
        self._create_auction(title='Array Shape')
        response = self.client.get('/api/auctions/')
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertNotIn('results', response.data)

    def test_auction_payload_includes_product_seller_for_ownership_ux(self):
        auction = self._create_auction(title='Owned Item')
        response = self.client.get(f'/api/auctions/{auction.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['product']['seller'], self.seller.pk)
        self.assertNotIn('reserve_price', response.data)



class ExistingProductAuctionCreateTests(APITestCase):
    """POST /api/auctions/ with existing Product PK (Seller contract)."""

    def setUp(self):
        from users.models import UserProfile, ensure_user_profile

        self.seller = User.objects.create_user(
            username='ep_seller',
            email='ep_seller@test.com',
            password='pass12345',
        )
        self.other_seller = User.objects.create_user(
            username='ep_other_seller',
            email='ep_other@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='ep_buyer',
            email='ep_buyer@test.com',
            password='pass12345',
        )
        self.admin = User.objects.create_user(
            username='ep_admin',
            email='ep_admin@test.com',
            password='pass12345',
            is_staff=True,
        )
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.other_seller, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.admin, role=UserProfile.Role.SELLER)

        self.seller_token = Token.objects.create(user=self.seller)
        self.other_token = Token.objects.create(user=self.other_seller)
        self.buyer_token = Token.objects.create(user=self.buyer)
        self.admin_token = Token.objects.create(user=self.admin)

        self.product = Product.objects.create(
            seller=self.seller,
            title='Existing Catalog Item',
            description='Owned by seller',
            condition=Product.Condition.USED_GOOD,
        )
        self.other_product = Product.objects.create(
            seller=self.other_seller,
            title='Other Catalog Item',
            description='Owned by other',
            condition=Product.Condition.NEW,
        )
        self.now = timezone.now()

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def _payload(self, product_pk, **overrides):
        body = {
            'product': product_pk,
            'starting_bid': '1000.00',
            'min_increment': '100.00',
            'start_time': self.now.isoformat(),
            'end_time': (self.now + timedelta(days=1)).isoformat(),
        }
        body.update(overrides)
        return body

    def test_seller_creates_auction_for_owned_product_without_new_product(self):
        self._auth(self.seller_token)
        before = Product.objects.count()
        response = self.client.post(
            '/api/auctions/',
            self._payload(self.product.pk, reserve_price='1500.00'),
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Product.objects.count(), before)
        auction = Auction.objects.get(pk=response.data['id'])
        self.assertEqual(auction.product_id, self.product.pk)
        self.assertEqual(str(auction.starting_bid), '1000.00')
        self.assertEqual(str(auction.current_highest_bid), '1000.00')
        self.assertEqual(str(auction.reserve_price), '1500.00')
        self.assertEqual(auction.status, Auction.Status.ACTIVE)
        self.assertFalse(auction.is_featured)
        self.assertEqual(response.data['product']['id'], self.product.pk)
        self.assertEqual(response.data['product']['seller'], self.seller.pk)
        self.assertEqual(response.data['product']['title'], 'Existing Catalog Item')
        self.assertNotIn('reserve_price', response.data)

    def test_seller_cannot_create_for_other_sellers_product(self):
        self._auth(self.seller_token)
        response = self.client.post(
            '/api/auctions/',
            self._payload(self.other_product.pk),
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('product', response.data['error'])
        self.assertEqual(Auction.objects.count(), 0)

    def test_buyer_cannot_create_auction(self):
        self._auth(self.buyer_token)
        response = self.client.post(
            '/api/auctions/',
            self._payload(self.product.pk),
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Auction.objects.count(), 0)

    def test_admin_can_create_auction_for_any_product(self):
        self._auth(self.admin_token)
        before = Product.objects.count()
        response = self.client.post(
            '/api/auctions/',
            self._payload(self.other_product.pk),
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Product.objects.count(), before)
        self.assertEqual(
            Auction.objects.get(pk=response.data['id']).product_id,
            self.other_product.pk,
        )

    def test_duplicate_auction_returns_clean_400(self):
        self._auth(self.seller_token)
        first = self.client.post(
            '/api/auctions/',
            self._payload(self.product.pk),
            format='json',
        )
        self.assertEqual(first.status_code, 201, first.data)
        second = self.client.post(
            '/api/auctions/',
            self._payload(self.product.pk),
            format='json',
        )
        self.assertEqual(second.status_code, 400)
        self.assertIn('product', second.data['error'])
        self.assertIn('already', str(second.data['error']['product']).lower())
        self.assertNotIn('IntegrityError', str(second.data))
        self.assertNotIn('UNIQUE', str(second.data))
        self.assertEqual(Auction.objects.filter(product=self.product).count(), 1)

    def test_missing_product_returns_not_found(self):
        self._auth(self.seller_token)
        response = self.client.post(
            '/api/auctions/',
            self._payload(999999),
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('product', response.data['error'])

    def test_protected_fields_ignored_on_create(self):
        self._auth(self.seller_token)
        response = self.client.post(
            '/api/auctions/',
            self._payload(
                self.product.pk,
                current_highest_bid='9999.00',
                winning_bidder=self.buyer.pk,
                is_paid=True,
                status='CLOSED',
                is_featured=True,
            ),
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        auction = Auction.objects.get(pk=response.data['id'])
        self.assertEqual(str(auction.current_highest_bid), '1000.00')
        self.assertIsNone(auction.winning_bidder)
        self.assertFalse(auction.is_paid)
        self.assertEqual(auction.status, Auction.Status.ACTIVE)
        self.assertFalse(auction.is_featured)
        self.assertNotIn('reserve_price', response.data)

    def test_invalid_end_before_start_rejected(self):
        self._auth(self.seller_token)
        response = self.client.post(
            '/api/auctions/',
            self._payload(
                self.product.pk,
                start_time=self.now.isoformat(),
                end_time=(self.now - timedelta(hours=1)).isoformat(),
            ),
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Auction.objects.count(), 0)

    def test_product_metadata_unchanged_after_create(self):
        self._auth(self.seller_token)
        original_title = self.product.title
        original_description = self.product.description
        original_condition = self.product.condition
        response = self.client.post(
            '/api/auctions/',
            self._payload(self.product.pk),
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.title, original_title)
        self.assertEqual(self.product.description, original_description)
        self.assertEqual(self.product.condition, original_condition)
        self.assertEqual(self.product.seller_id, self.seller.pk)

    def test_legacy_nested_create_still_works_for_seller(self):
        self._auth(self.seller_token)
        before = Product.objects.count()
        response = self.client.post(
            '/api/auctions/',
            {
                'product': {
                    'title': 'Legacy Nested Camera',
                    'description': 'Nested body',
                    'condition': 'USED_GOOD',
                },
                'starting_bid': '2500.00',
                'min_increment': '50.00',
                'start_time': self.now.isoformat(),
                'end_time': (self.now + timedelta(days=1)).isoformat(),
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Product.objects.count(), before + 1)
        auction = Auction.objects.get(pk=response.data['id'])
        self.assertEqual(auction.product.seller_id, self.seller.pk)
        self.assertEqual(auction.product.title, 'Legacy Nested Camera')
        self.assertEqual(str(auction.current_highest_bid), '2500.00')
        self.assertEqual(auction.status, Auction.Status.ACTIVE)

    def test_legacy_nested_create_forbidden_for_buyer(self):
        self._auth(self.buyer_token)
        response = self.client.post(
            '/api/auctions/',
            {
                'product': {
                    'title': 'Buyer Nested',
                    'description': 'Should fail',
                    'condition': 'USED_GOOD',
                },
                'starting_bid': '100.00',
                'start_time': self.now.isoformat(),
                'end_time': (self.now + timedelta(days=1)).isoformat(),
            },
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_list_and_retrieve_keep_nested_product_after_existing_create(self):
        self._auth(self.seller_token)
        created = self.client.post(
            '/api/auctions/',
            self._payload(self.product.pk),
            format='json',
        )
        self.assertEqual(created.status_code, 201, created.data)
        auction_id = created.data['id']

        listed = self.client.get('/api/auctions/')
        self.assertEqual(listed.status_code, 200)
        row = next(item for item in listed.data if item['id'] == auction_id)
        self.assertIsInstance(row['product'], dict)
        self.assertEqual(row['product']['seller'], self.seller.pk)

        detail = self.client.get(f'/api/auctions/{auction_id}/')
        self.assertEqual(detail.status_code, 200)
        self.assertIsInstance(detail.data['product'], dict)
        self.assertEqual(detail.data['product']['id'], self.product.pk)


@override_settings(
    STORAGES={
        'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
        'staticfiles': {
            'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
        },
    }
)
class AuctionMutationFreezeTests(APITestCase):
    """Economic + image mutation freeze after start or bids (BE-A02)."""

    def setUp(self):
        from users.models import UserProfile, ensure_user_profile

        from .models import Bid

        self.Bid = Bid
        self.seller = User.objects.create_user(
            username='freeze_seller',
            email='freeze_seller@test.com',
            password='pass12345',
        )
        self.other = User.objects.create_user(
            username='freeze_other',
            email='freeze_other@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='freeze_buyer',
            email='freeze_buyer@test.com',
            password='pass12345',
        )
        self.admin = User.objects.create_user(
            username='freeze_admin',
            email='freeze_admin@test.com',
            password='pass12345',
            is_staff=True,
        )
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.other, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)
        # Staff/ADMIN is derived from is_staff; profile role stays a public role.
        ensure_user_profile(self.admin, role=UserProfile.Role.SELLER)

        self.seller_token = Token.objects.create(user=self.seller)
        self.other_token = Token.objects.create(user=self.other)
        self.admin_token = Token.objects.create(user=self.admin)
        self.now = timezone.now()

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def _create_auction(
        self,
        *,
        seller=None,
        start_offset=timedelta(days=1),
        end_offset=timedelta(days=2),
        status=Auction.Status.ACTIVE,
        with_bid=False,
    ):
        seller = seller or self.seller
        product = Product.objects.create(
            seller=seller,
            title='Freeze Item',
            description='Desc',
        )
        auction = Auction.objects.create(
            product=product,
            starting_bid=100,
            current_highest_bid=100,
            min_increment=10,
            reserve_price=150,
            start_time=self.now + start_offset,
            end_time=self.now + end_offset,
            status=status,
        )
        if with_bid:
            self.Bid.objects.create(
                auction=auction,
                bidder=self.buyer,
                amount=110,
            )
        return auction

    def _assert_frozen_patch(self, auction, payload):
        self._auth(self.seller_token)
        before = {
            'starting_bid': auction.starting_bid,
            'min_increment': auction.min_increment,
            'reserve_price': auction.reserve_price,
            'start_time': auction.start_time,
            'end_time': auction.end_time,
        }
        response = self.client.patch(
            f'/api/auctions/{auction.pk}/',
            payload,
            format='json',
        )
        self.assertEqual(response.status_code, 400, response.data)
        body = str(response.data).lower()
        self.assertIn('no longer be edited', body)
        auction.refresh_from_db()
        self.assertEqual(auction.starting_bid, before['starting_bid'])
        self.assertEqual(auction.min_increment, before['min_increment'])
        self.assertEqual(auction.reserve_price, before['reserve_price'])
        self.assertEqual(auction.start_time, before['start_time'])
        self.assertEqual(auction.end_time, before['end_time'])

    def test_owner_can_patch_before_start_without_bids(self):
        auction = self._create_auction()
        self._auth(self.seller_token)
        response = self.client.patch(
            f'/api/auctions/{auction.pk}/',
            {
                'starting_bid': '120.00',
                'min_increment': '20.00',
                'reserve_price': '200.00',
                'start_time': (self.now + timedelta(days=1, hours=2)).isoformat(),
                'end_time': (self.now + timedelta(days=3)).isoformat(),
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        auction.refresh_from_db()
        self.assertEqual(str(auction.starting_bid), '120.00')
        self.assertEqual(str(auction.min_increment), '20.00')
        self.assertEqual(str(auction.reserve_price), '200.00')

    def test_product_cannot_be_rebound_on_patch(self):
        auction = self._create_auction()
        other_product = Product.objects.create(
            seller=self.seller,
            title='Other',
            description='x',
        )
        self._auth(self.seller_token)
        response = self.client.patch(
            f'/api/auctions/{auction.pk}/',
            {'product': other_product.pk},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        auction.refresh_from_db()
        self.assertNotEqual(auction.product_id, other_product.pk)

    def test_other_seller_cannot_edit(self):
        auction = self._create_auction()
        self._auth(self.other_token)
        response = self.client.patch(
            f'/api/auctions/{auction.pk}/',
            {'min_increment': '99.00'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_started_auction_rejects_economic_and_timing_edits(self):
        auction = self._create_auction(start_offset=timedelta(hours=-1))
        for payload in (
            {'starting_bid': '999.00'},
            {'min_increment': '99.00'},
            {'reserve_price': '999.00'},
            {'start_time': (self.now + timedelta(days=5)).isoformat()},
            {'end_time': (self.now + timedelta(days=10)).isoformat()},
        ):
            with self.subTest(payload=payload):
                self._assert_frozen_patch(auction, payload)

    def test_future_start_with_bid_rejects_patch(self):
        auction = self._create_auction(
            start_offset=timedelta(days=2),
            end_offset=timedelta(days=3),
            with_bid=True,
        )
        self.assertEqual(self.Bid.objects.filter(auction=auction).count(), 1)
        self._assert_frozen_patch(auction, {'starting_bid': '250.00'})
        self.assertEqual(self.Bid.objects.filter(auction=auction).count(), 1)

    def test_closed_and_cancelled_reject_economic_edit(self):
        closed = self._create_auction(
            start_offset=timedelta(hours=-2),
            end_offset=timedelta(hours=-1),
            status=Auction.Status.CLOSED,
        )
        cancelled = self._create_auction(
            start_offset=timedelta(days=1),
            status=Auction.Status.CANCELLED,
        )
        self._assert_frozen_patch(closed, {'min_increment': '50.00'})
        self._assert_frozen_patch(cancelled, {'min_increment': '50.00'})

    def test_admin_also_cannot_bypass_freeze_via_api(self):
        auction = self._create_auction(start_offset=timedelta(hours=-1))
        self._auth(self.admin_token)
        # Admin is not the product seller — ownership still applies.
        denied = self.client.patch(
            f'/api/auctions/{auction.pk}/',
            {'min_increment': '50.00'},
            format='json',
        )
        self.assertEqual(denied.status_code, 403)

        # Even if staff owns the auction, lifecycle freeze still applies.
        owned = self._create_auction(
            seller=self.admin,
            start_offset=timedelta(hours=-1),
        )
        self._auth(self.admin_token)
        frozen = self.client.patch(
            f'/api/auctions/{owned.pk}/',
            {'min_increment': '50.00'},
            format='json',
        )
        self.assertEqual(frozen.status_code, 400, frozen.data)
        self.assertIn('no longer be edited', str(frozen.data).lower())

    def test_owner_can_upload_image_before_start_without_bids(self):
        auction = self._create_auction()
        self._auth(self.seller_token)
        response = self.client.post(
            f'/api/auctions/{auction.pk}/images/',
            {'images': _make_test_image()},
            format='multipart',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(auction.images.count(), 1)

    def test_image_upload_frozen_when_started_or_has_bids(self):
        started = self._create_auction(start_offset=timedelta(hours=-1))
        with_bids = self._create_auction(
            start_offset=timedelta(days=2),
            with_bid=True,
        )
        closed = self._create_auction(
            start_offset=timedelta(hours=-2),
            status=Auction.Status.CLOSED,
        )
        cancelled = self._create_auction(
            start_offset=timedelta(days=1),
            status=Auction.Status.CANCELLED,
        )
        self._auth(self.seller_token)
        for auction in (started, with_bids, closed, cancelled):
            with self.subTest(auction_id=auction.pk, status=auction.status):
                before = auction.images.count()
                response = self.client.post(
                    f'/api/auctions/{auction.pk}/images/',
                    {'images': _make_test_image()},
                    format='multipart',
                )
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn('images cannot be changed', str(response.data).lower())
                self.assertEqual(auction.images.count(), before)

    def test_other_seller_still_cannot_upload_images(self):
        auction = self._create_auction()
        self._auth(self.other_token)
        response = self.client.post(
            f'/api/auctions/{auction.pk}/images/',
            {'images': _make_test_image()},
            format='multipart',
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(auction.images.count(), 0)

    def test_cancel_transition_still_works_after_freeze_rules(self):
        auction = self._create_auction(start_offset=timedelta(hours=-1))
        self._auth(self.seller_token)
        response = self.client.post(
            f'/api/auctions/{auction.pk}/transition/',
            {'status': 'CANCELLED'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        auction.refresh_from_db()
        self.assertEqual(auction.status, Auction.Status.CANCELLED)


@override_settings(
    STORAGES={
        'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
        'staticfiles': {
            'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
        },
    }
)
class AuctionDeletionIntegrityTests(APITestCase):
    """Auction DELETE must not erase bidder/payment history."""

    def setUp(self):
        from users.models import UserProfile, ensure_user_profile

        self.seller = User.objects.create_user(
            username='del_seller',
            email='del_seller@test.com',
            password='pass12345',
        )
        self.other = User.objects.create_user(
            username='del_other',
            email='del_other@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='del_buyer',
            email='del_buyer@test.com',
            password='pass12345',
        )
        self.admin = User.objects.create_user(
            username='del_admin',
            email='del_admin@test.com',
            password='pass12345',
            is_staff=True,
        )
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.other, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.admin, role=UserProfile.Role.SELLER)
        self.seller_token = Token.objects.create(user=self.seller)
        self.other_token = Token.objects.create(user=self.other)
        self.admin_token = Token.objects.create(user=self.admin)
        self.now = timezone.now()

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def _create_auction(
        self,
        *,
        seller=None,
        start_offset=timedelta(hours=1),
        end_offset=timedelta(days=1),
        status=Auction.Status.ACTIVE,
        with_bid=False,
        with_image=False,
        with_payment=False,
    ):
        from .models import AuctionImage, Bid, Payment

        seller = seller or self.seller
        product = Product.objects.create(
            seller=seller,
            title='Delete Guard Item',
            description='x',
        )
        auction = Auction.objects.create(
            product=product,
            starting_bid=100,
            current_highest_bid=100,
            min_increment=10,
            start_time=self.now + start_offset,
            end_time=self.now + end_offset,
            status=status,
        )
        if with_bid:
            Bid.objects.create(auction=auction, bidder=self.buyer, amount=150)
            auction.current_highest_bid = 150
            auction.save(update_fields=['current_highest_bid'])
        if with_image:
            AuctionImage.objects.create(
                auction=auction,
                image=_make_test_image('delete-guard.png'),
            )
        if with_payment:
            Payment.objects.create(
                auction=auction,
                user=self.buyer,
                amount=150,
                status=Payment.Status.COMPLETED,
                transaction_id=f'tx-del-{auction.pk}',
            )
        return auction

    def _assert_delete_blocked(self, auction, token=None):
        from .models import AuctionImage, Bid, Payment

        token = token or self.seller_token
        before_bids = Bid.objects.filter(auction=auction).count()
        before_images = AuctionImage.objects.filter(auction=auction).count()
        before_payments = Payment.objects.filter(auction=auction).count()
        self._auth(token)
        response = self.client.delete(f'/api/auctions/{auction.pk}/')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(
            response.data.get('error'),
            'This auction cannot be deleted after it has started or received bids.',
        )
        self.assertNotIn('IntegrityError', str(response.data))
        self.assertNotIn('FOREIGN KEY', str(response.data))
        self.assertTrue(Auction.objects.filter(pk=auction.pk).exists())
        self.assertEqual(Bid.objects.filter(auction=auction).count(), before_bids)
        self.assertEqual(
            AuctionImage.objects.filter(auction=auction).count(),
            before_images,
        )
        self.assertEqual(
            Payment.objects.filter(auction=auction).count(),
            before_payments,
        )

    def test_owner_can_delete_prestart_empty_auction(self):
        auction = self._create_auction()
        product_id = auction.product_id
        self._auth(self.seller_token)
        response = self.client.delete(f'/api/auctions/{auction.pk}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Auction.objects.filter(pk=auction.pk).exists())
        self.assertTrue(Product.objects.filter(pk=product_id).exists())

    def test_prestart_auction_with_images_only_can_be_deleted(self):
        """Images alone do not create bidder reliance for MVP."""
        auction = self._create_auction(with_image=True)
        self._auth(self.seller_token)
        response = self.client.delete(f'/api/auctions/{auction.pk}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Auction.objects.filter(pk=auction.pk).exists())

    def test_other_seller_cannot_delete(self):
        auction = self._create_auction()
        self._auth(self.other_token)
        response = self.client.delete(f'/api/auctions/{auction.pk}/')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Auction.objects.filter(pk=auction.pk).exists())

    def test_started_auction_delete_rejected(self):
        auction = self._create_auction(start_offset=timedelta(hours=-1))
        self._assert_delete_blocked(auction)

    def test_auction_with_bid_delete_rejected(self):
        auction = self._create_auction(
            start_offset=timedelta(days=2),
            with_bid=True,
            with_image=True,
        )
        self._assert_delete_blocked(auction)

    def test_closed_auction_delete_rejected(self):
        auction = self._create_auction(
            start_offset=timedelta(hours=-2),
            end_offset=timedelta(hours=-1),
            status=Auction.Status.CLOSED,
            with_bid=True,
            with_image=True,
            with_payment=True,
        )
        self._assert_delete_blocked(auction)

    def test_cancelled_auction_delete_rejected(self):
        auction = self._create_auction(
            start_offset=timedelta(days=1),
            status=Auction.Status.CANCELLED,
            with_image=True,
        )
        self._assert_delete_blocked(auction)

    def test_auction_with_payment_delete_rejected(self):
        auction = self._create_auction(
            start_offset=timedelta(days=2),
            with_payment=True,
        )
        self._assert_delete_blocked(auction)

    def test_admin_owner_cannot_bypass_delete_guard(self):
        auction = self._create_auction(
            seller=self.admin,
            start_offset=timedelta(hours=-1),
            with_bid=True,
            with_image=True,
            with_payment=True,
        )
        self._assert_delete_blocked(auction, token=self.admin_token)
