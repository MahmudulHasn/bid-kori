from django.conf import settings
from django.db import models


class Notification(models.Model):
    """Persistent in-app notification for one authenticated user.

    Rows are created by server-side domain services only (not via public REST).
    NT-B01 exposes list / read / read-all for the authenticated inbox.
    """

    class Type(models.TextChoices):
        OUTBID = 'OUTBID', 'Outbid'
        AUCTION_WON = 'AUCTION_WON', 'Auction Won'
        AUCTION_LOST = 'AUCTION_LOST', 'Auction Lost'
        SELLER_NEW_BID = 'SELLER_NEW_BID', 'Seller New Bid'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    type = models.CharField(max_length=32, choices=Type.choices)
    title = models.CharField(max_length=120)
    message = models.CharField(max_length=500)
    auction = models.ForeignKey(
        'auctions.Auction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='notifications',
    )
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['user', '-created_at'], name='notif_user_created_idx'),
            models.Index(fields=['user', 'is_read'], name='notif_user_is_read_idx'),
        ]

    def __str__(self):
        return f'{self.type} → {self.user_id} ({self.pk})'
