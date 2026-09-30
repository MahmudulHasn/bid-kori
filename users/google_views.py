"""API Views for Google Sign-In and account resolution."""

from __future__ import annotations

import logging
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_tokens import issue_auth_token
from .google_auth import (
    authenticate_or_register_google_user,
    verify_google_id_token,
    verify_signup_token,
)
from .serializers import UserSerializer
from .views import _identity_payload

logger = logging.getLogger(__name__)


class GoogleAuthRequestSerializer(serializers.Serializer):
    """Schema for Google authentication requests.

    Accepts either:
    1. ``credential``: raw Google ID token from Google Identity Services.
       Optional ``role`` ('BUYER' or 'SELLER') for direct social registration.
    2. ``signup_token``: server-signed token from step 1 + required ``role``.
    """

    credential = serializers.CharField(
        required=False,
        allow_blank=False,
        trim_whitespace=True,
        help_text='Raw Google ID token (JWT) from Google Identity Services.',
    )
    signup_token = serializers.CharField(
        required=False,
        allow_blank=False,
        trim_whitespace=True,
        help_text='Server-signed signup token returned when role selection is required.',
    )
    role = serializers.CharField(
        required=False,
        allow_blank=False,
        trim_whitespace=True,
        help_text='Marketplace role for new user registration (BUYER or SELLER only).',
    )

    def validate(self, attrs):
        credential = attrs.get('credential')
        signup_token = attrs.get('signup_token')
        role = attrs.get('role')

        if not credential and not signup_token:
            raise serializers.ValidationError(
                {'credential': 'Either credential or signup_token is required.'}
            )

        if signup_token and not role:
            raise serializers.ValidationError(
                {'role': 'Role selection (BUYER or SELLER) is required with signup_token.'}
            )

        # Disallow privilege escalation
        for forbidden in ('is_staff', 'is_superuser', 'is_active', 'user_id', 'provider_user_id'):
            if forbidden in self.initial_data:
                raise serializers.ValidationError(
                    {forbidden: 'This field cannot be set during Google authentication.'}
                )

        return attrs


class GoogleAuthView(APIView):
    """Authenticate or register a BidKori user via Google Identity Services."""

    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Users'],
        summary='Authenticate or register with Google ID token',
        request=GoogleAuthRequestSerializer,
        responses={
            200: inline_serializer(
                name='GoogleAuthResponse',
                fields={
                    'token': serializers.CharField(required=False),
                    'user': UserSerializer(required=False),
                    'requires_role_selection': serializers.BooleanField(required=False),
                    'signup_token': serializers.CharField(required=False),
                    'email': serializers.EmailField(required=False),
                    'name': serializers.CharField(required=False),
                },
            ),
            400: {'description': 'Invalid payload or token.'},
            401: {'description': 'Google verification failed or account suspended.'},
        },
    )
    def post(self, request):
        serializer = GoogleAuthRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        credential = serializer.validated_data.get('credential')
        signup_token = serializer.validated_data.get('signup_token')
        role = serializer.validated_data.get('role')

        # ---------------------------------------------------------------------
        # Flow 1: Resuming with server-signed signup_token
        # ---------------------------------------------------------------------
        if signup_token:
            claims = verify_signup_token(signup_token)
            user, extra = authenticate_or_register_google_user(
                sub=claims['sub'],
                email=claims['email'],
                name=claims.get('name', ''),
                role=role,
            )
            if not user:
                raise AuthenticationFailed('Could not finalize account creation.')

            token = issue_auth_token(user)
            return Response(
                {
                    'token': token.key,
                    'user': _identity_payload(user),
                },
                status=status.HTTP_201_CREATED,
            )

        # ---------------------------------------------------------------------
        # Flow 2: Authenticating with Google credential (ID token)
        # ---------------------------------------------------------------------
        claims = verify_google_id_token(credential)
        user, pending_info = authenticate_or_register_google_user(
            sub=claims['sub'],
            email=claims['email'],
            name=claims.get('name', ''),
            role=role,
        )

        if pending_info:
            # First-time user needs to choose BUYER or SELLER
            return Response(pending_info, status=status.HTTP_200_OK)

        if not user:
            raise AuthenticationFailed('Google authentication could not be completed.')

        token = issue_auth_token(user)
        return Response(
            {
                'token': token.key,
                'user': _identity_payload(user),
            },
            status=status.HTTP_200_OK,
        )
