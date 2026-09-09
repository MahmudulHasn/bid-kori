"""Admin account-control helpers for reversible BUYER/SELLER suspension.

Uses Django ``User.is_active`` as the sole suspension flag and revokes DRF
tokens on suspend so reactivation cannot revive a prior token.
"""

from __future__ import annotations

from django.contrib.auth.models import User
from django.db import transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from config.db_locking import apply_select_for_update

from .auth_tokens import revoke_auth_token
from .models import UserProfile, resolve_user_role

PROTECTED_ACCOUNT_MESSAGE = (
    'This account cannot be suspended through Admin user controls.'
)
PROTECTED_REACTIVATE_MESSAGE = (
    'This account cannot be reactivated through Admin user controls.'
)


def _lock_user(user_id: int) -> User:
    queryset = User.objects.select_related('profile').filter(pk=user_id)
    queryset = apply_select_for_update(queryset)
    return queryset.get()


def assert_marketplace_account_controllable(
    *,
    actor: User,
    target: User,
    action: str,
) -> None:
    """Reject self / staff / superuser / ADMIN targets for suspend & reactivate.

    Raises ``PermissionDenied`` (403) for policy violations so Admin UI can
    treat protected targets uniformly.
    """
    message = (
        PROTECTED_ACCOUNT_MESSAGE
        if action == 'suspend'
        else PROTECTED_REACTIVATE_MESSAGE
    )

    if target.pk == actor.pk:
        raise PermissionDenied(message)
    if target.is_staff or target.is_superuser:
        raise PermissionDenied(message)

    role = resolve_user_role(target)
    if role == 'ADMIN':
        raise PermissionDenied(message)
    if role not in (
        UserProfile.Role.BUYER,
        UserProfile.Role.SELLER,
    ):
        raise PermissionDenied(message)


def suspend_marketplace_user(*, actor: User, target_id: int) -> User:
    """Deactivate a BUYER/SELLER and revoke their DRF token (idempotent)."""
    with transaction.atomic():
        target = _lock_user(target_id)
        assert_marketplace_account_controllable(
            actor=actor,
            target=target,
            action='suspend',
        )
        if target.is_active:
            target.is_active = False
            target.save(update_fields=['is_active'])
        revoke_auth_token(target)
        return target


def reactivate_marketplace_user(*, actor: User, target_id: int) -> User:
    """Reactivate a BUYER/SELLER without restoring or issuing a token."""
    with transaction.atomic():
        target = _lock_user(target_id)
        assert_marketplace_account_controllable(
            actor=actor,
            target=target,
            action='reactivate',
        )
        if not target.is_active:
            target.is_active = True
            target.save(update_fields=['is_active'])
        return target


def parse_is_active_query(raw: str | None) -> bool | None:
    """Parse ``is_active`` query values; raise ValidationError when invalid."""
    if raw is None or raw == '':
        return None
    value = str(raw).strip().lower()
    if value in {'true', '1'}:
        return True
    if value in {'false', '0'}:
        return False
    raise ValidationError(
        {
            'is_active': (
                'Invalid boolean. Use true/false or 1/0.'
            )
        }
    )
