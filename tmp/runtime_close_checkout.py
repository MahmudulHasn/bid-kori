from datetime import timedelta
from decimal import Decimal
from django.contrib.auth.models import User
from django.utils import timezone
from products.models import Product, Category
from auctions.models import Auction
from auctions.services import BidService
from auctions.tasks import close_expired_auctions_task
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient
import time

buyer = User.objects.get(username='demo_buyer_a')
seller = User.objects.get(username='demo_seller_electronics')
cat = Category.objects.first()
p = Product.objects.create(
    seller=seller,
    category=cat,
    title='[DEMO] Runtime Close Probe',
    description='celery close probe',
    condition='USED_GOOD',
)
now = timezone.now()
a = Auction.objects.create(
    product=p,
    start_time=now - timedelta(minutes=2),
    end_time=now + timedelta(seconds=8),
    starting_bid=Decimal('100.00'),
    min_increment=Decimal('10.00'),
    status='ACTIVE',
)
BidService.place_bid(auction_id=a.id, bidder=buyer, amount=Decimal('110.00'))
print('CREATED_AUCTION', a.id, 'end', a.end_time.isoformat())
time.sleep(12)
res = close_expired_auctions_task()
print('TASK_RESULT', res)
a.refresh_from_db()
print('AFTER_STATUS', a.status, 'winner', getattr(a.winning_bidder, 'username', None), 'paid', a.is_paid)

token = Token.objects.get(user=buyer)
client = APIClient()
client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
if a.status == 'CLOSED' and not a.is_paid:
    r = client.post(f'/api/auctions/{a.id}/checkout/')
    print('CHECKOUT', r.status_code, getattr(r, 'data', r.content))
    a.refresh_from_db()
    print('PAID', a.is_paid)
else:
    print('SKIP_CHECKOUT', a.status, a.is_paid)
