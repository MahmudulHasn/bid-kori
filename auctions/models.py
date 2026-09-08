from django.contrib.auth.models import User
from django.db import models
from django.db.models import Q
from django.utils import timezone

from .image_validation import validate_auction_image


class Auction(models.Model):
    """An auction listing for a single product, tracking its bidding lifecycle."""

    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Active'
        CLOSED = 'CLOSED', 'Closed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    product = models.OneToOneField(
        'products.Product',
        related_name='auction',
        on_delete=models.CASCADE,
    )
    starting_bid = models.DecimalField(max_digits=10, decimal_places=2)
    current_highest_bid = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
    )
    min_increment = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=100.00,
    )
    reserve_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    winning_bidder = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='won_auctions',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    is_featured = models.BooleanField(default=False)
    is_paid = models.BooleanField(default=False)
    is_hidden = models.BooleanField(default=False)
    moderation_reason = models.TextField(blank=True, default='')
    moderated_at = models.DateTimeField(null=True, blank=True)
    moderated_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='moderated_auctions',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Auction for {self.product} ({self.get_status_display()})'

    def is_biddable(self, now=None):
        """Return True when the auction accepts bids (ACTIVE and in window)."""
        if now is None:
            now = timezone.now()
        return (
            self.status == self.Status.ACTIVE
            and self.start_time <= now
            and now < self.end_time
        )

    def is_active(self):
        """Return True when the auction is open for bidding."""
        return self.is_biddable()

    def update_status_by_time(self):
        """Close an expired ACTIVE auction via the authoritative lifecycle service.

        Returns True when the auction was closed by this call.
        """
        from .services import AuctionLifecycleService

        _, closed = AuctionLifecycleService.close_if_expired(self.pk)
        if closed:
            self.refresh_from_db()
        return closed


class AuctionImage(models.Model):
    """An uploaded image attached to an auction listing."""

    auction = models.ForeignKey(
        Auction,
        related_name='images',
        on_delete=models.CASCADE,
    )
    image = models.ImageField(
        upload_to='auction_images/',
        validators=[validate_auction_image],
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['uploaded_at']

    def __str__(self):
        return f'Image {self.pk} for {self.auction}'


class Bid(models.Model):
    """A single bid placed by a registered user on an auction."""

    auction = models.ForeignKey(
        Auction,
        related_name='bids',
        on_delete=models.CASCADE,
    )
    bidder = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='bids',
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    timestamp = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-amount']

    def __str__(self):
        return f'{self.bidder} bid {self.amount} on {self.auction}'


class Payment(models.Model):
    """Mock checkout ledger row for a won auction (not gateway settlement).

    A COMPLETED Payment means BidKori recorded the sale as paid in the mock
    accounting ledger. It does **not** mean bank settlement, gateway capture,
    seller payout, or external cash receipt.

    ``amount`` is the gross winning sale amount paid by the Buyer.

    ``fee_rate`` / ``platform_fee`` / ``seller_net_amount`` are immutable
    seller-side successful-sale commission snapshots written only when a new
    checkout completes. Legacy rows created before fee policy may leave these
    null — financial aggregates must ignore null-snapshot rows rather than
    invent historical revenue.
    """

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        COMPLETED = 'COMPLETED', 'Completed'
        FAILED = 'FAILED', 'Failed'

    auction = models.OneToOneField(
        Auction,
        on_delete=models.CASCADE,
        related_name='payment',
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='payments',
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    fee_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Snapshot of PLATFORM_SUCCESS_FEE_PERCENT at checkout (%).',
    )
    platform_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Seller-side commission snapshot (immutable).',
    )
    seller_net_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Gross minus platform_fee at checkout (immutable).',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    transaction_id = models.CharField(max_length=100, unique=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                condition=Q(fee_rate__isnull=True)
                | (Q(fee_rate__gte=0) & Q(fee_rate__lte=100)),
                name='payment_fee_rate_range',
            ),
            models.CheckConstraint(
                condition=Q(platform_fee__isnull=True) | Q(platform_fee__gte=0),
                name='payment_platform_fee_non_negative',
            ),
            models.CheckConstraint(
                condition=Q(seller_net_amount__isnull=True)
                | Q(seller_net_amount__gte=0),
                name='payment_seller_net_non_negative',
            ),
            models.CheckConstraint(
                condition=Q(platform_fee__isnull=True)
                | Q(platform_fee__lte=models.F('amount')),
                name='payment_platform_fee_lte_amount',
            ),
        ]

    def __str__(self):
        return f'Payment {self.transaction_id or self.pk} ({self.status})'
