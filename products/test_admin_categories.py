"""Tests for Admin Category API with image uploads and management."""

import io
from PIL import Image
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from products.models import Category
from users.models import UserProfile, ensure_user_profile


def _make_image_file(name: str = 'test_cat.png', fmt: str = 'PNG', size=(100, 100), color='blue'):
    buffer = io.BytesIO()
    image = Image.new('RGB', size, color=color)
    image.save(buffer, format=fmt)
    buffer.seek(0)
    content_type = {
        'PNG': 'image/png',
        'JPEG': 'image/jpeg',
        'WEBP': 'image/webp',
    }.get(fmt, 'application/octet-stream')
    return SimpleUploadedFile(name, buffer.read(), content_type=content_type)


class AdminCategoryAPITests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='admin_cat_user',
            email='admin@test.com',
            password='pass12345',
        )
        self.non_admin = User.objects.create_user(
            username='regular_user',
            email='regular@test.com',
            password='pass12345',
        )
        ensure_user_profile(self.admin, role=UserProfile.Role.SELLER)
        ensure_user_profile(self.non_admin, role=UserProfile.Role.BUYER)
        self.admin_token = Token.objects.create(user=self.admin)
        self.user_token = Token.objects.create(user=self.non_admin)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_non_admin_cannot_access(self):
        self._auth(self.user_token)
        res = self.client.get('/api/admin/categories/')
        self.assertEqual(res.status_code, 403)

        res = self.client.post('/api/admin/categories/', {'name': 'Sneakers'})
        self.assertEqual(res.status_code, 403)

    def test_admin_create_category_without_image(self):
        self._auth(self.admin_token)
        res = self.client.post('/api/admin/categories/', {'name': 'Electronics', 'slug': 'electronics'})
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['name'], 'Electronics')
        self.assertEqual(res.data['slug'], 'electronics')
        self.assertIsNone(res.data['image'])
        cat = Category.objects.get(pk=res.data['id'])
        self.assertFalse(cat.image)

    def test_admin_create_category_with_image(self):
        self._auth(self.admin_token)
        img = _make_image_file('gaming.png', 'PNG')
        res = self.client.post(
            '/api/admin/categories/',
            {'name': 'Gaming', 'image': img},
            format='multipart',
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['name'], 'Gaming')
        self.assertEqual(res.data['slug'], 'gaming')
        self.assertIsNotNone(res.data['image'])
        cat = Category.objects.get(pk=res.data['id'])
        self.assertTrue(cat.image)
        self.assertTrue(cat.image.name.startswith('category_images/'))

    def test_admin_update_category_replace_image(self):
        self._auth(self.admin_token)
        cat = Category.objects.create(name='Watches', slug='watches')
        img = _make_image_file('watches.jpg', 'JPEG')
        res = self.client.patch(
            f'/api/admin/categories/{cat.pk}/',
            {'image': img},
            format='multipart',
        )
        self.assertEqual(res.status_code, 200)
        cat.refresh_from_db()
        self.assertTrue(cat.image)

    def test_admin_delete_category_cleans_up_storage(self):
        self._auth(self.admin_token)
        img = _make_image_file('sports.png', 'PNG')
        cat = Category.objects.create(name='Sports', slug='sports', image=img)
        storage = cat.image.storage
        path = cat.image.name
        self.assertTrue(storage.exists(path))

        res = self.client.delete(f'/api/admin/categories/{cat.pk}/')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Category.objects.filter(pk=cat.pk).exists())
        self.assertFalse(storage.exists(path))
