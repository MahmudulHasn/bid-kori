"""Google Identity Services (GIS) backend token verification and account linking.

Google authenticates identity; Django remains the authoritative source for:
- user account
- role (BUYER / SELLER)
- permissions and staff/superuser state
- suspended/active state
- session and DRF auth tokens
"""

from __future__ import annotations

import logging
import re
import secrets
from typing import Any

from django.conf import settings
from django.contrib.auth.models import User
from django.core import signing
from django.db import IntegrityError, transaction
from django.utils.text import slugify
from rest_framework.exceptions import AuthenticationFailed, ValidationError

from .auth_tokens import issue_auth_token
from .models import SocialAccount, UserProfile, ensure_user_profile

logger = logging.getLogger(__name__)

# Allowed public roles for social signup. ADMIN is strictly forbidden.
ALLOWED_SOCIAL_SIGNUP_ROLES = frozenset(
    {
        UserProfile.Role.BUYER,
        UserProfile.Role.SELLER,
    }
)

SIGNUP_TOKEN_SALT = 'bidkori-google-social-signup'
SIGNUP_TOKEN_MAX_AGE_SECONDS = 600  # 10 minutes


def verify_google_id_token(credential: str) -> dict[str, Any]:
    """Cryptographically verify a Google ID token with Google's public certs.

    Verifies:
    - Token signature against official Google certs
    - Audience matches settings.GOOGLE_CLIENT_ID
    - Issuer is 'accounts.google.com' or 'https://accounts.google.com'
    - Token not expired
    - Google subject (`sub`) exists
    - Email exists and `email_verified` is True

    Returns trusted claims dictionary. Raises AuthenticationFailed on invalid token.
    """
    if not credential or not isinstance(credential, str):
        raise AuthenticationFailed('Google credential is required.')

    client_id = getattr(settings, 'GOOGLE_CLIENT_ID', '').strip()
    if not client_id:
        logger.error('GOOGLE_CLIENT_ID is not configured in backend settings.')
        raise AuthenticationFailed('Google authentication is not configured on this server.')

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
    except ImportError as exc:
        logger.error('google-auth library is not installed: %s', exc)
        raise AuthenticationFailed('Google authentication provider is unavailable.')

    try:
        payload = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            audience=client_id,
        )
    except Exception as exc:
        # Generic message — do not leak crypto internals or raw tokens
        logger.warning('Google token verification failed: %s', type(exc).__name__)
        raise AuthenticationFailed('Invalid or expired Google credential.')

    # Issuer validation
    issuer = payload.get('iss')
    if issuer not in ('accounts.google.com', 'https://accounts.google.com'):
        logger.warning('Google token issuer mismatch: %s', issuer)
        raise AuthenticationFailed('Invalid Google token issuer.')

    # Verified subject ID (sub)
    sub = str(payload.get('sub', '')).strip()
    if not sub:
        raise AuthenticationFailed('Google token missing permanent subject ID.')

    # Email and email_verified validation
    email = str(payload.get('email', '')).strip().lower()
    if not email:
        raise AuthenticationFailed('Google token missing email address.')

    email_verified = payload.get('email_verified')
    if email_verified is not True:
        raise AuthenticationFailed('Google email is not verified.')

    name = str(payload.get('name', '')).strip()
    picture = str(payload.get('picture', '')).strip()

    return {
        'sub': sub,
        'email': email,
        'name': name,
        'picture': picture,
    }


def generate_signup_token(*, sub: str, email: str, name: str = '') -> str:
    """Generate a tamper-proof, time-limited signed token for first-time role selection."""
    data = {
        'sub': sub,
        'email': email,
        'name': name,
    }
    return signing.dumps(data, salt=SIGNUP_TOKEN_SALT)


def verify_signup_token(signup_token: str) -> dict[str, str]:
    """Verify and unpack a server-signed signup token.

    Raises AuthenticationFailed if expired or tampered with.
    """
    if not signup_token or not isinstance(signup_token, str):
        raise AuthenticationFailed('Signup token is required.')

    try:
        data = signing.loads(
            signup_token,
            salt=SIGNUP_TOKEN_SALT,
            max_age=SIGNUP_TOKEN_MAX_AGE_SECONDS,
        )
        if not isinstance(data, dict) or 'sub' not in data or 'email' not in data:
            raise ValueError('Malformed token payload')
        return {
            'sub': str(data['sub']),
            'email': str(data['email']).lower(),
            'name': str(data.get('name', '')),
        }
    except signing.SignatureExpired:
        raise AuthenticationFailed('Role selection expired. Please sign in with Google again.')
    except Exception:
        raise AuthenticationFailed('Invalid or tampered signup token.')


def generate_unique_username(email: str, name: str = '') -> str:
    """Generate a clean, collision-safe username for first-time Google signups."""
    base = ''
    if name:
        base = slugify(name).replace('-', '_')
    if not base or len(base) < 3:
        email_prefix = email.split('@')[0]
        base = re.sub(r'[^a-zA-Z0-9_]', '_', email_prefix)

    base = base[:20].rstrip('_')
    if not base:
        base = 'user'

    candidate = base
    attempts = 0
    while attempts < 50:
        if not User.objects.filter(username__iexact=candidate).exists():
            return candidate
        random_suffix = secrets.randbelow(9000) + 1000  # 4 digits: 1000-9999
        candidate = f'{base[:15]}_{random_suffix}'
        attempts += 1

    # Fallback to high-entropy hex suffix
    return f'{base[:12]}_{secrets.token_hex(4)}'


def validate_social_role(role_raw: Any) -> str:
    """Validate that role is explicitly BUYER or SELLER.

    Rejects ADMIN, STAFF, SUPERUSER, or any other value with ValidationError.
    """
    role = str(role_raw or '').strip().upper()
    if role not in ALLOWED_SOCIAL_SIGNUP_ROLES:
        raise ValidationError({'role': 'Role must be BUYER or SELLER. ADMIN cannot be selected.'})
    return role


def authenticate_or_register_google_user(
    *,
    sub: str,
    email: str,
    name: str = '',
    role: str | None = None,
) -> tuple[User | None, dict[str, Any] | None]:
    """Core account resolution and linking engine for Google authentication.

    Returns:
        (user, None) if authenticated / created successfully.
        (None, {'requires_role_selection': True, 'signup_token': ...}) if new user needs role.

    Follows safe account linking policy:
    1. Case A: Google sub already linked -> authenticate that user.
    2. Case B: Google email matches existing verified BidKori account -> link Google identity.
    3. Case C: Brand new user:
       - If role provided -> create BUYER or SELLER account with unusable password.
       - If role omitted -> return signed signup_token for role selection UI.
    """
    # -------------------------------------------------------------------------
    # Case A: Existing Google SocialAccount link
    # -------------------------------------------------------------------------
    social_account = (
        SocialAccount.objects.select_related('user', 'user__profile')
        .filter(provider=SocialAccount.Provider.GOOGLE, provider_user_id=sub)
        .first()
    )
    if social_account:
        user = social_account.user
        if not user.is_active:
            raise AuthenticationFailed('This BidKori account is currently unavailable.')
        return user, None

    # -------------------------------------------------------------------------
    # Case B: Existing user by verified email (Safe Account Linking)
    # -------------------------------------------------------------------------
    existing_user = (
        User.objects.select_related('profile')
        .filter(email__iexact=email)
        .first()
    )
    if existing_user:
        if not existing_user.is_active:
            raise AuthenticationFailed('This BidKori account is currently unavailable.')

        # Ensure user has a profile
        if not existing_user.is_staff and not existing_user.is_superuser:
            ensure_user_profile(existing_user)

        # Check if already linked to a different sub
        conflicting_social = SocialAccount.objects.filter(
            user=existing_user,
            provider=SocialAccount.Provider.GOOGLE,
        ).first()
        if conflicting_social and conflicting_social.provider_user_id != sub:
            logger.warning(
                'Conflicting Google sub for existing user %d: existing=%s new=%s',
                existing_user.id,
                conflicting_social.provider_user_id,
                sub,
            )
            raise AuthenticationFailed(
                'An existing Google account is already connected to this BidKori user.'
            )

        # Link Google identity atomically (idempotent if race occurs)
        try:
            with transaction.atomic():
                SocialAccount.objects.get_or_create(
                    provider=SocialAccount.Provider.GOOGLE,
                    provider_user_id=sub,
                    defaults={'user': existing_user, 'email': email},
                )
        except IntegrityError:
            pass  # Another concurrent request linked it; existing_user remains valid

        return existing_user, None

    # -------------------------------------------------------------------------
    # Case C: Brand new user (First-time Social Signup)
    # -------------------------------------------------------------------------
    if not role:
        # Prompt user to choose BUYER or SELLER
        signup_token = generate_signup_token(sub=sub, email=email, name=name)
        return None, {
            'requires_role_selection': True,
            'signup_token': signup_token,
            'email': email,
            'name': name,
        }

    # Validate role strictly (never allow ADMIN)
    validated_role = validate_social_role(role)

    # Concurrency-safe atomic creation
    try:
        with transaction.atomic():
            username = generate_unique_username(email=email, name=name)
            first_name = name[:30] if name else ''

            user = User.objects.create_user(
                username=username,
                email=email,
            )
            user.set_unusable_password()
            user.first_name = first_name
            # Security guarantee: never elevated from social signup
            user.is_staff = False
            user.is_superuser = False
            user.save(update_fields=['password', 'first_name', 'is_staff', 'is_superuser'])

            UserProfile.objects.create(user=user, role=validated_role)
            SocialAccount.objects.create(
                user=user,
                provider=SocialAccount.Provider.GOOGLE,
                provider_user_id=sub,
                email=email,
            )
            return user, None
    except IntegrityError:
        # In case of concurrent registration race with the same Google sub or email:
        existing_social = SocialAccount.objects.filter(
            provider=SocialAccount.Provider.GOOGLE,
            provider_user_id=sub,
        ).select_related('user').first()
        if existing_social:
            return existing_social.user, None

        existing_by_email = User.objects.filter(email__iexact=email).first()
        if existing_by_email:
            SocialAccount.objects.get_or_create(
                provider=SocialAccount.Provider.GOOGLE,
                provider_user_id=sub,
                defaults={'user': existing_by_email, 'email': email},
            )
            return existing_by_email, None

        raise AuthenticationFailed('Registration race encountered. Please try again.')
