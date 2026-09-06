from datetime import timedelta
from io import BytesIO

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from auctions.models import Auction, AuctionImage, Bid, Payment
from users.models import UserProfile, ensure_user_profile

from .models import Category, Product, ProductImage
from .mutation_policy import (
    PRODUCT_EDIT_FROZEN_MESSAGE,
    PRODUCT_IMAGE_FROZEN_MESSAGE,
)


class ProductAuthorizationTests(APITestCase):
    """Object-level authorization for product catalog endpoints."""

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
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@test.com',
            password='pass12345',
        )
        self.admin = User.objects.create_user(
            username='admin',
            email='admin@test.com',
            password='pass12345',
            is_staff=True,
        )
        ensure_user_profile(self.owner, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.other, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)
        ensure_user_profile(self.admin, role=UserProfile.Role.SELLER)
        self.owner_token = Token.objects.create(user=self.owner)
        self.other_token = Token.objects.create(user=self.other)
        self.buyer_token = Token.objects.create(user=self.buyer)
        self.admin_token = Token.objects.create(user=self.admin)
        self.category = Category.objects.create(name='Gadgets', slug='gadgets')
        self.other_category = Category.objects.create(name='Art', slug='art')

    def _create_product(self, seller=None, title='Test Item', **extra):
        defaults = {
            'seller': seller or self.owner,
            'title': title,
            'description': 'Desc',
            'condition': Product.Condition.USED_GOOD,
            'category': self.category,
        }
        defaults.update(extra)
        return Product.objects.create(**defaults)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def _create_auction(self, product, *, start_offset=None, status=None, **extra):
        now = timezone.now()
        start_offset = timedelta(hours=1) if start_offset is None else start_offset
        defaults = {
            'product': product,
            'starting_bid': 100,
            'current_highest_bid': 100,
            'min_increment': 10,
            'start_time': now + start_offset,
            'end_time': now + timedelta(days=2),
            'status': status or Auction.Status.ACTIVE,
        }
        defaults.update(extra)
        return Auction.objects.create(**defaults)

    def test_owner_can_update_own_product(self):
        product = self._create_product()
        self._auth(self.owner_token)
        response = self.client.patch(
            f'/api/products/{product.pk}/',
            {'title': 'Updated title'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        product.refresh_from_db()
        self.assertEqual(product.title, 'Updated title')

    def test_owner_can_put_standalone_product(self):
        product = self._create_product()
        self._auth(self.owner_token)
        response = self.client.put(
            f'/api/products/{product.pk}/',
            {
                'title': 'Put title',
                'description': 'Put description',
                'condition': Product.Condition.NEW,
                'category': self.other_category.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        product.refresh_from_db()
        self.assertEqual(product.title, 'Put title')
        self.assertEqual(product.description, 'Put description')
        self.assertEqual(product.condition, Product.Condition.NEW)
        self.assertEqual(product.category_id, self.other_category.pk)

    def test_non_owner_cannot_update_product(self):
        product = self._create_product()
        self._auth(self.other_token)
        response = self.client.patch(
            f'/api/products/{product.pk}/',
            {'title': 'Hijacked title'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        product.refresh_from_db()
        self.assertEqual(product.title, 'Test Item')

    def test_prestart_linked_product_remains_editable(self):
        product = self._create_product(
            title='Future listing',
            description='Original',
            condition=Product.Condition.USED_GOOD,
        )
        self._create_auction(product, start_offset=timedelta(days=1))
        self._auth(self.owner_token)
        response = self.client.patch(
            f'/api/products/{product.pk}/',
            {
                'title': 'Updated future listing',
                'description': 'Revised before start',
                'condition': Product.Condition.NEW,
                'category': self.other_category.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        product.refresh_from_db()
        self.assertEqual(product.title, 'Updated future listing')
        self.assertEqual(product.description, 'Revised before start')
        self.assertEqual(product.condition, Product.Condition.NEW)
        self.assertEqual(product.category_id, self.other_category.pk)

    def test_started_auction_freezes_product_patch(self):
        product = self._create_product(
            title='Live item',
            description='Live desc',
            condition=Product.Condition.USED_GOOD,
        )
        self._create_auction(product, start_offset=timedelta(hours=-1))
        snapshot = {
            'title': product.title,
            'description': product.description,
            'condition': product.condition,
            'category_id': product.category_id,
        }
        self._auth(self.owner_token)
        response = self.client.patch(
            f'/api/products/{product.pk}/',
            {
                'title': 'Bait and switch',
                'description': 'Changed after start',
                'condition': Product.Condition.FAIR,
                'category': self.other_category.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('error'), PRODUCT_EDIT_FROZEN_MESSAGE)
        product.refresh_from_db()
        self.assertEqual(product.title, snapshot['title'])
        self.assertEqual(product.description, snapshot['description'])
        self.assertEqual(product.condition, snapshot['condition'])
        self.assertEqual(product.category_id, snapshot['category_id'])

    def test_started_auction_put_cannot_bypass_freeze(self):
        product = self._create_product(title='Live put')
        self._create_auction(product, start_offset=timedelta(hours=-1))
        self._auth(self.owner_token)
        response = self.client.put(
            f'/api/products/{product.pk}/',
            {
                'title': 'Put after start',
                'description': 'No',
                'condition': Product.Condition.NEW,
                'category': self.other_category.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('error'), PRODUCT_EDIT_FROZEN_MESSAGE)
        product.refresh_from_db()
        self.assertEqual(product.title, 'Live put')

    def test_bid_freezes_product_even_with_future_start(self):
        product = self._create_product(
            title='Bid locked',
            description='Before bid',
            condition=Product.Condition.USED_LIKE_NEW,
        )
        auction = self._create_auction(product, start_offset=timedelta(days=3))
        Bid.objects.create(auction=auction, bidder=self.buyer, amount=150)
        bid_count = Bid.objects.filter(auction=auction).count()
        self._auth(self.owner_token)
        response = self.client.patch(
            f'/api/products/{product.pk}/',
            {
                'title': 'Should not change',
                'description': 'Should not change',
                'condition': Product.Condition.FAIR,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('error'), PRODUCT_EDIT_FROZEN_MESSAGE)
        product.refresh_from_db()
        self.assertEqual(product.title, 'Bid locked')
        self.assertEqual(product.description, 'Before bid')
        self.assertEqual(product.condition, Product.Condition.USED_LIKE_NEW)
        self.assertEqual(Bid.objects.filter(auction=auction).count(), bid_count)

    def test_closed_linked_product_edit_rejected(self):
        product = self._create_product(title='Closed listing')
        self._create_auction(
            product,
            start_offset=timedelta(days=-2),
            status=Auction.Status.CLOSED,
            end_time=timezone.now() - timedelta(days=1),
        )
        self._auth(self.owner_token)
        response = self.client.patch(
            f'/api/products/{product.pk}/',
            {'title': 'Rewrite history'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        product.refresh_from_db()
        self.assertEqual(product.title, 'Closed listing')

    def test_cancelled_linked_product_edit_rejected(self):
        product = self._create_product(title='Cancelled listing')
        self._create_auction(
            product,
            start_offset=timedelta(days=1),
            status=Auction.Status.CANCELLED,
        )
        self._auth(self.owner_token)
        response = self.client.patch(
            f'/api/products/{product.pk}/',
            {'title': 'Rewrite cancelled'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        product.refresh_from_db()
        self.assertEqual(product.title, 'Cancelled listing')

    def test_admin_cannot_bypass_product_freeze_via_api(self):
        product = self._create_product(
            seller=self.admin,
            title='Admin owned live',
        )
        self._create_auction(product, start_offset=timedelta(hours=-1))
        self._auth(self.admin_token)
        response = self.client.patch(
            f'/api/products/{product.pk}/',
            {'title': 'Staff bypass attempt'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('error'), PRODUCT_EDIT_FROZEN_MESSAGE)
        product.refresh_from_db()
        self.assertEqual(product.title, 'Admin owned live')

    def test_admin_may_edit_own_prestart_linked_product(self):
        product = self._create_product(
            seller=self.admin,
            title='Admin prestart',
        )
        self._create_auction(product, start_offset=timedelta(days=1))
        self._auth(self.admin_token)
        response = self.client.patch(
            f'/api/products/{product.pk}/',
            {'title': 'Admin prestart updated'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        product.refresh_from_db()
        self.assertEqual(product.title, 'Admin prestart updated')

    def test_seller_can_create_product(self):
        self._auth(self.owner_token)
        response = self.client.post(
            '/api/products/',
            {
                'title': 'New catalog item',
                'description': 'Created via API',
                'condition': 'USED_GOOD',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        product = Product.objects.get(pk=response.data['id'])
        self.assertEqual(product.seller, self.owner)
        self.assertEqual(product.title, 'New catalog item')
        self.assertNotIn('starting_price', response.data)
        self.assertNotIn('starting_bid', response.data)

    def test_buyer_cannot_create_product(self):
        self._auth(self.buyer_token)
        before = Product.objects.count()
        response = self.client.post(
            '/api/products/',
            {
                'title': 'Buyer should fail',
                'description': 'No',
                'condition': 'USED_GOOD',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn('error', response.data)
        self.assertEqual(Product.objects.count(), before)

    def test_admin_can_create_product(self):
        self._auth(self.admin_token)
        response = self.client.post(
            '/api/products/',
            {
                'title': 'Admin catalog item',
                'description': 'Created by staff',
                'condition': 'NEW',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        product = Product.objects.get(pk=response.data['id'])
        self.assertEqual(product.seller, self.admin)

    def test_client_cannot_assign_arbitrary_seller(self):
        self._auth(self.owner_token)
        response = self.client.post(
            '/api/products/',
            {
                'title': 'Hijack seller',
                'description': 'x',
                'condition': 'NEW',
                'seller': self.other.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        product = Product.objects.get(pk=response.data['id'])
        self.assertEqual(product.seller, self.owner)
        self.assertNotEqual(product.seller_id, self.other.pk)

    def test_product_create_does_not_require_or_store_starting_price(self):
        """Unknown pricing fields are ignored; Product has no price columns."""
        self._auth(self.owner_token)
        response = self.client.post(
            '/api/products/',
            {
                'title': 'No-price catalog item',
                'description': 'Pricing belongs on auctions',
                'condition': 'USED_GOOD',
                'starting_price': '1500.00',
                'starting_bid': '1500.00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        product = Product.objects.get(pk=response.data['id'])
        self.assertEqual(product.title, 'No-price catalog item')
        self.assertFalse(hasattr(product, 'starting_price'))
        self.assertNotIn('starting_price', response.data)
        self.assertNotIn('starting_bid', response.data)

    def test_unauthenticated_cannot_create_product(self):
        response = self.client.post(
            '/api/products/',
            {
                'title': 'Blocked item',
                'description': 'Should not be created',
                'condition': 'USED_GOOD',
            },
            format='json',
        )
        self.assertIn(response.status_code, (401, 403))

    def test_owner_can_delete_product_without_auction(self):
        product = self._create_product()
        self._auth(self.owner_token)
        response = self.client.delete(f'/api/products/{product.pk}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Product.objects.filter(pk=product.pk).exists())

    def test_non_owner_cannot_delete_product(self):
        product = self._create_product()
        self._auth(self.other_token)
        response = self.client.delete(f'/api/products/{product.pk}/')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Product.objects.filter(pk=product.pk).exists())

    def test_product_with_auction_cannot_be_deleted(self):
        product = self._create_product()
        now = timezone.now()
        auction = Auction.objects.create(
            product=product,
            starting_bid=100,
            current_highest_bid=100,
            min_increment=10,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(days=1),
            status=Auction.Status.ACTIVE,
        )
        bidder = self.buyer
        Bid.objects.create(auction=auction, bidder=bidder, amount=150)
        from io import BytesIO

        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image

        buffer = BytesIO()
        Image.new('RGB', (10, 10), color='red').save(buffer, format='PNG')
        buffer.seek(0)
        AuctionImage.objects.create(
            auction=auction,
            image=SimpleUploadedFile(
                'x.png',
                buffer.read(),
                content_type='image/png',
            ),
        )
        Payment.objects.create(
            auction=auction,
            user=bidder,
            amount=150,
            status=Payment.Status.COMPLETED,
            transaction_id='tx-product-delete-guard',
        )

        self._auth(self.owner_token)
        response = self.client.delete(f'/api/products/{product.pk}/')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data.get('error'),
            'This product cannot be deleted because it is linked to an auction.',
        )
        self.assertNotIn('IntegrityError', str(response.data))
        self.assertNotIn('FOREIGN KEY', str(response.data))

        self.assertTrue(Product.objects.filter(pk=product.pk).exists())
        self.assertTrue(Auction.objects.filter(pk=auction.pk).exists())
        self.assertTrue(Bid.objects.filter(auction=auction).exists())
        self.assertTrue(AuctionImage.objects.filter(auction=auction).exists())
        self.assertTrue(Payment.objects.filter(auction=auction).exists())

    def test_admin_cannot_delete_product_with_auction(self):
        product = self._create_product(seller=self.admin)
        now = timezone.now()
        Auction.objects.create(
            product=product,
            starting_bid=100,
            current_highest_bid=100,
            min_increment=10,
            start_time=now + timedelta(hours=1),
            end_time=now + timedelta(days=1),
            status=Auction.Status.ACTIVE,
        )
        self._auth(self.admin_token)
        response = self.client.delete(f'/api/products/{product.pk}/')
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Product.objects.filter(pk=product.pk).exists())
        self.assertTrue(Auction.objects.filter(product=product).exists())

    def test_unauthenticated_can_list_products(self):
        self._create_product()
        response = self.client.get('/api/products/')
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data), 1)

    def test_unauthenticated_can_retrieve_product(self):
        product = self._create_product()
        response = self.client.get(f'/api/products/{product.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], product.pk)

    def test_my_listings_returns_only_owner_products(self):
        own_product = self._create_product(seller=self.owner, title='Mine')
        self._create_product(seller=self.other, title='Theirs')
        self._auth(self.owner_token)
        response = self.client.get('/api/products/my-listings/')
        self.assertEqual(response.status_code, 200)
        ids = {item['id'] for item in response.data}
        self.assertEqual(ids, {own_product.pk})

    def test_my_listings_requires_authentication(self):
        response = self.client.get('/api/products/my-listings/')
        self.assertIn(response.status_code, (401, 403))

    def test_product_list_is_public_catalog_not_scoped_to_caller(self):
        own_product = self._create_product(seller=self.owner, title='Mine')
        other_product = self._create_product(seller=self.other, title='Theirs')
        self._auth(self.owner_token)
        response = self.client.get('/api/products/')
        self.assertEqual(response.status_code, 200)
        ids = {item['id'] for item in response.data}
        self.assertEqual(ids, {own_product.pk, other_product.pk})
        self.assertIsInstance(response.data, list)


class ProductAuctionContractTests(APITestCase):
    """Product vs Auction pricing field ownership."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='seller',
            email='seller@test.com',
            password='pass12345',
        )
        ensure_user_profile(self.user, role=UserProfile.Role.SELLER)
        self.token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    def test_auction_create_uses_starting_bid_not_product_price(self):
        now = timezone.now()
        response = self.client.post(
            '/api/auctions/',
            {
                'product': {
                    'title': 'Contract Camera',
                    'description': 'Nested product',
                    'condition': 'USED_GOOD',
                },
                'starting_bid': '2500.00',
                'min_increment': '50.00',
                'start_time': now.isoformat(),
                'end_time': (now + timedelta(days=1)).isoformat(),
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn('starting_bid', response.data)
        self.assertNotIn('starting_price', response.data)
        self.assertEqual(str(response.data['starting_bid']), '2500.00')
        self.assertEqual(
            str(response.data['current_highest_bid']),
            '2500.00',
        )
        self.assertNotIn('starting_price', response.data.get('product', {}))
        self.assertNotIn('starting_bid', response.data.get('product', {}))


class CategoryCatalogTests(APITestCase):
    """Read-only Category REST catalog (CAT-B01)."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username='cat_seller',
            email='cat_seller@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='cat_buyer',
            email='cat_buyer@test.com',
            password='pass12345',
        )
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)
        self.seller_token = Token.objects.create(user=self.seller)
        self.buyer_token = Token.objects.create(user=self.buyer)
        # Create out of name order to assert deterministic sorting.
        self.zeta = Category.objects.create(name='Zeta', slug='zeta')
        self.alpha = Category.objects.create(name='Alpha', slug='alpha')
        self.mid = Category.objects.create(name='Mid', slug='mid')

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_unauthenticated_can_list_categories(self):
        response = self.client.get('/api/categories/')
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 3)

    def test_buyer_and_seller_can_list_categories(self):
        self._auth(self.buyer_token)
        buyer_response = self.client.get('/api/categories/')
        self.assertEqual(buyer_response.status_code, 200)

        self._auth(self.seller_token)
        seller_response = self.client.get('/api/categories/')
        self.assertEqual(seller_response.status_code, 200)

    def test_category_list_is_ordered_by_name_then_id(self):
        response = self.client.get('/api/categories/')
        self.assertEqual(response.status_code, 200)
        names = [row['name'] for row in response.data]
        self.assertEqual(names, ['Alpha', 'Mid', 'Zeta'])

    def test_category_list_exposes_only_safe_fields(self):
        response = self.client.get('/api/categories/')
        self.assertEqual(response.status_code, 200)
        for row in response.data:
            self.assertEqual(set(row.keys()), {'id', 'name', 'slug'})

    def test_category_detail_is_public(self):
        response = self.client.get(f'/api/categories/{self.alpha.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], self.alpha.pk)
        self.assertEqual(response.data['name'], 'Alpha')
        self.assertEqual(response.data['slug'], 'alpha')

    def test_category_mutations_are_unavailable(self):
        payload = {'name': 'Hacked', 'slug': 'hacked'}
        cases = [
            ('post', '/api/categories/', payload),
            ('put', f'/api/categories/{self.alpha.pk}/', payload),
            ('patch', f'/api/categories/{self.alpha.pk}/', {'name': 'X'}),
            ('delete', f'/api/categories/{self.alpha.pk}/', None),
        ]
        actors = [None, self.buyer_token, self.seller_token]
        before = Category.objects.count()
        for token in actors:
            if token is None:
                self.client.credentials()
            else:
                self._auth(token)
            for method, url, body in cases:
                request = getattr(self.client, method)
                response = (
                    request(url, body, format='json')
                    if body is not None
                    else request(url)
                )
                self.assertIn(
                    response.status_code,
                    (401, 403, 405),
                    msg=f'{method} {url} as {token} -> {response.status_code}',
                )
        self.assertEqual(Category.objects.count(), before)
        self.alpha.refresh_from_db()
        self.assertEqual(self.alpha.name, 'Alpha')


class ProductCategoryContractTests(APITestCase):
    """Product create/update category write contract + freeze/ownership."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username='pc_owner',
            email='pc_owner@test.com',
            password='pass12345',
        )
        self.other = User.objects.create_user(
            username='pc_other',
            email='pc_other@test.com',
            password='pass12345',
        )
        self.buyer = User.objects.create_user(
            username='pc_buyer',
            email='pc_buyer@test.com',
            password='pass12345',
        )
        ensure_user_profile(self.owner, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.other, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)
        self.owner_token = Token.objects.create(user=self.owner)
        self.other_token = Token.objects.create(user=self.other)
        self.buyer_token = Token.objects.create(user=self.buyer)
        self.electronics = Category.objects.create(
            name='Electronics',
            slug='electronics',
        )
        self.fashion = Category.objects.create(name='Fashion', slug='fashion')

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_seller_creates_product_with_valid_category(self):
        self._auth(self.owner_token)
        response = self.client.post(
            '/api/products/',
            {
                'title': 'Categorized item',
                'description': 'Has category',
                'condition': 'USED_GOOD',
                'category': self.electronics.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['category'], self.electronics.pk)
        product = Product.objects.get(pk=response.data['id'])
        self.assertEqual(product.category_id, self.electronics.pk)

    def test_invalid_category_id_returns_400_and_skips_create(self):
        self._auth(self.owner_token)
        before = Product.objects.count()
        response = self.client.post(
            '/api/products/',
            {
                'title': 'Bad category',
                'description': 'Should fail',
                'condition': 'USED_GOOD',
                'category': 999999,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        error_payload = response.data.get('error', response.data)
        self.assertIn('category', error_payload)
        self.assertEqual(Product.objects.count(), before)

    def test_buyer_cannot_create_product_even_with_valid_category(self):
        self._auth(self.buyer_token)
        before = Product.objects.count()
        response = self.client.post(
            '/api/products/',
            {
                'title': 'Buyer categorized',
                'description': 'No',
                'condition': 'NEW',
                'category': self.electronics.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Product.objects.count(), before)

    def test_seller_can_change_category_on_standalone_product(self):
        product = Product.objects.create(
            seller=self.owner,
            title='Standalone',
            description='Editable',
            condition=Product.Condition.USED_GOOD,
            category=self.electronics,
        )
        self._auth(self.owner_token)
        response = self.client.patch(
            f'/api/products/{product.pk}/',
            {'category': self.fashion.pk},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        product.refresh_from_db()
        self.assertEqual(product.category_id, self.fashion.pk)
        self.assertEqual(response.data['category'], self.fashion.pk)

    def test_frozen_product_rejects_category_patch(self):
        product = Product.objects.create(
            seller=self.owner,
            title='Live catalog',
            description='Frozen',
            condition=Product.Condition.USED_GOOD,
            category=self.electronics,
        )
        now = timezone.now()
        Auction.objects.create(
            product=product,
            starting_bid=100,
            current_highest_bid=100,
            min_increment=10,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(days=1),
            status=Auction.Status.ACTIVE,
        )
        self._auth(self.owner_token)
        response = self.client.patch(
            f'/api/products/{product.pk}/',
            {'category': self.fashion.pk},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('error'), PRODUCT_EDIT_FROZEN_MESSAGE)
        product.refresh_from_db()
        self.assertEqual(product.category_id, self.electronics.pk)

    def test_seller_cannot_change_another_sellers_product_category(self):
        product = Product.objects.create(
            seller=self.owner,
            title='Owned by owner',
            description='x',
            condition=Product.Condition.USED_GOOD,
            category=self.electronics,
        )
        self._auth(self.other_token)
        response = self.client.patch(
            f'/api/products/{product.pk}/',
            {'category': self.fashion.pk},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        product.refresh_from_db()
        self.assertEqual(product.category_id, self.electronics.pk)


class CategoryBootstrapTests(APITestCase):
    """Idempotent MVP category bootstrap."""

    def test_ensure_mvp_categories_is_idempotent(self):
        from products.category_bootstrap import (
            MVP_CATEGORY_NAMES,
            ensure_mvp_categories,
        )

        created_first, existing_first = ensure_mvp_categories()
        self.assertEqual(len(created_first), len(MVP_CATEGORY_NAMES))
        self.assertEqual(len(existing_first), 0)
        self.assertEqual(Category.objects.count(), len(MVP_CATEGORY_NAMES))

        created_second, existing_second = ensure_mvp_categories()
        self.assertEqual(len(created_second), 0)
        self.assertEqual(len(existing_second), len(MVP_CATEGORY_NAMES))
        self.assertEqual(Category.objects.count(), len(MVP_CATEGORY_NAMES))

        names = set(Category.objects.values_list('name', flat=True))
        self.assertEqual(names, set(MVP_CATEGORY_NAMES))


def _make_product_test_image(name='test.png', *, size=(10, 10), fmt='PNG'):
    buffer = BytesIO()
    Image.new('RGB', size, color='red').save(buffer, format=fmt)
    buffer.seek(0)
    content_type = {
        'PNG': 'image/png',
        'JPEG': 'image/jpeg',
        'WEBP': 'image/webp',
        'GIF': 'image/gif',
    }.get(fmt, 'application/octet-stream')
    return SimpleUploadedFile(name, buffer.read(), content_type=content_type)


class ProductImageAPITests(APITestCase):
    """ProductImage GET/POST/DELETE foundation (IMG-B01)."""

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
        self.buyer = User.objects.create_user(
            username='img_buyer',
            email='img_buyer@test.com',
            password='pass12345',
        )
        ensure_user_profile(self.owner, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.other, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)
        self.owner_token = Token.objects.create(user=self.owner)
        self.other_token = Token.objects.create(user=self.other)
        self.buyer_token = Token.objects.create(user=self.buyer)
        self.product = Product.objects.create(
            seller=self.owner,
            title='Catalog camera',
            description='Desc',
            condition=Product.Condition.USED_GOOD,
        )

    def _auth(self, token):
        if token is None:
            self.client.credentials()
        else:
            self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def _upload(self, *, token, files, product=None):
        self._auth(token)
        target = product or self.product
        payload = {}
        if files is not None:
            payload['images'] = files
        return self.client.post(
            f'/api/products/{target.pk}/images/',
            payload,
            format='multipart',
        )

    def test_product_image_belongs_to_product_and_orders_deterministically(self):
        first = ProductImage.objects.create(
            product=self.product,
            image=_make_product_test_image('a.png'),
        )
        second = ProductImage.objects.create(
            product=self.product,
            image=_make_product_test_image('b.png'),
        )
        ordered = list(
            ProductImage.objects.filter(product=self.product).values_list(
                'id',
                flat=True,
            )
        )
        self.assertEqual(ordered, [first.pk, second.pk])
        self.assertEqual(first.product_id, self.product.pk)

    def test_product_delete_cascades_product_image_rows(self):
        image = ProductImage.objects.create(
            product=self.product,
            image=_make_product_test_image('cascade.png'),
        )
        image_id = image.pk
        self._auth(self.owner_token)
        response = self.client.delete(f'/api/products/{self.product.pk}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(ProductImage.objects.filter(pk=image_id).exists())

    def test_public_get_images_ordered_with_expected_fields(self):
        ProductImage.objects.create(
            product=self.product,
            image=_make_product_test_image('one.png'),
        )
        ProductImage.objects.create(
            product=self.product,
            image=_make_product_test_image('two.png'),
        )
        response = self.client.get(f'/api/products/{self.product.pk}/images/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(set(response.data[0].keys()), {'id', 'image', 'uploaded_at'})
        self.assertLessEqual(
            response.data[0]['uploaded_at'],
            response.data[1]['uploaded_at'],
        )

    def test_owner_upload_persists_and_nested_product_serializer_exposes_image(self):
        response = self._upload(
            token=self.owner_token,
            files=_make_product_test_image(),
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.product.images.count(), 1)
        detail = self.client.get(f'/api/products/{self.product.pk}/')
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(len(detail.data['images']), 1)
        self.assertIn('image', detail.data['images'][0])

    def test_owner_multi_upload_persists_all(self):
        files = [
            _make_product_test_image('one.png'),
            _make_product_test_image('two.png'),
        ]
        response = self._upload(token=self.owner_token, files=files)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(self.product.images.count(), 2)

    def test_buyer_cannot_upload(self):
        response = self._upload(
            token=self.buyer_token,
            files=_make_product_test_image(),
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.product.images.count(), 0)

    def test_other_seller_cannot_upload(self):
        response = self._upload(
            token=self.other_token,
            files=_make_product_test_image(),
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.product.images.count(), 0)

    def test_unauthenticated_upload_rejected(self):
        response = self._upload(token=None, files=_make_product_test_image())
        self.assertIn(response.status_code, (401, 403))
        self.assertEqual(self.product.images.count(), 0)

    def test_invalid_image_bytes_rejected(self):
        fake = SimpleUploadedFile(
            'fake.png',
            b'this is not an image payload',
            content_type='image/png',
        )
        response = self._upload(token=self.owner_token, files=fake)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.product.images.count(), 0)

    def test_supported_formats_accepted(self):
        for fmt, name in (
            ('JPEG', 'a.jpg'),
            ('PNG', 'b.png'),
            ('WEBP', 'c.webp'),
            ('GIF', 'd.gif'),
        ):
            with self.subTest(fmt=fmt):
                ProductImage.objects.filter(product=self.product).delete()
                response = self._upload(
                    token=self.owner_token,
                    files=_make_product_test_image(name, fmt=fmt),
                )
                self.assertEqual(response.status_code, 201, response.data)

    @override_settings(PRODUCT_IMAGE_MAX_BYTES=200)
    def test_oversized_file_rejected(self):
        buffer = BytesIO()
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
        self.assertEqual(self.product.images.count(), 0)

    @override_settings(
        PRODUCT_IMAGE_MAX_WIDTH=50,
        PRODUCT_IMAGE_MAX_HEIGHT=50,
    )
    def test_oversized_dimensions_rejected(self):
        response = self._upload(
            token=self.owner_token,
            files=_make_product_test_image('large.png', size=(80, 80)),
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.product.images.count(), 0)

    @override_settings(PRODUCT_IMAGE_MAX_COUNT=5, PRODUCT_IMAGE_MAX_PER_REQUEST=5)
    def test_total_quota_rejects_when_full(self):
        for i in range(5):
            ProductImage.objects.create(
                product=self.product,
                image=_make_product_test_image(f'full-{i}.png'),
            )
        response = self._upload(
            token=self.owner_token,
            files=_make_product_test_image('overflow.png'),
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.product.images.count(), 5)

    @override_settings(PRODUCT_IMAGE_MAX_COUNT=5, PRODUCT_IMAGE_MAX_PER_REQUEST=5)
    def test_batch_overflow_is_all_or_nothing(self):
        for i in range(3):
            ProductImage.objects.create(
                product=self.product,
                image=_make_product_test_image(f'exist-{i}.png'),
            )
        files = [
            _make_product_test_image('n1.png'),
            _make_product_test_image('n2.png'),
            _make_product_test_image('n3.png'),
        ]
        response = self._upload(token=self.owner_token, files=files)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.product.images.count(), 3)

    @override_settings(PRODUCT_IMAGE_MAX_PER_REQUEST=5)
    def test_per_request_limit_rejected(self):
        files = [
            _make_product_test_image(f'r{i}.png') for i in range(6)
        ]
        response = self._upload(token=self.owner_token, files=files)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.product.images.count(), 0)

    def test_frozen_product_rejects_upload(self):
        now = timezone.now()
        Auction.objects.create(
            product=self.product,
            starting_bid=100,
            current_highest_bid=100,
            min_increment=10,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(days=1),
            status=Auction.Status.ACTIVE,
        )
        response = self._upload(
            token=self.owner_token,
            files=_make_product_test_image(),
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('error'), PRODUCT_IMAGE_FROZEN_MESSAGE)
        self.assertEqual(self.product.images.count(), 0)

    def test_owner_can_delete_image_and_storage_object(self):
        image = ProductImage.objects.create(
            product=self.product,
            image=_make_product_test_image('del.png'),
        )
        name = image.image.name
        storage = image.image.storage
        self.assertTrue(storage.exists(name))
        self._auth(self.owner_token)
        response = self.client.delete(
            f'/api/products/{self.product.pk}/images/{image.pk}/',
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(ProductImage.objects.filter(pk=image.pk).exists())
        self.assertFalse(storage.exists(name))

    def test_other_seller_cannot_delete(self):
        image = ProductImage.objects.create(
            product=self.product,
            image=_make_product_test_image('keep.png'),
        )
        self._auth(self.other_token)
        response = self.client.delete(
            f'/api/products/{self.product.pk}/images/{image.pk}/',
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(ProductImage.objects.filter(pk=image.pk).exists())

    def test_buyer_cannot_delete(self):
        image = ProductImage.objects.create(
            product=self.product,
            image=_make_product_test_image('buyer.png'),
        )
        self._auth(self.buyer_token)
        response = self.client.delete(
            f'/api/products/{self.product.pk}/images/{image.pk}/',
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(ProductImage.objects.filter(pk=image.pk).exists())

    def test_frozen_product_rejects_delete(self):
        image = ProductImage.objects.create(
            product=self.product,
            image=_make_product_test_image('frozen.png'),
        )
        name = image.image.name
        storage = image.image.storage
        now = timezone.now()
        Auction.objects.create(
            product=self.product,
            starting_bid=100,
            current_highest_bid=100,
            min_increment=10,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(days=1),
            status=Auction.Status.ACTIVE,
        )
        self._auth(self.owner_token)
        response = self.client.delete(
            f'/api/products/{self.product.pk}/images/{image.pk}/',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('error'), PRODUCT_IMAGE_FROZEN_MESSAGE)
        self.assertTrue(ProductImage.objects.filter(pk=image.pk).exists())
        self.assertTrue(storage.exists(name))

    def test_wrong_product_image_pair_returns_404(self):
        other_product = Product.objects.create(
            seller=self.owner,
            title='Other listing',
            description='',
            condition=Product.Condition.NEW,
        )
        image = ProductImage.objects.create(
            product=other_product,
            image=_make_product_test_image('other.png'),
        )
        self._auth(self.owner_token)
        response = self.client.delete(
            f'/api/products/{self.product.pk}/images/{image.pk}/',
        )
        self.assertEqual(response.status_code, 404)
        self.assertTrue(ProductImage.objects.filter(pk=image.pk).exists())
