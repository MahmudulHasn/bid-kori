from datetime import timedelta

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from auctions.models import Auction
from notifications.models import Notification
from products.models import Product


class NotificationAPITests(APITestCase):
    """NT-B01: persistent inbox list / read / read-all with user isolation."""

    list_url = '/api/notifications/'
    read_all_url = '/api/notifications/read-all/'

    def setUp(self):
        self.user_a = User.objects.create_user(
            username='buyer_a',
            email='a@test.com',
            password='pass-a-12345',
        )
        self.user_b = User.objects.create_user(
            username='buyer_b',
            email='b@test.com',
            password='pass-b-12345',
        )
        self.seller = User.objects.create_user(
            username='seller_n',
            email='seller@test.com',
            password='pass-s-12345',
        )
        self.token_a = Token.objects.create(user=self.user_a)
        self.token_b = Token.objects.create(user=self.user_b)

        now = timezone.now()
        product = Product.objects.create(
            seller=self.seller,
            title='Notify Product',
            description='for notification tests',
        )
        self.auction = Auction.objects.create(
            product=product,
            starting_bid=100,
            current_highest_bid=100,
            min_increment=10,
            start_time=now + timedelta(hours=1),
            end_time=now + timedelta(days=2),
            status=Auction.Status.ACTIVE,
        )

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def _notify(self, user, *, ntype=Notification.Type.OUTBID, title='t', message='m', **kwargs):
        return Notification.objects.create(
            user=user,
            type=ntype,
            title=title,
            message=message,
            auction=kwargs.get('auction', self.auction),
            is_read=kwargs.get('is_read', False),
        )

    def test_unauthenticated_list_rejected(self):
        response = self.client.get(self.list_url)
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_authenticated_list_own_notifications(self):
        self._notify(self.user_a, title='Yours')
        self._auth(self.token_a)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['title'], 'Yours')
        self.assertEqual(response.data['results'][0]['type'], Notification.Type.OUTBID)
        self.assertEqual(response.data['results'][0]['auction_id'], self.auction.pk)
        self.assertFalse(response.data['results'][0]['is_read'])
        self.assertNotIn('user', response.data['results'][0])

    def test_user_isolation_list(self):
        self._notify(self.user_a, title='A only')
        self._notify(self.user_b, title='B only')

        self._auth(self.token_a)
        response_a = self.client.get(self.list_url)
        self.assertEqual(response_a.data['count'], 1)
        self.assertEqual(response_a.data['results'][0]['title'], 'A only')

        self._auth(self.token_b)
        response_b = self.client.get(self.list_url)
        self.assertEqual(response_b.data['count'], 1)
        self.assertEqual(response_b.data['results'][0]['title'], 'B only')

    def test_cannot_read_another_users_notification(self):
        other = self._notify(self.user_b, title='Secret')
        self._auth(self.token_a)
        response = self.client.post(f'/api/notifications/{other.pk}/read/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        other.refresh_from_db()
        self.assertFalse(other.is_read)
        self.assertNotIn('Secret', str(response.data))

    def test_ordering_newest_first_stable(self):
        older = self._notify(self.user_a, title='Older')
        newer = self._notify(self.user_a, title='Newer')
        # Force identical created_at; Meta ordering falls back to -id.
        Notification.objects.filter(pk__in=[older.pk, newer.pk]).update(
            created_at=timezone.now(),
        )
        self._auth(self.token_a)
        response = self.client.get(self.list_url)
        titles = [row['title'] for row in response.data['results']]
        self.assertEqual(titles, ['Newer', 'Older'])

    def test_pagination_page_size_20(self):
        for i in range(25):
            self._notify(self.user_a, title=f'N{i:02d}')
        # Other user's rows must not bleed into pagination.
        for i in range(5):
            self._notify(self.user_b, title=f'B{i}')

        self._auth(self.token_a)
        page1 = self.client.get(self.list_url)
        self.assertEqual(page1.status_code, status.HTTP_200_OK)
        self.assertEqual(page1.data['count'], 25)
        self.assertEqual(len(page1.data['results']), 20)
        self.assertIsNotNone(page1.data['next'])

        page2 = self.client.get(self.list_url, {'page': 2})
        self.assertEqual(page2.status_code, status.HTTP_200_OK)
        self.assertEqual(len(page2.data['results']), 5)
        titles = {row['title'] for row in page1.data['results']} | {
            row['title'] for row in page2.data['results']
        }
        self.assertTrue(all(t.startswith('N') for t in titles))

    def test_mark_read_idempotent(self):
        note = self._notify(self.user_a, title='Unread')
        self._auth(self.token_a)
        url = f'/api/notifications/{note.pk}/read/'

        first = self.client.post(url)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertTrue(first.data['is_read'])
        self.assertEqual(first.data['id'], note.pk)

        second = self.client.post(url)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(second.data['is_read'])
        note.refresh_from_db()
        self.assertTrue(note.is_read)

    def test_read_all_marks_only_own_rows(self):
        a1 = self._notify(self.user_a, title='A1')
        a2 = self._notify(self.user_a, title='A2')
        a_read = self._notify(self.user_a, title='A already', is_read=True)
        b1 = self._notify(self.user_b, title='B1')

        self._auth(self.token_a)
        response = self.client.post(self.read_all_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['updated'], 2)

        a1.refresh_from_db()
        a2.refresh_from_db()
        a_read.refresh_from_db()
        b1.refresh_from_db()
        self.assertTrue(a1.is_read)
        self.assertTrue(a2.is_read)
        self.assertTrue(a_read.is_read)
        self.assertFalse(b1.is_read)

    def test_post_list_create_not_allowed(self):
        self._auth(self.token_a)
        response = self.client.post(
            self.list_url,
            {
                'type': Notification.Type.AUCTION_WON,
                'title': 'Fake win',
                'message': 'should not work',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(Notification.objects.filter(user=self.user_a).count(), 0)

    def test_delete_not_allowed(self):
        note = self._notify(self.user_a, title='Keep')
        self._auth(self.token_a)
        response = self.client.delete(f'/api/notifications/{note.pk}/')
        self.assertIn(
            response.status_code,
            (status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED),
        )
        self.assertTrue(Notification.objects.filter(pk=note.pk).exists())

    def test_auction_set_null_preserves_notification(self):
        note = self._notify(self.user_a, title='Linked', auction=self.auction)
        auction_id = self.auction.pk
        # ORM delete (API deletion policy does not apply here).
        self.auction.delete()
        note.refresh_from_db()
        self.assertTrue(Notification.objects.filter(pk=note.pk).exists())
        self.assertIsNone(note.auction_id)
        self.assertFalse(Auction.objects.filter(pk=auction_id).exists())

    def test_mvp_type_choices(self):
        for ntype in Notification.Type.values:
            note = self._notify(self.user_a, ntype=ntype, title=ntype)
            self.assertEqual(note.type, ntype)
        self.assertEqual(
            set(Notification.Type.values),
            {
                'OUTBID',
                'AUCTION_WON',
                'AUCTION_LOST',
                'SELLER_NEW_BID',
            },
        )
