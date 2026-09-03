from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from users.models import UserProfile, ensure_user_profile, resolve_user_role


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


class UserRoleContractTests(APITestCase):
    """Authoritative BUYER / SELLER / ADMIN identity contract."""

    def setUp(self):
        self.password = 'secure-pass-123'
        self.register_url = '/api/users/register/'
        self.login_url = '/api/users/login/'
        self.logout_url = '/api/users/logout/'
        self.me_url = '/api/users/me/'

    def _register(self, username, email, role=None, **extra):
        payload = {
            'username': username,
            'email': email,
            'password': self.password,
            'confirm_password': self.password,
            **extra,
        }
        if role is not None:
            payload['role'] = role
        return self.client.post(self.register_url, payload, format='json')

    def test_register_buyer_succeeds(self):
        response = self._register('buyer1', 'buyer1@test.com', role='BUYER')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user']['role'], 'BUYER')
        self.assertFalse(response.data['user']['is_staff'])
        user = User.objects.get(username='buyer1')
        self.assertEqual(user.profile.role, UserProfile.Role.BUYER)

    def test_register_seller_succeeds(self):
        response = self._register('seller1', 'seller1@test.com', role='SELLER')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user']['role'], 'SELLER')
        self.assertFalse(response.data['user']['is_staff'])
        user = User.objects.get(username='seller1')
        self.assertEqual(user.profile.role, UserProfile.Role.SELLER)

    def test_register_admin_rejected(self):
        response = self._register('admin1', 'admin1@test.com', role='ADMIN')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='admin1').exists())

    def test_register_invalid_role_rejected(self):
        for bad_role in ('STAFF', 'SUPERUSER', 'MODERATOR', 'buyer_admin', ''):
            with self.subTest(role=bad_role):
                username = f'bad_{bad_role or "empty"}'
                response = self._register(
                    username,
                    f'{username}@test.com',
                    role=bad_role,
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertFalse(User.objects.filter(username=username).exists())

    def test_register_without_role_defaults_to_buyer(self):
        """Omitted role defaults to BUYER for backward-compatible clients."""
        response = self._register('legacy_reg', 'legacy_reg@test.com')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user']['role'], 'BUYER')
        user = User.objects.get(username='legacy_reg')
        self.assertEqual(user.profile.role, UserProfile.Role.BUYER)

    def test_me_buyer_returns_buyer_role(self):
        user = User.objects.create_user(
            username='me_buyer',
            email='me_buyer@test.com',
            password=self.password,
        )
        UserProfile.objects.create(user=user, role=UserProfile.Role.BUYER)
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['role'], 'BUYER')
        self.assertFalse(response.data['is_staff'])
        self.assertEqual(response.data['username'], 'me_buyer')
        self.assertEqual(response.data['email'], 'me_buyer@test.com')

    def test_me_seller_returns_seller_role(self):
        user = User.objects.create_user(
            username='me_seller',
            email='me_seller@test.com',
            password=self.password,
        )
        UserProfile.objects.create(user=user, role=UserProfile.Role.SELLER)
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['role'], 'SELLER')
        self.assertFalse(response.data['is_staff'])

    def test_me_staff_returns_admin_role(self):
        user = User.objects.create_user(
            username='staff_user',
            email='staff@test.com',
            password=self.password,
        )
        user.is_staff = True
        user.save(update_fields=['is_staff'])
        UserProfile.objects.create(user=user, role=UserProfile.Role.SELLER)
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['role'], 'ADMIN')
        self.assertTrue(response.data['is_staff'])

    def test_me_superuser_returns_admin_role(self):
        user = User.objects.create_superuser(
            username='super_user',
            email='super@test.com',
            password=self.password,
        )
        UserProfile.objects.create(user=user, role=UserProfile.Role.BUYER)
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['role'], 'ADMIN')
        self.assertTrue(response.data['is_staff'])

    def test_register_rejects_is_staff_payload(self):
        response = self._register(
            'priv_user',
            'priv@test.com',
            role='BUYER',
            is_staff=True,
            is_superuser=True,
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='priv_user').exists())

    def test_login_response_contains_authoritative_role(self):
        user = User.objects.create_user(
            username='login_seller',
            email='login_seller@test.com',
            password=self.password,
        )
        UserProfile.objects.create(user=user, role=UserProfile.Role.SELLER)
        response = self.client.post(
            self.login_url,
            {'username': 'login_seller', 'password': self.password},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['role'], 'SELLER')
        self.assertFalse(response.data['user']['is_staff'])

    def test_existing_user_without_profile_logs_in_as_buyer(self):
        user = User.objects.create_user(
            username='legacy_user',
            email='legacy@test.com',
            password=self.password,
        )
        self.assertFalse(UserProfile.objects.filter(user=user).exists())
        response = self.client.post(
            self.login_url,
            {'username': 'legacy_user', 'password': self.password},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['role'], 'BUYER')
        self.assertTrue(UserProfile.objects.filter(user=user, role='BUYER').exists())

    def test_logout_token_behavior_unchanged(self):
        user = User.objects.create_user(
            username='logout_role',
            email='logout_role@test.com',
            password=self.password,
        )
        UserProfile.objects.create(user=user, role=UserProfile.Role.BUYER)
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.post(self.logout_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Token.objects.filter(key=token.key).exists())

    def test_resolve_user_role_helpers(self):
        buyer = User.objects.create_user(username='h_buyer', password=self.password)
        ensure_user_profile(buyer, role=UserProfile.Role.BUYER)
        self.assertEqual(resolve_user_role(buyer), 'BUYER')

        seller = User.objects.create_user(username='h_seller', password=self.password)
        ensure_user_profile(seller, role=UserProfile.Role.SELLER)
        seller.refresh_from_db()
        self.assertEqual(resolve_user_role(seller), 'SELLER')

        staff = User.objects.create_user(username='h_staff', password=self.password)
        staff.is_staff = True
        staff.save(update_fields=['is_staff'])
        ensure_user_profile(staff, role=UserProfile.Role.SELLER)
        self.assertEqual(resolve_user_role(staff), 'ADMIN')
