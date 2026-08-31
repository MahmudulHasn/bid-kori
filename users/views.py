from django.contrib.auth import authenticate
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import UserRegistrationSerializer, UserSerializer


class AuthTokenResponseSerializer(serializers.Serializer):
    """Schema for login/register responses containing a token and user."""

    token = serializers.CharField()
    user = UserSerializer()


class LoginRequestSerializer(serializers.Serializer):
    """Schema for username/password login requests."""

    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


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
        token, _ = Token.objects.get_or_create(user=user)
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
            400: {'description': 'Username and password are required.'},
            401: {'description': 'Invalid credentials.'},
        },
    )
    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response(
                {'detail': 'Username and password are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(username=username, password=password)
        if user is None:
            return Response(
                {'detail': 'Invalid credentials.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {
                'token': token.key,
                'user': UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


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
