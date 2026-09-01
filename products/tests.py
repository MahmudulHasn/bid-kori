from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import Product


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
        self.owner_token = Token.objects.create(user=self.owner)
        self.other_token = Token.objects.create(user=self.other)

    def _create_product(self, seller=None, title='Test Item'):
        return Product.objects.create(
            seller=seller or self.owner,
            title=title,
            description='Desc',
        )

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

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

    def test_owner_can_delete_own_product(self):
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

    def test_authenticated_user_can_create_product(self):
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

    def test_authenticated_create_ignores_legacy_starting_price(self):
        """starting_price is not a Product field; it must not block creation."""
        self._auth(self.owner_token)
        response = self.client.post(
            '/api/products/',
            {
                'title': 'Legacy payload item',
                'description': 'Includes ignored starting_price',
                'condition': 'USED_GOOD',
                'starting_price': '1500.00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        product = Product.objects.get(pk=response.data['id'])
        self.assertEqual(product.title, 'Legacy payload item')

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

    def test_my_listings_returns_only_owner_products(self):
        own_product = self._create_product(seller=self.owner, title='Mine')
        self._create_product(seller=self.other, title='Theirs')
        self._auth(self.owner_token)
        response = self.client.get('/api/products/my-listings/')
        self.assertEqual(response.status_code, 200)
        ids = {item['id'] for item in response.data}
        self.assertEqual(ids, {own_product.pk})
