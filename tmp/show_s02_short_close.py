from datetime import timedelta
from decimal import Decimal
from django.contrib.auth.models import User
from django.utils import timezone
from products.models import Product, Category
from auctions.models import Auction
from auctions.services import BidService
from auctions.tasks import close_expired_auctions_task
import time

buyer_a = User.objects.get(username='demo_buyer_a')
buyer_b = User.objects.get(username='demo_buyer_b')
seller = User.objects.get(username='demo_seller_electronics')
cat = Category.objects.filter(name='Smartphones').first()
p = Product.objects.create(
    seller=seller,
    category=cat,
    title='[DEMO] Showcase Close Probe',
    description='SHOW-S02 short celery close',
    condition='USED_GOOD',
)
now = timezone.now()
a = Auction.objects.create(
    product=p,
    start_time=now - timedelta(minutes=1),
    end_time=now + timedelta(seconds=70),
    starting_bid=Decimal('100.00'),
    min_increment=Decimal('10.00'),
    status='ACTIVE',
)
BidService.place_bid(auction_id=a.id, bidder=buyer_a, amount=Decimal('110.00'))
BidService.place_bid(auction_id=a.id, bidder=buyer_b, amount=Decimal('120.00'))
print('SHORT_AUCTION', a.id, 'end', a.end_time.isoformat())
print('waiting for beat/worker...')
# wait past end + beat interval
deadline = time.time() + 100
while time.time() < deadline:
    a.refresh_from_db()
    if a.status == 'CLOSED':
        print('CLOSED_BY_RUNTIME', a.status, 'winner', getattr(a.winning_bidder, 'username', None))
        break
    time.sleep(5)
else:
    print('NOT_CLOSED_YET', a.status)
    res = close_expired_auctions_task()
    print('MANUAL_TASK', res)
    a.refresh_from_db()
    print('AFTER_MANUAL', a.status, getattr(a.winning_bidder, 'username', None))
