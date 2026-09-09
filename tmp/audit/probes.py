"""Audit-only reproductions. Uses a disposable in-memory test database."""
import os
import sys
import json
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.update(DJANGO_SETTINGS_MODULE='config.settings', DJANGO_TEST='1', DEBUG='True', DATABASE_URL='sqlite:///:memory:')
import django
django.setup()
from django.test import TestCase
from django.test.runner import DiscoverRunner
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from auctions.models import Auction, Bid, Payment
from auctions.serializers import AuctionSerializer
from auctions.views import PlaceBidView
from auctions.services import BidService
from products.models import Product
from config.admin import bidkori_admin_site


class AuditProbes(TestCase):
    def setUp(self):
        self.seller = User.objects.create_user(username='audit_seller')
        self.buyer = User.objects.create_user(username='audit_buyer')
        self.product = Product.objects.create(seller=self.seller, title='Audit')
        self.auction = Auction.objects.create(product=self.product, starting_bid=Decimal('1000'), current_highest_bid=Decimal('1000'), min_increment=Decimal('100'), start_time=timezone.now()-timedelta(minutes=1), end_time=timezone.now()+timedelta(hours=1))

    def test_malformed_and_overprecision_bids(self):
        for amount in ['NaN', 'Infinity', '10000000000', '1100.001']:
            with self.subTest(amount=amount):
                # Each candidate gets a savepoint; roll back to avoid cross-probe effects.
                from django.db import transaction
                with transaction.atomic():
                    request = APIRequestFactory().post('/api/auctions/1/place-bid/', {'amount': amount}, format='json')
                    force_authenticate(request, user=self.buyer)
                    try:
                        response = PlaceBidView(request, auction_id=self.auction.pk)
                        stored = list(Bid.objects.values_list('amount', flat=True))
                        print('PROBE', json.dumps({'amount':amount, 'status':response.status_code, 'response':response.data, 'stored':stored}, default=str))
                    except Exception as exc:
                        print('PROBE', json.dumps({'amount':amount, 'exception':type(exc).__name__}))
                    transaction.set_rollback(True)

    def test_starting_bid_edit(self):
        self.auction.start_time = timezone.now()+timedelta(hours=1)
        self.auction.end_time = timezone.now()+timedelta(hours=2)
        self.auction.save()
        serializer = AuctionSerializer(self.auction, data={'starting_bid':'5000.00'}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        edited = serializer.save()
        edited.start_time = timezone.now()-timedelta(minutes=1)
        edited.save(update_fields=['start_time'])
        bid = BidService.place_bid(edited.pk, self.buyer, Decimal('1100'))
        print('PROBE', json.dumps({'edited_starting_bid':str(edited.starting_bid),'current_highest_after_edit':str(edited.current_highest_bid),'accepted_bid_below_start':str(bid.amount)}))

    def test_admin_form_integrity_controls(self):
        admin_user = User.objects.create_superuser('audit_admin', password='audit-test-only')
        request = APIRequestFactory().get('/admin/')
        request.user = admin_user
        result = {}
        for model in [Auction, Bid, Payment, Product]:
            model_admin = bidkori_admin_site._registry[model]
            result[model.__name__] = {'editable_fields': list(model_admin.get_form(request).base_fields), 'can_delete':model_admin.has_delete_permission(request)}
        print('PROBE', json.dumps({'django_admin':result}))

    def test_anonymous_polling_quota(self):
        from django.core.cache import cache
        from auctions.views import AuctionDetailView
        cache.clear()
        codes = []
        for _ in range(101):
            request = APIRequestFactory().get('/api/auctions/1/')
            codes.append(AuctionDetailView(request, pk=self.auction.pk).status_code)
        print('PROBE', json.dumps({'anonymous_first_100_statuses': sorted(set(codes[:100])), 'request_101_status': codes[100]}))


from django.test import TransactionTestCase

class AuditSocketProbes(TransactionTestCase):
    def test_existing_private_socket_after_suspension(self):
        from asgiref.sync import async_to_sync
        from channels.db import database_sync_to_async
        from channels.testing import WebsocketCommunicator
        from channels.layers import get_channel_layer
        from rest_framework.authtoken.models import Token
        from users.account_control import suspend_marketplace_user
        from config.asgi import application
        user = User.objects.create_user(username='audit_socket_user')
        actor = User.objects.create_superuser(username='audit_socket_admin', password='audit-test-only')
        token = Token.objects.create(user=user)

        async def scenario():
            c = WebsocketCommunicator(application, '/ws/notifications/', headers=[(b'origin', b'http://localhost')])
            connected, _ = await c.connect()
            await c.send_json_to({'type':'authenticate','token':token.key})
            auth = await c.receive_json_from(timeout=2)
            await database_sync_to_async(suspend_marketplace_user)(actor=actor, target_id=user.pk)
            await get_channel_layer().group_send('user_'+str(user.pk), {'type':'notification.created','payload':{'type':'notification.created','audit_probe':True}})
            event = await c.receive_json_from(timeout=2)
            print('PROBE', json.dumps({'private_socket_connected':connected, 'authenticated':auth['type']=='authenticated', 'received_after_suspension':event.get('audit_probe',False)}))
            await c.disconnect()
        async_to_sync(scenario)()


if __name__ == '__main__':
    sys.exit(bool(DiscoverRunner(verbosity=1, interactive=False).run_tests(['__main__.AuditProbes','__main__.AuditSocketProbes'])))
