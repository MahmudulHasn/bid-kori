"""Admin Product/Auction visibility moderation tests (MOD-B01)."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from auctions.models import Auction, Bid, Payment
from auctions.services import BidService, close_all_expired_auctions
from users.models import UserProfile, ensure_user_profile

from .models import Product


class VisibilityModerationTests(APITestCase):
    def setUp(self):
        self.seller = User.objects.create_user(
            username='mod_seller',
            email='mod_seller@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='mod_buyer',
            email='mod_buyer@test.com',
            password='pass12345',
        )
        self.admin = User.objects.create_user(
            username='mod_admin',
            email='mod_admin@test.com',
            password='pass12345',
            is_staff=True,
        )
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.admin, role=UserProfile.Role.SELLER)
        self.seller_token = Token.objects.create(user=self.seller)
        self.buyer_token = Token.objects.create(user=self.buyer)
        self.admin_token = Token.objects.create(user=self.admin)

        self.product = Product.objects.create(
            seller=self.seller,
            title='Moderation Camera',
            description='Visible catalog item',
            condition=Product.Condition.USED_GOOD,
        )
        now = timezone.now()
        self.auction = Auction.objects.create(
            product=self.product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(days=1),
            status=Auction.Status.ACTIVE,
            is_featured=True,
        )

    def _auth(self, token):
        if token is None:
            self.client.credentials()
        else:
            self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_defaults_visible(self):
        self.assertFalse(self.product.is_hidden)
        self.assertEqual(self.product.moderation_reason, '')
        self.assertIsNone(self.product.moderated_at)
        self.assertIsNone(self.product.moderated_by_id)
        self.assertFalse(self.auction.is_hidden)
        self.assertEqual(self.auction.moderation_reason, '')
        self.assertIsNone(self.auction.moderated_at)

    def test_admin_product_hide_restore(self):
        self._auth(self.admin_token)
        hide = self.client.post(
            f'/api/admin/products/{self.product.pk}/hide/',
            {'reason': 'Policy violation'},
            format='json',
        )
        self.assertEqual(hide.status_code, 200, hide.data)
        self.product.refresh_from_db()
        self.assertTrue(self.product.is_hidden)
        self.assertEqual(self.product.moderation_reason, 'Policy violation')
        self.assertIsNotNone(self.product.moderated_at)
        self.assertEqual(self.product.moderated_by_id, self.admin.pk)
        self.assertEqual(self.product.title, 'Moderation Camera')

        restore = self.client.post(
            f'/api/admin/products/{self.product.pk}/restore/',
            format='json',
        )
        self.assertEqual(restore.status_code, 200)
        self.product.refresh_from_db()
        self.assertFalse(self.product.is_hidden)
        self.assertEqual(self.product.moderation_reason, '')
        self.assertIsNone(self.product.moderated_at)
        self.assertIsNone(self.product.moderated_by_id)

    def test_admin_auction_hide_preserves_lifecycle(self):
        Bid.objects.create(
            auction=self.auction,
            bidder=self.buyer,
            amount=Decimal('110.00'),
        )
        self.auction.current_highest_bid = Decimal('110.00')
        self.auction.save(update_fields=['current_highest_bid'])
        before_status = self.auction.status
        before_bid = self.auction.current_highest_bid
        before_featured = self.auction.is_featured

        self._auth(self.admin_token)
        response = self.client.post(
            f'/api/admin/auctions/{self.auction.pk}/hide/',
            {'reason': 'Review'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.auction.refresh_from_db()
        self.assertTrue(self.auction.is_hidden)
        self.assertEqual(self.auction.status, before_status)
        self.assertEqual(self.auction.current_highest_bid, before_bid)
        self.assertEqual(self.auction.is_featured, before_featured)
        self.assertEqual(Bid.objects.filter(auction=self.auction).count(), 1)

        restore = self.client.post(
            f'/api/admin/auctions/{self.auction.pk}/restore/',
            format='json',
        )
        self.assertEqual(restore.status_code, 200)
        self.auction.refresh_from_db()
        self.assertFalse(self.auction.is_hidden)
        self.assertEqual(self.auction.status, before_status)

    def test_permissions_block_non_admin(self):
        for token in (None, self.buyer_token, self.seller_token):
            self._auth(token)
            for path in (
                f'/api/admin/products/{self.product.pk}/hide/',
                f'/api/admin/auctions/{self.auction.pk}/hide/',
            ):
                response = self.client.post(path, {'reason': 'x'}, format='json')
                self.assertIn(response.status_code, (401, 403), path)

    def test_seller_cannot_clear_product_moderation_via_patch(self):
        editable = Product.objects.create(
            seller=self.seller,
            title='Editable Hidden',
            description='d',
            condition=Product.Condition.NEW,
            is_hidden=True,
            moderation_reason='Hidden',
        )
        self._auth(self.seller_token)
        response = self.client.patch(
            f'/api/products/{editable.pk}/',
            {'is_hidden': False, 'moderation_reason': '', 'title': 'Still Mine'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        editable.refresh_from_db()
        self.assertTrue(editable.is_hidden)
        self.assertEqual(editable.moderation_reason, 'Hidden')
        self.assertEqual(editable.title, 'Still Mine')

    def test_seller_cannot_clear_auction_moderation_via_patch(self):
        self.auction.is_hidden = True
        self.auction.moderation_reason = 'Hidden'
        self.auction.save(update_fields=['is_hidden', 'moderation_reason'])
        # Pre-start style edit may be frozen; use an auction not yet started.
        future = Auction.objects.create(
            product=Product.objects.create(
                seller=self.seller,
                title='Future',
                description='d',
                condition=Product.Condition.NEW,
            ),
            starting_bid=Decimal('50.00'),
            current_highest_bid=Decimal('50.00'),
            min_increment=Decimal('5.00'),
            start_time=timezone.now() + timedelta(days=2),
            end_time=timezone.now() + timedelta(days=3),
            status=Auction.Status.ACTIVE,
            is_hidden=True,
            moderation_reason='Hidden',
        )
        self._auth(self.seller_token)
        response = self.client.patch(
            f'/api/auctions/{future.pk}/',
            {'is_hidden': False, 'moderation_reason': ''},
            format='json',
        )
        self.assertIn(response.status_code, (200, 400), response.data)
        future.refresh_from_db()
        self.assertTrue(future.is_hidden)
        self.assertEqual(future.moderation_reason, 'Hidden')

    def test_public_product_list_and_detail_hide(self):
        self._auth(None)
        visible = self.client.get('/api/products/')
        self.assertEqual(visible.status_code, 200)
        ids = [row['id'] for row in visible.data]
        self.assertIn(self.product.pk, ids)

        self.product.is_hidden = True
        self.product.save(update_fields=['is_hidden', 'updated_at'])
        hidden_list = self.client.get('/api/products/')
        self.assertNotIn(self.product.pk, [row['id'] for row in hidden_list.data])
        detail = self.client.get(f'/api/products/{self.product.pk}/')
        self.assertEqual(detail.status_code, 404)

    def test_public_auction_list_active_search_feature_and_detail(self):
        self._auth(None)
        self.assertIn(
            self.auction.pk,
            [row['id'] for row in self.client.get('/api/auctions/').data],
        )
        self.assertIn(
            self.auction.pk,
            [row['id'] for row in self.client.get('/api/auctions/active/').data],
        )
        search = self.client.get('/api/auctions/', {'search': 'Moderation Camera'})
        self.assertIn(self.auction.pk, [row['id'] for row in search.data])

        self.auction.is_hidden = True
        self.auction.save(update_fields=['is_hidden'])
        self.assertNotIn(
            self.auction.pk,
            [row['id'] for row in self.client.get('/api/auctions/').data],
        )
        self.assertNotIn(
            self.auction.pk,
            [row['id'] for row in self.client.get('/api/auctions/active/').data],
        )
        search_hidden = self.client.get(
            '/api/auctions/',
            {'search': 'Moderation Camera'},
        )
        self.assertNotIn(self.auction.pk, [row['id'] for row in search_hidden.data])
        self.assertEqual(
            self.client.get(f'/api/auctions/{self.auction.pk}/').status_code,
            404,
        )

        # Featured does not override hide.
        self.assertTrue(self.auction.is_featured)

        # Product hide also suppresses auction even if auction.is_hidden=False.
        self.auction.is_hidden = False
        self.auction.save(update_fields=['is_hidden'])
        self.product.is_hidden = True
        self.product.save(update_fields=['is_hidden', 'updated_at'])
        self.assertNotIn(
            self.auction.pk,
            [row['id'] for row in self.client.get('/api/auctions/active/').data],
        )
        self.assertEqual(
            self.client.get(f'/api/auctions/{self.auction.pk}/').status_code,
            404,
        )

    def test_restore_auction_still_blocked_when_product_hidden(self):
        self.product.is_hidden = True
        self.product.save(update_fields=['is_hidden', 'updated_at'])
        self.auction.is_hidden = True
        self.auction.save(update_fields=['is_hidden'])
        self._auth(self.admin_token)
        self.client.post(f'/api/admin/auctions/{self.auction.pk}/restore/')
        self.auction.refresh_from_db()
        self.assertFalse(self.auction.is_hidden)
        self._auth(None)
        self.assertEqual(
            self.client.get(f'/api/auctions/{self.auction.pk}/').status_code,
            404,
        )
        self.assertNotIn(
            self.auction.pk,
            [row['id'] for row in self.client.get('/api/auctions/').data],
        )

    def test_seller_and_admin_still_see_hidden(self):
        self.product.is_hidden = True
        self.product.moderation_reason = 'Needs edit'
        self.product.save(
            update_fields=['is_hidden', 'moderation_reason', 'updated_at']
        )
        self.auction.is_hidden = True
        self.auction.save(update_fields=['is_hidden'])

        self._auth(self.seller_token)
        my_list = self.client.get('/api/products/my-listings/')
        self.assertIn(self.product.pk, [row['id'] for row in my_list.data])
        seller_product = self.client.get(f'/api/products/{self.product.pk}/')
        self.assertEqual(seller_product.status_code, 200)
        self.assertTrue(seller_product.data['is_hidden'])
        self.assertEqual(seller_product.data['moderation_reason'], 'Needs edit')
        seller_auction = self.client.get(f'/api/auctions/{self.auction.pk}/')
        self.assertEqual(seller_auction.status_code, 200)

        self._auth(self.admin_token)
        admin_products = self.client.get('/api/products/')
        self.assertIn(self.product.pk, [row['id'] for row in admin_products.data])
        admin_auctions = self.client.get('/api/auctions/')
        self.assertIn(self.auction.pk, [row['id'] for row in admin_auctions.data])

    def test_my_bids_and_won_history_preserved(self):
        BidService.place_bid(self.auction.pk, self.buyer, Decimal('120.00'))
        self.auction.status = Auction.Status.CLOSED
        self.auction.winning_bidder = self.buyer
        self.auction.end_time = timezone.now() - timedelta(minutes=1)
        self.auction.save(
            update_fields=['status', 'winning_bidder', 'end_time']
        )
        self.auction.is_hidden = True
        self.auction.save(update_fields=['is_hidden'])
        self.product.is_hidden = True
        self.product.save(update_fields=['is_hidden', 'updated_at'])

        self._auth(self.buyer_token)
        my_bids = self.client.get('/api/auctions/my-bids/')
        self.assertEqual(my_bids.status_code, 200)
        self.assertTrue(any(row['auction'] == self.auction.pk for row in my_bids.data))

        # Authenticated winner still retrieves detail for history navigation.
        won_detail = self.client.get(f'/api/auctions/{self.auction.pk}/')
        self.assertEqual(won_detail.status_code, 200)
        # Buyer list includes participant auctions even when hidden.
        buyer_list = self.client.get('/api/auctions/')
        self.assertIn(self.auction.pk, [row['id'] for row in buyer_list.data])

    def test_bid_rejected_while_hidden(self):
        self.auction.is_hidden = True
        self.auction.save(update_fields=['is_hidden'])
        before = Bid.objects.count()
        self._auth(self.buyer_token)
        response = self.client.post(
            f'/api/auctions/{self.auction.pk}/place-bid/',
            {'amount': '150.00'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Bid.objects.count(), before)

        self.auction.is_hidden = False
        self.auction.save(update_fields=['is_hidden'])
        self.product.is_hidden = True
        self.product.save(update_fields=['is_hidden', 'updated_at'])
        response2 = self.client.post(
            f'/api/auctions/{self.auction.pk}/place-bid/',
            {'amount': '150.00'},
            format='json',
        )
        self.assertEqual(response2.status_code, 400)
        self.assertEqual(Bid.objects.count(), before)

    def test_restore_allows_bids_when_both_visible(self):
        self.auction.is_hidden = True
        self.auction.save(update_fields=['is_hidden'])
        self._auth(self.admin_token)
        self.client.post(f'/api/admin/auctions/{self.auction.pk}/restore/')
        bid = BidService.place_bid(self.auction.pk, self.buyer, Decimal('130.00'))
        self.assertEqual(bid.amount, Decimal('130.00'))

    def test_product_hide_does_not_cancel_auction(self):
        self._auth(self.admin_token)
        self.client.post(
            f'/api/admin/products/{self.product.pk}/hide/',
            {'reason': 'x'},
            format='json',
        )
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.ACTIVE)

    def test_auto_close_hidden_auction(self):
        self.auction.is_hidden = True
        self.auction.end_time = timezone.now() - timedelta(seconds=5)
        self.auction.save(update_fields=['is_hidden', 'end_time'])
        Bid.objects.create(
            auction=self.auction,
            bidder=self.buyer,
            amount=Decimal('125.00'),
        )
        self.auction.current_highest_bid = Decimal('125.00')
        self.auction.save(update_fields=['current_highest_bid'])
        result = close_all_expired_auctions()
        self.assertGreaterEqual(result.get('closed', 0), 1)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CLOSED)
        self.assertTrue(self.auction.is_hidden)
        self.assertEqual(self.auction.winning_bidder_id, self.buyer.pk)

    def test_hide_closed_preserves_payment(self):
        self.auction.status = Auction.Status.CLOSED
        self.auction.winning_bidder = self.buyer
        self.auction.is_paid = True
        self.auction.save(update_fields=['status', 'winning_bidder', 'is_paid'])
        Payment.objects.create(
            auction=self.auction,
            user=self.buyer,
            amount=Decimal('100.00'),
            status=Payment.Status.COMPLETED,
            transaction_id='tx-mod-1',
        )
        self._auth(self.admin_token)
        self.client.post(
            f'/api/admin/auctions/{self.auction.pk}/hide/',
            {'reason': 'archive'},
            format='json',
        )
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.CLOSED)
        self.assertTrue(self.auction.is_paid)
        self.assertEqual(self.auction.winning_bidder_id, self.buyer.pk)
        self.assertEqual(Payment.objects.filter(auction=self.auction).count(), 1)

    def test_hide_idempotent_updates_reason(self):
        self._auth(self.admin_token)
        first = self.client.post(
            f'/api/admin/products/{self.product.pk}/hide/',
            {'reason': 'One'},
            format='json',
        )
        second = self.client.post(
            f'/api/admin/products/{self.product.pk}/hide/',
            {'reason': 'Two'},
            format='json',
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.product.refresh_from_db()
        self.assertTrue(self.product.is_hidden)
        self.assertEqual(self.product.moderation_reason, 'Two')

    def test_anonymous_product_detail_omits_moderation_reason_when_visible(self):
        self.product.moderation_reason = 'Internal note'
        self.product.moderated_at = timezone.now()
        self.product.save(update_fields=['moderation_reason', 'moderated_at'])
        self._auth(None)
        response = self.client.get(f'/api/products/{self.product.pk}/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn('moderation_reason', response.data)
        self.assertNotIn('moderated_at', response.data)
        self.assertIn('is_hidden', response.data)
        self.assertFalse(response.data['is_hidden'])

    def test_featured_hidden_auction_excluded_from_public_list(self):
        self.auction.is_featured = True
        self.auction.is_hidden = True
        self.auction.save(update_fields=['is_featured', 'is_hidden'])
        self._auth(None)
        ids = [row['id'] for row in self.client.get('/api/auctions/').data]
        self.assertNotIn(self.auction.pk, ids)
        active_ids = [
            row['id'] for row in self.client.get('/api/auctions/active/').data
        ]
        self.assertNotIn(self.auction.pk, active_ids)
        detail = self.client.get(f'/api/auctions/{self.auction.pk}/')
        self.assertEqual(detail.status_code, 404)
