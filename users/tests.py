from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase


class AuthenticationTests(APITestCase):
    """Core auth flows for register, login, logout, and /me/."""

    def setUp(self):
        self.password = 'secure-pass-123'
        self.user = User.objects.create_user(
            username='alice',
            email='alice@test.com',
            password=self.password,
        )
        self.login_url = '/api/users/login/'
        self.register_url = '/api/users/register/'
        self.logout_url = '/api/users/logout/'
        self.me_url = '/api/users/me/'

    def test_valid_login_returns_token_and_user(self):
        response = self.client.post(
            self.login_url,
            {'username': 'alice', 'password': self.password},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['username'], 'alice')
        self.assertTrue(Token.objects.filter(user=self.user).exists())

    def test_invalid_login_returns_401_without_sensitive_detail(self):
        response = self.client.post(
            self.login_url,
            {'username': 'alice', 'password': 'wrong-password'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['error'], 'Invalid credentials.')
        self.assertNotIn('password', str(response.data).lower())

    def test_login_missing_fields_returns_400(self):
        response = self.client.post(
            self.login_url,
            {'username': 'alice'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('status_code', response.data)
        self.assertIn('error', response.data)

    def test_protected_me_without_token_is_rejected(self):
        response = self.client.get(self.me_url)
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_protected_me_with_invalid_token_is_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION='Token not-a-real-token')
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_valid_authenticated_me_request(self):
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], 'alice')
        self.assertEqual(response.data['email'], 'alice@test.com')

    def test_registration_validation_password_mismatch(self):
        response = self.client.post(
            self.register_url,
            {
                'username': 'newuser',
                'email': 'new@test.com',
                'password': 'password12',
                'confirm_password': 'password99',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_registration_validation_duplicate_username(self):
        response = self.client.post(
            self.register_url,
            {
                'username': 'alice',
                'email': 'other@test.com',
                'password': 'password12',
                'confirm_password': 'password12',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_valid_registration_creates_hashed_user_and_token(self):
        response = self.client.post(
            self.register_url,
            {
                'username': 'bob',
                'email': 'bob@test.com',
                'password': 'password12',
                'confirm_password': 'password12',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username='bob')
        self.assertTrue(user.check_password('password12'))
        self.assertNotEqual(user.password, 'password12')
        self.assertTrue(Token.objects.filter(user=user).exists())

    def test_logout_revokes_token(self):
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.post(self.logout_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Token.objects.filter(key=token.key).exists())

        me_response = self.client.get(self.me_url)
        self.assertEqual(me_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_rotates_existing_token(self):
        old_token = Token.objects.create(user=self.user)
        response = self.client.post(
            self.login_url,
            {'username': 'alice', 'password': self.password},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        new_key = response.data['token']
        self.assertNotEqual(new_key, old_token.key)
        self.assertFalse(Token.objects.filter(key=old_token.key).exists())
        self.assertTrue(Token.objects.filter(key=new_key).exists())

    def test_inactive_user_cannot_login(self):
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        response = self.client.post(
            self.login_url,
            {'username': 'alice', 'password': self.password},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['error'], 'Invalid credentials.')
