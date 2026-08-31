from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Auction for {self.product} ({self.get_status_display()})'

    def is_active(self):
        """Return True when the auction is ACTIVE and has not yet ended."""
        return self.status == self.Status.ACTIVE and timezone.now() < self.end_time

    def update_status_by_time(self):
        """Close an ACTIVE auction once its end time has passed.

        Persists any change and returns True if the status was updated.
        """
        if self.status == self.Status.ACTIVE and timezone.now() >= self.end_time:
            self.status = self.Status.CLOSED
            self.save(update_fields=['status'])
            return True

        return False


class AuctionImage(models.Model):
    """An uploaded image attached to an auction listing."""

    auction = models.ForeignKey(
        Auction,
        related_name='images',
        on_delete=models.CASCADE,
    )
    image = models.ImageField(upload_to='auction_images/')
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
    """Mock payment record for a completed auction checkout."""

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

    def __str__(self):
        return f'Payment {self.transaction_id or self.pk} ({self.status})'
