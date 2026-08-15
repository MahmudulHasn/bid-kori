from django.contrib.auth.models import User
from rest_framework import serializers


class UserRegistrationSerializer(serializers.ModelSerializer):
    """Handles new user registration with password confirmation."""

    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'confirm_password']

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError(
                {'confirm_password': 'Passwords do not match.'}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
        )


class UserSerializer(serializers.ModelSerializer):
    """Returns basic public user profile information."""

    class Meta:
        model = User
        fields = ['id', 'username', 'email']
