from django.contrib import admin

from config.admin import bidkori_admin_site

from .models import (
    Auction,
    AuctionImage,
    Bid,
    Payment,
    WinnerDetailsUnlock,
    WinnerFulfillmentDetails,
)


class AuctionImageInline(admin.TabularInline):
    model = AuctionImage
    extra = 1


@admin.register(Auction, site=bidkori_admin_site)
class AuctionAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'product',
        'current_highest_bid',
        'status',
        'is_paid',
        'end_time',
        'winning_bidder',
    )
    list_filter = ('status', 'is_paid')
    search_fields = ('product__title',)
    inlines = [AuctionImageInline]


@admin.register(AuctionImage, site=bidkori_admin_site)
class AuctionImageAdmin(admin.ModelAdmin):
    list_display = ('id', 'auction', 'image', 'uploaded_at')
    list_filter = ('uploaded_at',)
    search_fields = ('auction__product__title',)


@admin.register(Bid, site=bidkori_admin_site)
class BidAdmin(admin.ModelAdmin):
    list_display = ('id', 'auction', 'bidder', 'amount', 'timestamp')
    list_filter = ('timestamp',)
    search_fields = ('bidder__username',)


@admin.register(Payment, site=bidkori_admin_site)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'auction',
        'user',
        'amount',
        'status',
        'transaction_id',
        'created_at',
    )
    list_filter = ('status', 'created_at')
    search_fields = ('transaction_id', 'user__username', 'auction__product__title')


@admin.register(WinnerFulfillmentDetails, site=bidkori_admin_site)
class WinnerFulfillmentDetailsAdmin(admin.ModelAdmin):
    """Admin registration with minimal list columns to avoid exposing sensitive PII broadly."""

    list_display = (
        'id',
        'auction',
        'buyer',
        'status',
        'completed_step',
        'submitted_at',
        'created_at',
    )
    list_filter = ('status', 'completed_step')
    search_fields = ('auction__product__title', 'buyer__username')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(WinnerDetailsUnlock, site=bidkori_admin_site)
class WinnerDetailsUnlockAdmin(admin.ModelAdmin):
    """Admin registration for seller winner-details unlock entitlements."""

    list_display = (
        'id',
        'auction',
        'seller',
        'status',
        'fee_amount',
        'currency',
        'paid_at',
        'unlocked_at',
        'created_at',
    )
    list_filter = ('status', 'currency', 'created_at')
    search_fields = ('auction__product__title', 'seller__username', 'payment_reference')
    readonly_fields = ('created_at', 'updated_at', 'paid_at', 'unlocked_at')



