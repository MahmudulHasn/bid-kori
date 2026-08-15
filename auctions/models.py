from django.db import models
from django.utils import timezone


class Auction(models.Model):
    """An auction listing for a single product, tracking its bidding lifecycle."""

    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        SCHEDULED = 'SCHEDULED', 'Scheduled'
        LIVE = 'LIVE', 'Live'
        ENDED = 'ENDED', 'Ended'
        WINNER_VALIDATION = 'WINNER_VALIDATION', 'Winner Validation'
        READY_TO_SHIP = 'READY_TO_SHIP', 'Ready to Ship'
        COMPLETED = 'COMPLETED', 'Completed'
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
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    is_featured = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Auction for {self.product} ({self.get_status_display()})'

    def update_status_by_time(self):
        """Advance the auction status based on the current time.

        Transitions a SCHEDULED auction to LIVE once its start time has
        passed, and a LIVE auction to ENDED once its end time has passed.
        Persists any change and returns True if the status was updated.
        """
        now = timezone.now()

        if self.status == self.Status.SCHEDULED and now >= self.start_time:
            self.status = self.Status.LIVE
            self.save(update_fields=['status'])
            return True

        if self.status == self.Status.LIVE and now >= self.end_time:
            self.status = self.Status.ENDED
            self.save(update_fields=['status'])
            return True

        return False
