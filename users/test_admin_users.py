"""ADM-B09: Admin Users REST list/detail/search/filter + suspend/reactivate."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from django.db import connection
from django.test import TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from auctions.models import Auction, Bid
from config.asgi import application
from products.models import Product
from users.auth_tokens import issue_auth_token
from users.models import UserProfile, ensure_user_profile

LIST_URL = '/api/admin/users/'
WS_PATH = '/ws/notifications/'
WS_HEADERS = [(b'origin', b'http://localhost')]


def _detail_url(user_id: int) -> str:
    return f'/api/admin/users/{user_id}/'


def _suspend_url(user_id: int) -> str:
    return f'/api/admin/users/{user_id}/suspend/'


def _reactivate_url(user_id: int) -> str:
    return f'/api/admin/users/{user_id}/reactivate/'


def _assert_safe_user_fields(testcase, payload: dict) -> None:
    for key in (
        'id',
        'username',
        'email',
        'role',
        'is_active',
        'is_staff',
        'is_superuser',
        'date_joined',
    ):
        testcase.assertIn(key, payload)
    blob = str(payload).lower()
    testcase.assertNotIn('password', blob)
    testcase.assertNotIn('token', blob)
    testcase.assertNotIn('auth_token', blob)
    testcase.assertNotIn('"key"', blob)


class AdminUserListAccessTests(APITestCase):
    def setUp(self):
        self.password = 'secure-pass-123'
        self.staff = User.objects.create_user(
            username='admin_staff',
            email='staff@test.com',
            password=self.password,
            is_staff=True,
        )
        self.superuser = User.objects.create_superuser(
            username='admin_super',
            email='super@test.com',
            password=self.password,
        )
        self.buyer = User.objects.create_user(
            username='buyer1',
            email='buyer1@test.com',
            password=self.password,
        )
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)
        self.seller = User.objects.create_user(
            username='seller1',
            email='seller1@test.com',
            password=self.password,
        )
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)

    def _auth(self, user):
        token = issue_auth_token(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_staff_can_list_users(self):
        self._auth(self.staff)
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)
        self.assertGreaterEqual(len(response.data['results']), 4)

    def test_superuser_can_list_users(self):
        self._auth(self.superuser)
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_buyer_forbidden(self):
        self._auth(self.buyer)
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_seller_forbidden(self):
        self._auth(self.seller)
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_rejected(self):
        response = self.client.get(LIST_URL)
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


class AdminUserSerializerSafetyTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            username='staff_safe',
            email='staff_safe@test.com',
            password='pass12345',
            is_staff=True,
        )
        self.target = User.objects.create_user(
            username='safe_buyer',
            email='safe_buyer@test.com',
            password='pass12345',
        )
        ensure_user_profile(self.target, role=UserProfile.Role.BUYER)
        token = issue_auth_token(self.staff)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_list_and_detail_safe_fields(self):
        list_resp = self.client.get(LIST_URL)
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        row = next(
            item
            for item in list_resp.data['results']
            if item['username'] == 'safe_buyer'
        )
        _assert_safe_user_fields(self, row)

        detail = self.client.get(_detail_url(self.target.pk))
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        _assert_safe_user_fields(self, detail.data)
        self.assertEqual(detail.data['role'], 'BUYER')
        self.assertTrue(detail.data['is_active'])


class AdminUserPaginationSearchFilterTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            username='pager_admin',
            email='pager_admin@test.com',
            password='pass12345',
            is_staff=True,
        )
        token = issue_auth_token(self.staff)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        # Create 21 marketplace users so page size 20 is observable.
        self.created = []
        for i in range(21):
            user = User.objects.create_user(
                username=f'pageuser{i:02d}',
                email=f'pageuser{i:02d}@example.com',
                password='pass12345',
            )
            ensure_user_profile(user, role=UserProfile.Role.BUYER)
            self.created.append(user)

        self.seller = User.objects.create_user(
            username='RoleSeller',
            email='roleseller@example.com',
            password='pass12345',
        )
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)

        self.inactive = User.objects.create_user(
            username='inactive_buyer',
            email='inactive@example.com',
            password='pass12345',
            is_active=False,
        )
        ensure_user_profile(self.inactive, role=UserProfile.Role.BUYER)

        self.no_profile = User.objects.create_user(
            username='legacy_noprofile',
            email='legacy@example.com',
            password='pass12345',
        )

        self.other_staff = User.objects.create_user(
            username='other_staff',
            email='other_staff@example.com',
            password='pass12345',
            is_staff=True,
        )
        ensure_user_profile(self.other_staff, role=UserProfile.Role.BUYER)

    def test_pagination_page_size_twenty_and_ordering(self):
        page1 = self.client.get(LIST_URL)
        self.assertEqual(page1.status_code, status.HTTP_200_OK)
        self.assertEqual(len(page1.data['results']), 20)
        self.assertIsNotNone(page1.data['next'])

        ids = [row['id'] for row in page1.data['results']]
        # Newest-first: date_joined desc, id desc — ids should be non-increasing
        # among same-second creates; compare against queryset order.
        expected = list(
            User.objects.order_by('-date_joined', '-id').values_list(
                'id', flat=True
            )[:20]
        )
        self.assertEqual(ids, expected)

        page2 = self.client.get(LIST_URL, {'page': 2})
        self.assertEqual(page2.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(page2.data['results']), 1)

    def test_search_username_and_email_case_insensitive(self):
        by_user = self.client.get(LIST_URL, {'search': 'roleseller'})
        self.assertEqual(by_user.status_code, status.HTTP_200_OK)
        usernames = {row['username'] for row in by_user.data['results']}
        self.assertIn('RoleSeller', usernames)

        by_email = self.client.get(LIST_URL, {'search': 'RoleSeller@EXAMPLE.com'})
        self.assertEqual(by_email.status_code, status.HTTP_200_OK)
        emails = {row['email'].lower() for row in by_email.data['results']}
        self.assertIn('roleseller@example.com', emails)

    def test_role_filters(self):
        buyers = self.client.get(LIST_URL, {'role': 'BUYER'})
        self.assertEqual(buyers.status_code, status.HTTP_200_OK)
        for row in buyers.data['results']:
            self.assertEqual(row['role'], 'BUYER')
            self.assertFalse(row['is_staff'])
            self.assertFalse(row['is_superuser'])

        # Missing profile resolves to BUYER and must appear when not paginated away.
        all_buyers = self.client.get(
            LIST_URL,
            {'role': 'BUYER', 'search': 'legacy_noprofile'},
        )
        self.assertEqual(len(all_buyers.data['results']), 1)
        self.assertEqual(all_buyers.data['results'][0]['role'], 'BUYER')

        sellers = self.client.get(LIST_URL, {'role': 'SELLER'})
        self.assertEqual(sellers.status_code, status.HTTP_200_OK)
        self.assertTrue(
            any(row['username'] == 'RoleSeller' for row in sellers.data['results'])
        )
        for row in sellers.data['results']:
            self.assertEqual(row['role'], 'SELLER')

        admins = self.client.get(LIST_URL, {'role': 'ADMIN'})
        self.assertEqual(admins.status_code, status.HTTP_200_OK)
        admin_names = {row['username'] for row in admins.data['results']}
        self.assertIn('pager_admin', admin_names)
        self.assertIn('other_staff', admin_names)
        for row in admins.data['results']:
            self.assertEqual(row['role'], 'ADMIN')
            self.assertTrue(row['is_staff'] or row['is_superuser'])

        bad = self.client.get(LIST_URL, {'role': 'HACKER'})
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_is_active_filter(self):
        active = self.client.get(LIST_URL, {'is_active': 'true'})
        self.assertEqual(active.status_code, status.HTTP_200_OK)
        self.assertTrue(all(row['is_active'] for row in active.data['results']))

        inactive = self.client.get(LIST_URL, {'is_active': 'false'})
        self.assertEqual(inactive.status_code, status.HTTP_200_OK)
        self.assertTrue(
            any(row['username'] == 'inactive_buyer' for row in inactive.data['results'])
        )
        self.assertTrue(all(not row['is_active'] for row in inactive.data['results']))

        bad = self.client.get(LIST_URL, {'is_active': 'maybe'})
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_avoids_n_plus_one_profile_queries(self):
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        profile_queries = [
            q['sql']
            for q in ctx.captured_queries
            if 'users_userprofile' in q['sql'].lower()
        ]
        # select_related should keep profile hits to at most one JOIN query,
        # not one lookup per listed user.
        self.assertLessEqual(len(profile_queries), 2)


class AdminUserDetailTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            username='detail_admin',
            email='detail_admin@test.com',
            password='pass12345',
            is_staff=True,
        )
        self.buyer = User.objects.create_user(
            username='detail_buyer',
            email='detail_buyer@test.com',
            password='pass12345',
        )
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)

    def test_admin_detail_and_nonadmin_forbidden_and_404(self):
        token = issue_auth_token(self.staff)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        ok = self.client.get(_detail_url(self.buyer.pk))
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertEqual(ok.data['username'], 'detail_buyer')

        missing = self.client.get(_detail_url(999999))
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)

        buyer_token = issue_auth_token(self.buyer)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {buyer_token.key}')
        forbidden = self.client.get(_detail_url(self.staff.pk))
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)


class AdminUserSuspendReactivateTests(APITestCase):
    def setUp(self):
        self.password = 'secure-pass-123'
        self.admin = User.objects.create_user(
            username='ctl_admin',
            email='ctl_admin@test.com',
            password=self.password,
            is_staff=True,
        )
        self.admin_token = issue_auth_token(self.admin)
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.admin_token.key}'
        )

        self.buyer = User.objects.create_user(
            username='ctl_buyer',
            email='ctl_buyer@test.com',
            password=self.password,
        )
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)
        self.buyer_token = issue_auth_token(self.buyer)

        self.seller = User.objects.create_user(
            username='ctl_seller',
            email='ctl_seller@test.com',
            password=self.password,
        )
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        self.seller_token = issue_auth_token(self.seller)

        self.other_staff = User.objects.create_user(
            username='ctl_other_staff',
            email='ctl_other_staff@test.com',
            password=self.password,
            is_staff=True,
        )
        self.other_staff_token = issue_auth_token(self.other_staff)

        self.superuser = User.objects.create_superuser(
            username='ctl_super',
            email='ctl_super@test.com',
            password=self.password,
        )
        self.super_token = issue_auth_token(self.superuser)

        now = timezone.now()
        self.product = Product.objects.create(
            seller=self.seller,
            title='Seller Keep Me',
            description='preserve',
        )
        self.auction = Auction.objects.create(
            product=self.product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('110.00'),
            min_increment=Decimal('10.00'),
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            status=Auction.Status.ACTIVE,
        )
        self.bid = Bid.objects.create(
            auction=self.auction,
            bidder=self.buyer,
            amount=Decimal('110.00'),
        )

    def test_suspend_buyer_revokes_token_preserves_bid(self):
        response = self.client.post(_suspend_url(self.buyer.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_active'])
        self.buyer.refresh_from_db()
        self.assertFalse(self.buyer.is_active)
        self.assertFalse(Token.objects.filter(user=self.buyer).exists())
        self.assertTrue(Bid.objects.filter(pk=self.bid.pk, amount=Decimal('110.00')).exists())
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.ACTIVE)

    def test_suspend_seller_preserves_product_and_auction(self):
        response = self.client.post(_suspend_url(self.seller.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_active'])
        self.assertFalse(Token.objects.filter(user=self.seller).exists())
        self.assertTrue(Product.objects.filter(pk=self.product.pk).exists())
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.ACTIVE)

    def test_cannot_suspend_self(self):
        response = self.client.post(_suspend_url(self.admin.pk))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)
        self.assertTrue(Token.objects.filter(key=self.admin_token.key).exists())

    def test_cannot_suspend_other_staff(self):
        response = self.client.post(_suspend_url(self.other_staff.pk))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.other_staff.refresh_from_db()
        self.assertTrue(self.other_staff.is_active)
        self.assertTrue(
            Token.objects.filter(key=self.other_staff_token.key).exists()
        )

    def test_cannot_suspend_superuser(self):
        response = self.client.post(_suspend_url(self.superuser.pk))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.superuser.refresh_from_db()
        self.assertTrue(self.superuser.is_active)
        self.assertTrue(Token.objects.filter(key=self.super_token.key).exists())

    def test_suspend_idempotent_and_reactivate_without_token(self):
        first = self.client.post(_suspend_url(self.buyer.pk))
        second = self.client.post(_suspend_url(self.buyer.pk))
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertFalse(second.data['is_active'])
        self.assertFalse(Token.objects.filter(user=self.buyer).exists())

        revived = self.client.post(_reactivate_url(self.buyer.pk))
        self.assertEqual(revived.status_code, status.HTTP_200_OK)
        self.assertTrue(revived.data['is_active'])
        self.assertFalse(Token.objects.filter(user=self.buyer).exists())

        again = self.client.post(_reactivate_url(self.buyer.pk))
        self.assertEqual(again.status_code, status.HTTP_200_OK)
        self.assertTrue(again.data['is_active'])
        self.assertFalse(Token.objects.filter(user=self.buyer).exists())

    def test_reactivate_seller_does_not_recreate_token(self):
        self.client.post(_suspend_url(self.seller.pk))
        response = self.client.post(_reactivate_url(self.seller.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_active'])
        self.assertFalse(Token.objects.filter(user=self.seller).exists())

    def test_old_token_stays_dead_after_reactivate_then_fresh_login(self):
        old_key = self.buyer_token.key
        self.client.post(_suspend_url(self.buyer.pk))
        self.assertFalse(Token.objects.filter(key=old_key).exists())

        self.client.post(_reactivate_url(self.buyer.pk))
        self.assertFalse(Token.objects.filter(key=old_key).exists())

        other = APIClient()
        other.credentials(HTTP_AUTHORIZATION=f'Token {old_key}')
        me = other.get('/api/users/me/')
        self.assertEqual(me.status_code, status.HTTP_401_UNAUTHORIZED)

        login = APIClient().post(
            '/api/users/login/',
            {'username': 'ctl_buyer', 'password': self.password},
            format='json',
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        new_key = login.data['token']
        self.assertTrue(Token.objects.filter(key=new_key).exists())
        other.credentials(HTTP_AUTHORIZATION=f'Token {new_key}')
        me_ok = other.get('/api/users/me/')
        self.assertEqual(me_ok.status_code, status.HTTP_200_OK)

    def test_inactive_existing_token_rejected_even_if_row_remains(self):
        # Framework protection separate from suspend deletion.
        token = self.buyer_token
        self.buyer.is_active = False
        self.buyer.save(update_fields=['is_active'])
        self.assertTrue(Token.objects.filter(key=token.key).exists())

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = client.get('/api/users/me/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_suspend_blocks_login_reactivate_allows_login(self):
        self.client.post(_suspend_url(self.buyer.pk))
        denied = APIClient().post(
            '/api/users/login/',
            {'username': 'ctl_buyer', 'password': self.password},
            format='json',
        )
        self.assertEqual(denied.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.post(_reactivate_url(self.buyer.pk))
        ok = APIClient().post(
            '/api/users/login/',
            {'username': 'ctl_buyer', 'password': self.password},
            format='json',
        )
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertIn('token', ok.data)

    def test_cannot_reactivate_staff(self):
        response = self.client.post(_reactivate_url(self.other_staff.pk))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_no_delete_or_patch_on_admin_user_detail(self):
        delete = self.client.delete(_detail_url(self.buyer.pk))
        self.assertEqual(delete.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        patch = self.client.patch(
            _detail_url(self.buyer.pk),
            {
                'email': 'hacked@test.com',
                'is_staff': True,
                'is_superuser': True,
                'is_active': False,
                'role': 'ADMIN',
            },
            format='json',
        )
        self.assertEqual(patch.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.email, 'ctl_buyer@test.com')
        self.assertTrue(self.buyer.is_active)
        self.assertFalse(self.buyer.is_staff)


class AdminUserNotificationWebSocketTests(TransactionTestCase):
    """Inactive / revoked-token notification WS regressions for ADM-B09."""

    def setUp(self):
        self.password = 'pass12345'
        self.user = User.objects.create_user(
            username='ws_suspend_user',
            email='ws_suspend@test.com',
            password=self.password,
        )
        ensure_user_profile(self.user, role=UserProfile.Role.BUYER)
        self.token = issue_auth_token(self.user)
        self.admin = User.objects.create_user(
            username='ws_suspend_admin',
            email='ws_suspend_admin@test.com',
            password=self.password,
            is_staff=True,
        )
        self.admin_token = issue_auth_token(self.admin)

    def _connect(self):
        return WebsocketCommunicator(application, WS_PATH, headers=WS_HEADERS)

    def test_inactive_user_token_handshake_rejected(self):
        # Keep token row to prove is_active gate (not only deletion).
        key = self.token.key
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        self.assertTrue(Token.objects.filter(key=key).exists())

        async def scenario():
            communicator = self._connect()
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.send_json_to(
                {'type': 'authenticate', 'token': key}
            )
            err = await communicator.receive_json_from(timeout=2)
            self.assertEqual(err['type'], 'error')
            self.assertEqual(err['code'], 'authentication_failed')
            closed = await communicator.receive_output(timeout=2)
            self.assertEqual(closed['type'], 'websocket.close')
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_old_token_rejected_on_ws_after_suspend_and_reactivate(self):
        old_key = self.token.key
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {self.admin_token.key}')
        suspend = client.post(_suspend_url(self.user.pk))
        self.assertEqual(suspend.status_code, status.HTTP_200_OK)
        self.assertFalse(Token.objects.filter(key=old_key).exists())

        reactivate = client.post(_reactivate_url(self.user.pk))
        self.assertEqual(reactivate.status_code, status.HTTP_200_OK)
        self.assertFalse(Token.objects.filter(key=old_key).exists())

        async def scenario():
            communicator = self._connect()
            await communicator.connect()
            await communicator.send_json_to(
                {'type': 'authenticate', 'token': old_key}
            )
            err = await communicator.receive_json_from(timeout=2)
            self.assertEqual(err['code'], 'authentication_failed')
            await communicator.disconnect()

        async_to_sync(scenario)()

        login = APIClient().post(
            '/api/users/login/',
            {'username': 'ws_suspend_user', 'password': self.password},
            format='json',
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        new_key = login.data['token']

        async def scenario_ok():
            communicator = self._connect()
            await communicator.connect()
            await communicator.send_json_to(
                {'type': 'authenticate', 'token': new_key}
            )
            auth = await communicator.receive_json_from(timeout=2)
            self.assertEqual(auth['type'], 'authenticated')
            self.assertEqual(auth['user_id'], self.user.pk)
            await communicator.disconnect()

        async_to_sync(scenario_ok)()


class AdminUserControlIntegrityTests(APITestCase):
    """ADM-H09: lifecycle integrity + private-surface enforcement after suspend."""

    def setUp(self):
        self.password = 'secure-pass-123'
        self.admin = User.objects.create_user(
            username='h09_admin',
            email='h09_admin@test.com',
            password=self.password,
            is_staff=True,
        )
        self.admin_token = issue_auth_token(self.admin)

        self.buyer = User.objects.create_user(
            username='h09_buyer',
            email='h09_buyer@test.com',
            password=self.password,
        )
        ensure_user_profile(self.buyer, role=UserProfile.Role.BUYER)
        self.buyer_token = issue_auth_token(self.buyer)

        self.seller = User.objects.create_user(
            username='h09_seller',
            email='h09_seller@test.com',
            password=self.password,
        )
        ensure_user_profile(self.seller, role=UserProfile.Role.SELLER)
        self.seller_token = issue_auth_token(self.seller)

        now = timezone.now()
        self.product = Product.objects.create(
            seller=self.seller,
            title='H09 Lifecycle Item',
            description='integrity',
        )
        self.auction = Auction.objects.create(
            product=self.product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('150.00'),
            min_increment=Decimal('10.00'),
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(minutes=1),
            status=Auction.Status.ACTIVE,
        )
        self.bid = Bid.objects.create(
            auction=self.auction,
            bidder=self.buyer,
            amount=Decimal('150.00'),
        )

    def _admin_client(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {self.admin_token.key}')
        return client

    def test_put_admin_user_detail_not_allowed(self):
        client = self._admin_client()
        response = client.put(
            _detail_url(self.buyer.pk),
            {'email': 'hacked@test.com', 'is_staff': True},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.email, 'h09_buyer@test.com')
        self.assertFalse(self.buyer.is_staff)

    def test_staff_with_buyer_profile_cannot_be_suspended(self):
        staff_buyer = User.objects.create_user(
            username='h09_staff_buyer_profile',
            email='h09_staff_buyer@test.com',
            password=self.password,
            is_staff=True,
        )
        ensure_user_profile(staff_buyer, role=UserProfile.Role.BUYER)
        token = issue_auth_token(staff_buyer)

        client = self._admin_client()
        response = client.post(_suspend_url(staff_buyer.pk))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        staff_buyer.refresh_from_db()
        self.assertTrue(staff_buyer.is_active)
        self.assertTrue(Token.objects.filter(key=token.key).exists())

    def test_non_admin_cannot_search_admin_users_email(self):
        buyer_client = APIClient()
        buyer_client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.buyer_token.key}'
        )
        response = buyer_client.get(LIST_URL, {'search': 'h09_buyer@test.com'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotIn('h09_buyer@test.com', str(response.data))

    def test_suspended_buyer_old_token_blocked_from_private_surfaces(self):
        old_key = self.buyer_token.key
        self._admin_client().post(_suspend_url(self.buyer.pk))
        self.assertFalse(Token.objects.filter(key=old_key).exists())

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {old_key}')

        me = client.get('/api/users/me/')
        self.assertEqual(me.status_code, status.HTTP_401_UNAUTHORIZED)

        bid = client.post(
            f'/api/auctions/{self.auction.pk}/place-bid/',
            {'amount': '200.00'},
            format='json',
        )
        self.assertEqual(bid.status_code, status.HTTP_401_UNAUTHORIZED)

        notes = client.get('/api/notifications/')
        self.assertEqual(notes.status_code, status.HTTP_401_UNAUTHORIZED)

        # Keep historical bid intact despite failed new bid attempt.
        self.assertTrue(
            Bid.objects.filter(pk=self.bid.pk, amount=Decimal('150.00')).exists()
        )

    def test_suspended_seller_old_token_blocked_from_private_and_ai(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        old_key = self.seller_token.key
        self._admin_client().post(_suspend_url(self.seller.pk))

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {old_key}')

        listings = client.get('/api/products/my-listings/')
        self.assertEqual(listings.status_code, status.HTTP_401_UNAUTHORIZED)

        create = client.post(
            '/api/products/',
            {
                'title': 'Should Fail',
                'description': 'suspended',
                'condition': 'USED_GOOD',
            },
            format='json',
        )
        self.assertEqual(create.status_code, status.HTTP_401_UNAUTHORIZED)

        ai = client.post(
            '/api/products/generate-description/',
            {
                'title': 'Camera',
                'image': SimpleUploadedFile(
                    'x.jpg',
                    b'\xff\xd8\xff\xd9',
                    content_type='image/jpeg',
                ),
            },
            format='multipart',
        )
        self.assertEqual(ai.status_code, status.HTTP_401_UNAUTHORIZED)

        self.assertTrue(Product.objects.filter(pk=self.product.pk).exists())
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.status, Auction.Status.ACTIVE)

    def test_suspended_seller_auction_still_closes_and_suspended_buyer_can_win(self):
        from auctions.services import AuctionLifecycleService
        from notifications.models import Notification

        # Both marketplace parties suspended; server-side close must still run.
        self._admin_client().post(_suspend_url(self.seller.pk))
        self._admin_client().post(_suspend_url(self.buyer.pk))
        self.seller.refresh_from_db()
        self.buyer.refresh_from_db()
        self.assertFalse(self.seller.is_active)
        self.assertFalse(self.buyer.is_active)

        with self.captureOnCommitCallbacks(execute=True):
            auction, closed = AuctionLifecycleService.close_auction(
                self.auction.pk,
                source='expired',
            )
        self.assertTrue(closed)
        self.assertEqual(auction.status, Auction.Status.CLOSED)
        self.assertEqual(auction.winning_bidder_id, self.buyer.pk)
        self.assertTrue(
            Bid.objects.filter(pk=self.bid.pk, amount=Decimal('150.00')).exists()
        )

        # Durable won notification may still be persisted for later reactivation.
        self.assertTrue(
            Notification.objects.filter(
                user=self.buyer,
                type=Notification.Type.AUCTION_WON,
                auction=self.auction,
            ).exists()
        )

    def test_suspended_winner_cannot_checkout_with_old_or_no_token(self):
        from auctions.services import AuctionLifecycleService

        self._admin_client().post(_suspend_url(self.buyer.pk))
        old_key = self.buyer_token.key
        AuctionLifecycleService.close_auction(self.auction.pk, source='expired')
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.winning_bidder_id, self.buyer.pk)

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {old_key}')
        denied = client.post(f'/api/auctions/{self.auction.pk}/checkout/')
        self.assertEqual(denied.status_code, status.HTTP_401_UNAUTHORIZED)

        self.auction.refresh_from_db()
        self.assertFalse(self.auction.is_paid)

    def test_reactivate_does_not_issue_token(self):
        self._admin_client().post(_suspend_url(self.buyer.pk))
        self.assertFalse(Token.objects.filter(user=self.buyer).exists())
        response = self._admin_client().post(_reactivate_url(self.buyer.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_active'])
        self.assertFalse(Token.objects.filter(user=self.buyer).exists())
        self.assertNotIn('token', response.data)
