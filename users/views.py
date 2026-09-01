from django.contrib.auth import authenticate
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_tokens import issue_auth_token, revoke_auth_token
from .serializers import UserRegistrationSerializer, UserSerializer


class AuthTokenResponseSerializer(serializers.Serializer):
    """Schema for login/register responses containing a token and user."""

    token = serializers.CharField()
    user = UserSerializer()


class LoginRequestSerializer(serializers.Serializer):
    """Schema for username/password login requests."""

    username = serializers.CharField(trim_whitespace=True)
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class RegisterView(APIView):
    """Register a new user and return an auth token with user details."""

    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Users'],
        summary='Register a new user',
        request=UserRegistrationSerializer,
        responses={201: AuthTokenResponseSerializer},
    )
    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token = issue_auth_token(user)
        return Response(
            {
                'token': token.key,
                'user': UserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    """Authenticate with username/password and return an auth token."""

    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Users'],
        summary='Log in and obtain an auth token',
        request=LoginRequestSerializer,
        responses={
            200: AuthTokenResponseSerializer,
            400: {'description': 'Invalid request payload.'},
            401: {'description': 'Invalid credentials.'},
        },
    )
    def post(self, request):
        serializer = LoginRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        username = serializer.validated_data['username']
        password = serializer.validated_data['password']

        user = authenticate(username=username, password=password)
        if user is None or not user.is_active:
            # Generic message — do not reveal whether the username exists.
            raise AuthenticationFailed('Invalid credentials.')

        token = issue_auth_token(user)
        return Response(
            {
                'token': token.key,
                'user': UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """Revoke the authenticated user's API token."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Users'],
        summary='Log out and revoke the current API token',
        request=None,
        responses={204: {'description': 'Token revoked.'}},
    )
    def post(self, request):
        revoke_auth_token(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserProfileView(APIView):
    """Return the currently authenticated user's profile."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Users'],
        summary='Get the authenticated user profile',
        responses={200: UserSerializer},
    )
    def get(self, request):
        return Response(UserSerializer(request.user).data)
