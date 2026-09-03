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
