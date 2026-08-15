from django.contrib import admin

from .models import Auction, Bid


@admin.register(Auction)
class AuctionAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'product',
        'status',
        'current_highest_bid',
        'winning_bidder',
        'start_time',
        'end_time',
    )
    list_filter = ('status', 'is_featured')
    search_fields = ('product__title', 'winning_bidder__username')
    raw_id_fields = ('product', 'winning_bidder')
    readonly_fields = ('created_at',)


@admin.register(Bid)
class BidAdmin(admin.ModelAdmin):
    list_display = ('id', 'auction', 'bidder', 'amount', 'timestamp')
    list_filter = ('timestamp',)
    search_fields = ('bidder__username', 'auction__product__title')
    raw_id_fields = ('auction', 'bidder')
    readonly_fields = ('timestamp', 'updated_at')
