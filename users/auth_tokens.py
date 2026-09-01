"""Helpers for DRF authtoken lifecycle management.

DRF's built-in ``Token`` model does not support expiration timestamps.
Revocation is performed by deleting the database row. Issuing a fresh token
invalidates any previously issued token for the same user.
"""

from rest_framework.authtoken.models import Token


def issue_auth_token(user):
    """Create a new API token for ``user``, replacing any existing token."""
    Token.objects.filter(user=user).delete()
    return Token.objects.create(user=user)


def revoke_auth_token(user):
    """Delete the API token for ``user``, if one exists."""
    Token.objects.filter(user=user).delete()
