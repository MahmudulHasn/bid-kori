"""One-off SHOW-D01 verification helper (not part of manage.py test)."""

import os

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from auctions.demo_marketplace import DEMO_TITLE_PREFIX
from auctions.models import Auction, Payment
from notifications.models import Notification
from products.models import Product

User = get_user_model()
buyer = User.objects.get(username='demo_buyer_a')
seller = User.objects.get(username='demo_seller_electronics')
admin = User.objects.get(username='demo_admin')

for user in (buyer, seller, admin):
    Token.objects.filter(user=user).delete()
bt = Token.objects.create(user=buyer)
st = Token.objects.create(user=seller)
at = Token.objects.create(user=admin)

client = APIClient()
response = client.get('/api/auctions/')
payload = response.data
results = payload['results'] if isinstance(payload, dict) and 'results' in payload else payload
print('PUBLIC_AUCTIONS', len(results), 'HTTP', response.status_code)
print(
    'ACTIVE_DEMO',
    Auction.objects.filter(
        product__title__startswith=DEMO_TITLE_PREFIX,
        status=Auction.Status.ACTIVE,
        is_hidden=False,
    ).count(),
)
print(
    'PRODUCTS',
    Product.objects.filter(title__startswith=DEMO_TITLE_PREFIX).count(),
)

client.credentials(HTTP_AUTHORIZATION=f'Token {bt.key}')
my_bids = client.get('/api/auctions/my-bids/')
mb = my_bids.data
mb_list = mb['results'] if isinstance(mb, dict) and 'results' in mb else mb
print('MY_BIDS', len(mb_list), 'HTTP', my_bids.status_code)
won = Auction.objects.filter(
    winning_bidder=buyer,
    status=Auction.Status.CLOSED,
    product__title__startswith=DEMO_TITLE_PREFIX,
)
print('WON', won.count(), 'paid', won.filter(is_paid=True).count(), 'unpaid', won.filter(is_paid=False).count())
print('BUYER_NOTIFS', Notification.objects.filter(user=buyer).count())
print('OUTBID', Notification.objects.filter(user=buyer, type='OUTBID').count())
print('AUCTION_WON', Notification.objects.filter(user=buyer, type='AUCTION_WON').count())
print('AUCTION_LOST', Notification.objects.filter(user=buyer, type='AUCTION_LOST').count())

client.credentials(HTTP_AUTHORIZATION=f'Token {st.key}')
listings = client.get('/api/products/my-listings/')
lp = listings.data
lp_list = lp['results'] if isinstance(lp, dict) and 'results' in lp else lp
print('SELLER_PRODUCTS', len(lp_list), 'HTTP', listings.status_code)
print(
    'SELLER_AUCTIONS',
    Auction.objects.filter(
        product__seller=seller,
        product__title__startswith=DEMO_TITLE_PREFIX,
    ).count(),
)
print(
    'SELLER_COMPLETED_PAYMENTS',
    Payment.objects.filter(
        auction__product__seller=seller,
        status=Payment.Status.COMPLETED,
    ).count(),
)

client.credentials(HTTP_AUTHORIZATION=f'Token {at.key}')
analytics = client.get('/api/auctions/analytics/')
print('ANALYTICS_HTTP', analytics.status_code)
if analytics.status_code == 200:
    data = analytics.data
    for key in (
        'platform_revenue',
        'completed_payments',
        'gross_gmv',
        'gross_volume',
        'active_auctions',
        'total_auctions',
        'total_revenue',
    ):
        if key in data:
            print(key, data[key])
    if isinstance(data, dict):
        print('ANALYTICS_TOP_KEYS', list(data.keys())[:15])
