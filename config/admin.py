import json
from decimal import Decimal

from django.contrib.admin import AdminSite
from django.contrib.auth.admin import GroupAdmin, UserAdmin
from django.contrib.auth.models import Group, User
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import Avg, Count, F, Sum
from django.utils import timezone
from rest_framework.authtoken.admin import TokenAdmin
from rest_framework.authtoken.models import Token


class BidKoriAdminSite(AdminSite):
    """Custom admin site with platform analytics on the dashboard index."""

    site_header = 'BidKori Administration'
    site_title = 'BidKori Admin'
    index_title = 'Platform Analytics Dashboard'

    def index(self, request, extra_context=None):
        from auctions.models import Auction, Bid

        extra_context = extra_context or {}
        now = timezone.now()

        total_active_auctions = Auction.objects.filter(
            status=Auction.Status.ACTIVE,
            end_time__gt=now,
        ).count()

        total_bids_placed = Bid.objects.count()

        volume_aggregate = Auction.objects.aggregate(
            total_bidding_volume=Sum('current_highest_bid'),
        )
        total_bidding_volume = volume_aggregate['total_bidding_volume'] or Decimal('0.00')

        growth_aggregate = Auction.objects.aggregate(
            average_price_growth=Avg(F('current_highest_bid') - F('starting_bid')),
        )
        average_price_growth = growth_aggregate['average_price_growth'] or Decimal('0.00')

        recent_bids = list(
            Bid.objects.select_related('bidder', 'auction')
            .order_by('-timestamp')[:5]
            .values(
                'id',
                'bidder__username',
                'amount',
                'timestamp',
                'auction_id',
            )
        )

        category_data = [
            {
                'category': row['product__category__name'] or 'Uncategorized',
                'avg_starting_price': float(row['avg_starting_price'] or 0),
                'avg_highest_bid': float(row['avg_highest_bid'] or 0),
                'auction_count': row['auction_count'],
            }
            for row in Auction.objects.select_related('product__category')
            .values('product__category__name')
            .annotate(
                avg_starting_price=Avg('starting_bid'),
                avg_highest_bid=Avg('current_highest_bid'),
                auction_count=Count('id'),
            )
            .order_by('product__category__name')
        ]

        bid_trend = [
            {
                'amount': float(bid['amount']),
                'timestamp': bid['timestamp'].isoformat(),
                'auction_id': bid['auction_id'],
            }
            for bid in Bid.objects.order_by('timestamp')
            .values('amount', 'timestamp', 'auction_id')[:50]
        ]

        extra_context.update(
            {
                'total_active_auctions': total_active_auctions,
                'total_bids_placed': total_bids_placed,
                'total_bidding_volume': total_bidding_volume,
                'average_price_growth': average_price_growth,
                'recent_bids': recent_bids,
                'category_data': category_data,
                'category_data_json': json.dumps(category_data, cls=DjangoJSONEncoder),
                'bid_trend_json': json.dumps(bid_trend, cls=DjangoJSONEncoder),
            }
        )

        return super().index(request, extra_context)


bidkori_admin_site = BidKoriAdminSite(name='admin')

bidkori_admin_site.register(User, UserAdmin)
bidkori_admin_site.register(Group, GroupAdmin)
bidkori_admin_site.register(Token, TokenAdmin)
