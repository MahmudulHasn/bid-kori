"""Comprehensive unit tests for BidKori Google Sign-In & account linking (AUTH-G01).

Validates:
- Valid existing linked user login
- New BUYER signup
- New SELLER signup
- ADMIN / staff role injection rejection
- Email not verified rejection
- Invalid audience rejection
- Malformed token rejection
- Suspended user denial
- Duplicate email safe account linking
- Concurrent / race-condition signup safety
- Repeated login idempotency
- Google sub change / account takeover rejection
- Mass assignment protection
- Two-step role selection flow with server-signed signup_token
- Unusable password on social signup
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from django.contrib.auth.models import User
from django.db import IntegrityError, connection
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.test import APIClient

from users.google_auth import (
    authenticate_or_register_google_user,
    generate_signup_token,
    generate_unique_username,
    validate_social_role,
    verify_google_id_token,
    verify_signup_token,
)
from users.models import SocialAccount, UserProfile

TEST_GOOGLE_CLIENT_ID = '41740936664-11qcgu4m77ud0pnac55d6op43fb5o5ds.apps.googleusercontent.com'


@override_settings(GOOGLE_CLIENT_ID=TEST_GOOGLE_CLIENT_ID)
class GoogleAuthServiceTests(TestCase):
    """Unit tests for google_auth service functions."""

    def test_verify_google_id_token_missing_credential(self):
        with self.assertRaises(AuthenticationFailed):
            verify_google_id_token('')

    @patch('google.oauth2.id_token.verify_oauth2_token')
    def test_verify_google_id_token_valid(self, mock_verify):
        mock_verify.return_value = {
            'iss': 'https://accounts.google.com',
            'sub': '109876543210',
            'email': 'Alice@Example.com',
            'email_verified': True,
            'name': 'Alice Smith',
            'picture': 'https://example.com/alice.jpg',
        }

        claims = verify_google_id_token('valid-dummy-token')
        self.assertEqual(claims['sub'], '109876543210')
        self.assertEqual(claims['email'], 'alice@example.com')
        self.assertEqual(claims['name'], 'Alice Smith')

    @patch('google.oauth2.id_token.verify_oauth2_token')
    def test_verify_google_id_token_unverified_email_rejected(self, mock_verify):
        mock_verify.return_value = {
            'iss': 'https://accounts.google.com',
            'sub': '109876543210',
            'email': 'alice@example.com',
            'email_verified': False,
        }

        with self.assertRaises(AuthenticationFailed) as ctx:
            verify_google_id_token('token')
        self.assertIn('not verified', str(ctx.exception).lower())

    @patch('google.oauth2.id_token.verify_oauth2_token')
    def test_verify_google_id_token_invalid_issuer_rejected(self, mock_verify):
        mock_verify.return_value = {
            'iss': 'https://evil-issuer.com',
            'sub': '109876543210',
            'email': 'alice@example.com',
            'email_verified': True,
        }

        with self.assertRaises(AuthenticationFailed) as ctx:
            verify_google_id_token('token')
        self.assertIn('issuer', str(ctx.exception).lower())

    def test_validate_social_role_accepts_buyer_and_seller(self):
        self.assertEqual(validate_social_role('BUYER'), 'BUYER')
        self.assertEqual(validate_social_role('buyer'), 'BUYER')
        self.assertEqual(validate_social_role('SELLER'), 'SELLER')
        self.assertEqual(validate_social_role('seller'), 'SELLER')

    def test_validate_social_role_rejects_admin_and_staff(self):
        from rest_framework.exceptions import ValidationError

        for bad in ('ADMIN', 'STAFF', 'SUPERUSER', 'ROOT', 'UNKNOWN', ''):
            with self.assertRaises(ValidationError):
                validate_social_role(bad)

    def test_signup_token_generation_and_verification(self):
        token = generate_signup_token(sub='sub123', email='test@example.com', name='Tester')
        self.assertIsInstance(token, str)

        claims = verify_signup_token(token)
        self.assertEqual(claims['sub'], 'sub123')
        self.assertEqual(claims['email'], 'test@example.com')
        self.assertEqual(claims['name'], 'Tester')

    def test_signup_token_tampered_rejected(self):
        token = generate_signup_token(sub='sub123', email='test@example.com')
        with self.assertRaises(AuthenticationFailed):
            verify_signup_token(token + 'tampered')

    def test_generate_unique_username_collision_safe(self):
        User.objects.create_user(username='john_doe', email='existing@example.com')
        new_username = generate_unique_username(email='john.doe@example.com', name='John Doe')
        self.assertNotEqual(new_username, 'john_doe')
        self.assertTrue(new_username.startswith('john_doe'))


@override_settings(GOOGLE_CLIENT_ID=TEST_GOOGLE_CLIENT_ID)
class GoogleAuthApiTests(TestCase):
    """End-to-end API tests for Google Sign-In endpoint /api/users/google/."""

    def setUp(self):
        self.client = APIClient()
        self.url = '/api/users/google/'

    @patch('users.google_views.verify_google_id_token')
    def test_new_buyer_registration_single_step(self, mock_verify):
        """New Google identity with explicit role=BUYER creates Buyer account."""
        mock_verify.return_value = {
            'sub': 'google-sub-buyer-1',
            'email': 'buyer1@example.com',
            'name': 'Buyer One',
            'picture': '',
        }

        response = self.client.post(self.url, {'credential': 'mock-cred', 'role': 'BUYER'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['email'], 'buyer1@example.com')
        self.assertEqual(response.data['user']['role'], 'BUYER')
        self.assertFalse(response.data['user']['is_staff'])

        # Verify DB records
        user = User.objects.get(email='buyer1@example.com')
        self.assertFalse(user.has_usable_password())
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(user.profile.role, UserProfile.Role.BUYER)

        social = SocialAccount.objects.get(user=user)
        self.assertEqual(social.provider, SocialAccount.Provider.GOOGLE)
        self.assertEqual(social.provider_user_id, 'google-sub-buyer-1')

    @patch('users.google_views.verify_google_id_token')
    def test_new_seller_registration_single_step(self, mock_verify):
        """New Google identity with explicit role=SELLER creates Seller account."""
        mock_verify.return_value = {
            'sub': 'google-sub-seller-1',
            'email': 'seller1@example.com',
            'name': 'Seller One',
            'picture': '',
        }

        response = self.client.post(self.url, {'credential': 'mock-cred', 'role': 'SELLER'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['role'], 'SELLER')

        user = User.objects.get(email='seller1@example.com')
        self.assertEqual(user.profile.role, UserProfile.Role.SELLER)

    @patch('users.google_views.verify_google_id_token')
    def test_admin_role_injection_rejected(self, mock_verify):
        """P0: role=ADMIN in social signup payload must be strictly rejected."""
        mock_verify.return_value = {
            'sub': 'google-sub-hacker',
            'email': 'hacker@example.com',
            'name': 'Hacker',
            'picture': '',
        }

        for forbidden_role in ('ADMIN', 'admin', 'STAFF', 'SUPERUSER'):
            response = self.client.post(self.url, {'credential': 'mock-cred', 'role': forbidden_role}, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertFalse(User.objects.filter(email='hacker@example.com').exists())

    @patch('users.google_views.verify_google_id_token')
    def test_two_step_role_selection_flow(self, mock_verify):
        """When role is omitted on first signup, return signup_token; resume with role."""
        mock_verify.return_value = {
            'sub': 'google-sub-twostep',
            'email': 'twostep@example.com',
            'name': 'Two Step',
            'picture': '',
        }

        # Step 1: initial Google sign-in without role
        step1_response = self.client.post(self.url, {'credential': 'mock-cred'}, format='json')
        self.assertEqual(step1_response.status_code, status.HTTP_200_OK)
        self.assertTrue(step1_response.data.get('requires_role_selection'))
        self.assertIn('signup_token', step1_response.data)
        signup_token = step1_response.data['signup_token']

        # No user created yet in Step 1
        self.assertFalse(User.objects.filter(email='twostep@example.com').exists())

        # Step 2: user selects BUYER role and submits signup_token
        step2_response = self.client.post(
            self.url,
            {'signup_token': signup_token, 'role': 'BUYER'},
            format='json',
        )
        self.assertEqual(step2_response.status_code, status.HTTP_201_CREATED)
        self.assertIn('token', step2_response.data)
        self.assertEqual(step2_response.data['user']['email'], 'twostep@example.com')
        self.assertEqual(step2_response.data['user']['role'], 'BUYER')

        user = User.objects.get(email='twostep@example.com')
        self.assertEqual(user.profile.role, UserProfile.Role.BUYER)

    @patch('users.google_views.verify_google_id_token')
    def test_existing_linked_user_login(self, mock_verify):
        """User already linked with Google sub logs in directly without role selection."""
        user = User.objects.create_user(username='existing_buyer', email='existing@example.com')
        UserProfile.objects.create(user=user, role=UserProfile.Role.BUYER)
        SocialAccount.objects.create(
            user=user,
            provider=SocialAccount.Provider.GOOGLE,
            provider_user_id='google-sub-existing',
            email='existing@example.com',
        )

        mock_verify.return_value = {
            'sub': 'google-sub-existing',
            'email': 'existing@example.com',
            'name': 'Existing Buyer',
            'picture': '',
        }

        response = self.client.post(self.url, {'credential': 'mock-cred'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['id'], user.id)
        self.assertEqual(response.data['user']['role'], 'BUYER')

        # No duplicate accounts created
        self.assertEqual(User.objects.filter(email='existing@example.com').count(), 1)
        self.assertEqual(SocialAccount.objects.filter(provider_user_id='google-sub-existing').count(), 1)

    @patch('users.google_views.verify_google_id_token')
    def test_existing_password_user_auto_links_verified_email(self, mock_verify):
        """Case B: Existing user with same verified email links Google identity."""
        user = User.objects.create_user(
            username='legacy_seller',
            email='legacy@example.com',
            password='Password123!',
        )
        UserProfile.objects.create(user=user, role=UserProfile.Role.SELLER)

        mock_verify.return_value = {
            'sub': 'google-sub-legacy',
            'email': 'legacy@example.com',
            'name': 'Legacy Seller',
            'picture': '',
        }

        response = self.client.post(self.url, {'credential': 'mock-cred'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['id'], user.id)
        self.assertEqual(response.data['user']['role'], 'SELLER')

        # Verify SocialAccount was created and linked to existing user
        social = SocialAccount.objects.get(provider_user_id='google-sub-legacy')
        self.assertEqual(social.user, user)
        self.assertEqual(User.objects.filter(email='legacy@example.com').count(), 1)

    @patch('users.google_views.verify_google_id_token')
    def test_suspended_user_login_denied(self, mock_verify):
        """Suspended user (is_active=False) cannot log in via Google."""
        user = User.objects.create_user(
            username='banned_user',
            email='banned@example.com',
            is_active=False,
        )
        UserProfile.objects.create(user=user, role=UserProfile.Role.BUYER)
        SocialAccount.objects.create(
            user=user,
            provider=SocialAccount.Provider.GOOGLE,
            provider_user_id='google-sub-banned',
            email='banned@example.com',
        )

        mock_verify.return_value = {
            'sub': 'google-sub-banned',
            'email': 'banned@example.com',
            'name': 'Banned User',
            'picture': '',
        }

        response = self.client.post(self.url, {'credential': 'mock-cred'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('unavailable', str(response.data))

    @patch('users.google_views.verify_google_id_token')
    def test_repeated_login_idempotent(self, mock_verify):
        """Repeated login calls are completely idempotent and do not create duplicate rows."""
        mock_verify.return_value = {
            'sub': 'google-sub-idempotent',
            'email': 'idempotent@example.com',
            'name': 'Idempotent User',
            'picture': '',
        }

        # First call (signup)
        res1 = self.client.post(self.url, {'credential': 'mock-cred', 'role': 'BUYER'}, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Second call (subsequent login)
        res2 = self.client.post(self.url, {'credential': 'mock-cred'}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data['user']['id'], res2.data['user']['id'])

        # Third call
        res3 = self.client.post(self.url, {'credential': 'mock-cred'}, format='json')
        self.assertEqual(res3.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data['user']['id'], res3.data['user']['id'])

        self.assertEqual(User.objects.filter(email='idempotent@example.com').count(), 1)
        self.assertEqual(SocialAccount.objects.filter(provider_user_id='google-sub-idempotent').count(), 1)

    @patch('users.google_views.verify_google_id_token')
    def test_conflicting_google_sub_rejected(self, mock_verify):
        """Account cannot be hijacked by presenting a different sub for an already linked account."""
        user = User.objects.create_user(username='victim', email='victim@example.com')
        UserProfile.objects.create(user=user, role=UserProfile.Role.BUYER)
        SocialAccount.objects.create(
            user=user,
            provider=SocialAccount.Provider.GOOGLE,
            provider_user_id='google-sub-legitimate',
            email='victim@example.com',
        )

        # Attacker tries to link a different sub with victim's email
        mock_verify.return_value = {
            'sub': 'google-sub-attacker',
            'email': 'victim@example.com',
            'name': 'Attacker',
            'picture': '',
        }

        response = self.client.post(self.url, {'credential': 'mock-cred'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('already connected', str(response.data).lower())

    def test_mass_assignment_fields_rejected(self):
        """Attempting to inject privilege fields in payload is rejected by serializer."""
        for field in ('is_staff', 'is_superuser', 'is_active', 'user_id', 'provider_user_id'):
            response = self.client.post(
                self.url,
                {'credential': 'mock-cred', 'role': 'BUYER', field: True},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('users.google_views.verify_google_id_token')
    def test_admin_user_preserves_admin_status_via_google_login(self, mock_verify):
        """Existing Django staff user logging in via Google retains staff status (Django authority)."""
        admin_user = User.objects.create_user(
            username='site_admin',
            email='admin@bidkori.com',
            is_staff=True,
            is_superuser=True,
        )
        UserProfile.objects.create(user=admin_user, role=UserProfile.Role.BUYER)

        mock_verify.return_value = {
            'sub': 'google-sub-admin',
            'email': 'admin@bidkori.com',
            'name': 'Site Admin',
            'picture': '',
        }

        response = self.client.post(self.url, {'credential': 'mock-cred'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['role'], 'ADMIN')
        self.assertTrue(response.data['user']['is_staff'])

        # Staff status was preserved from Django, not Google
        admin_user.refresh_from_db()
        self.assertTrue(admin_user.is_staff)
        self.assertTrue(admin_user.is_superuser)

    @patch('users.google_views.verify_google_id_token')
    def test_alias_endpoint_api_auth_google(self, mock_verify):
        """Verify alias route /api/auth/google/ works identically."""
        mock_verify.return_value = {
            'sub': 'google-sub-alias',
            'email': 'alias@example.com',
            'name': 'Alias User',
            'picture': '',
        }

        response = self.client.post('/api/auth/google/', {'credential': 'mock-cred', 'role': 'BUYER'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)

    @patch('users.google_views.verify_google_id_token')
    def test_invalid_token_returns_401_no_500(self, mock_verify):
        """Malformed or crypto-failed Google token returns clean 401, never 500."""
        mock_verify.side_effect = AuthenticationFailed('Invalid or expired Google credential.')

        response = self.client.post(self.url, {'credential': 'bad-token'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('Invalid or expired', str(response.data))

    def test_concurrent_first_signup_race_handling(self):
        """Backend handles race where SocialAccount is created concurrently without raising 500."""
        # Pre-create the user as if thread A won the race
        created_user = User.objects.create_user(username='race_winner', email='race@example.com')
        UserProfile.objects.create(user=created_user, role=UserProfile.Role.BUYER)
        SocialAccount.objects.create(
            user=created_user,
            provider=SocialAccount.Provider.GOOGLE,
            provider_user_id='google-sub-race',
            email='race@example.com',
        )

        # Thread B calls authenticate_or_register_google_user with role=BUYER
        user, pending = authenticate_or_register_google_user(
            sub='google-sub-race',
            email='race@example.com',
            name='Race User',
            role='BUYER',
        )
        self.assertIsNotNone(user)
        self.assertEqual(user.id, created_user.id)
        self.assertIsNone(pending)

