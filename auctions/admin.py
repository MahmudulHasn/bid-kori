from django.contrib import admin

from config.admin import bidkori_admin_site

from .models import Auction, Bid


@admin.register(Auction, site=bidkori_admin_site)
class AuctionAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'product',
        'current_highest_bid',
        'status',
        'end_time',
        'winning_bidder',
    )
    list_filter = ('status',)
    search_fields = ('product__title',)


@admin.register(Bid, site=bidkori_admin_site)
class BidAdmin(admin.ModelAdmin):
    list_display = ('id', 'auction', 'bidder', 'amount', 'timestamp')
    list_filter = ('timestamp',)
    search_fields = ('bidder__username',)
