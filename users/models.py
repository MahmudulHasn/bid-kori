from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    """Application role for marketplace identity (BUYER or SELLER).

    ADMIN is never stored here. It is derived from Django ``is_staff`` /
    ``is_superuser`` when serializing identity responses.
    """

    class Role(models.TextChoices):
        BUYER = 'BUYER', 'Buyer'
        SELLER = 'SELLER', 'Seller'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
    )
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.BUYER,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['user_id']

    def __str__(self):
        return f'{self.user.username} ({self.role})'


def resolve_user_role(user) -> str:
    """Return the authoritative marketplace role for ``user``.

    Staff and superusers are always ADMIN, regardless of profile.role.
    Users without a profile default to BUYER (pre-role compatibility).
    """
    if user is None:
        return UserProfile.Role.BUYER
    if getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False):
        return 'ADMIN'
    try:
        return user.profile.role
    except UserProfile.DoesNotExist:
        return UserProfile.Role.BUYER


def ensure_user_profile(user, *, role: str | None = None) -> UserProfile:
    """Return the user's profile, creating one if missing.

    Defaults missing profiles to BUYER for backward compatibility with
    accounts created before the role system.
    """
    defaults = {'role': role or UserProfile.Role.BUYER}
    profile, _created = UserProfile.objects.get_or_create(
        user=user,
        defaults=defaults,
    )
    return profile


class SellerVerification(models.Model):
    """Seller identity verification for marketplace trust.

    Sellers must submit NID/Passport image, WhatsApp number, and location
    before they are allowed to create products. Admin staff review and
    approve or reject the submission.
    """

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='seller_verification',
    )
    nid_passport_image = models.ImageField(
        upload_to='seller_verification/',
        help_text='NID or Passport scan/photo for identity verification.',
    )
    whatsapp_number = models.CharField(
        max_length=20,
        help_text='WhatsApp contact number with country code.',
    )
    location = models.CharField(
        max_length=255,
        help_text='City or area for seller location.',
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )
    admin_note = models.TextField(
        blank=True,
        default='',
        help_text='Optional note from admin on approval or rejection.',
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='verified_sellers',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.username} — {self.status}'


def get_seller_verification_status(user) -> str | None:
    """Return the seller's verification status, or None if not submitted."""
    if user is None:
        return None
    role = resolve_user_role(user)
    if role != 'SELLER':
        return None
    return (
        SellerVerification.objects
        .filter(user=user)
        .values_list('status', flat=True)
        .first()
    )


