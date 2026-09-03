from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import serializers

from .models import UserProfile, resolve_user_role

# Public registration may only choose marketplace roles (never ADMIN).
PUBLIC_REGISTRATION_ROLES = frozenset(
    {
        UserProfile.Role.BUYER,
        UserProfile.Role.SELLER,
    }
)


class UserRegistrationSerializer(serializers.ModelSerializer):
    """Handles new user registration with password confirmation and role.

    ``role`` is optional for backward compatibility with existing clients.
    When omitted, the account is created as BUYER.
    """

    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, min_length=8)
    role = serializers.CharField(
        required=False,
        allow_blank=False,
        default=UserProfile.Role.BUYER,
    )

    class Meta:
        model = User
        fields = [
            'username',
            'email',
            'password',
            'confirm_password',
            'role',
        ]

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError(
                'A user with this username already exists.'
            )
        return value

    def validate_role(self, value):
        role = str(value).strip().upper()
        if role not in PUBLIC_REGISTRATION_ROLES:
            raise serializers.ValidationError(
                'Role must be BUYER or SELLER. ADMIN cannot be selected at registration.'
            )
        return role

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError(
                {'confirm_password': 'Passwords do not match.'}
            )

        # Privilege fields must never be accepted from public registration.
        for forbidden in ('is_staff', 'is_superuser', 'is_active'):
            if forbidden in self.initial_data:
                raise serializers.ValidationError(
                    {forbidden: 'This field cannot be set during registration.'}
                )
        return attrs

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        role = validated_data.pop('role', UserProfile.Role.BUYER)
        if role not in PUBLIC_REGISTRATION_ROLES:
            raise serializers.ValidationError(
                {'role': 'Role must be BUYER or SELLER.'}
            )

        with transaction.atomic():
            user = User.objects.create_user(
                username=validated_data['username'],
                email=validated_data['email'],
                password=validated_data['password'],
            )
            # Never elevate via registration payload.
            if user.is_staff or user.is_superuser:
                user.is_staff = False
                user.is_superuser = False
                user.save(update_fields=['is_staff', 'is_superuser'])
            UserProfile.objects.create(user=user, role=role)
        return user


class UserSerializer(serializers.ModelSerializer):
    """Identity payload for login, register, and /me/ responses."""

    role = serializers.SerializerMethodField()
    is_staff = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'is_staff']
        read_only_fields = fields

    def get_role(self, obj):
        return resolve_user_role(obj)
