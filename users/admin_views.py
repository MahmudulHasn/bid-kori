"""Admin-only user directory and reversible Suspend/Reactivate actions."""

from __future__ import annotations

from django.contrib.auth.models import User
from django.db.models import Q
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .account_control import (
    parse_is_active_query,
    reactivate_marketplace_user,
    suspend_marketplace_user,
)
from .admin_pagination import AdminUserPagination
from .models import UserProfile
from .serializers import AdminUserSerializer

ADMIN_USER_LIST_PARAMETERS = [
    OpenApiParameter(
        name='search',
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
        required=False,
        description='Case-insensitive search on username and email.',
    ),
    OpenApiParameter(
        name='role',
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
        required=False,
        description='Filter by authoritative role: BUYER, SELLER, or ADMIN.',
    ),
    OpenApiParameter(
        name='is_active',
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
        required=False,
        description='Filter by account activity: true/false or 1/0.',
    ),
    OpenApiParameter(
        name='page',
        type=OpenApiTypes.INT,
        location=OpenApiParameter.QUERY,
        required=False,
        description='Page number (page size 20).',
    ),
]


def _admin_user_queryset():
    return User.objects.select_related('profile').order_by('-date_joined', '-id')


def _apply_role_filter(queryset, role_param: str | None):
    if not role_param:
        return queryset
    role = str(role_param).strip().upper()
    non_admin = Q(is_staff=False) & Q(is_superuser=False)
    if role == 'ADMIN':
        return queryset.filter(Q(is_staff=True) | Q(is_superuser=True))
    if role == UserProfile.Role.BUYER:
        return queryset.filter(
            non_admin
            & (
                Q(profile__role=UserProfile.Role.BUYER)
                | Q(profile__isnull=True)
            )
        )
    if role == UserProfile.Role.SELLER:
        return queryset.filter(
            non_admin & Q(profile__role=UserProfile.Role.SELLER)
        )
    raise ValidationError(
        {'role': 'Invalid role. Use BUYER, SELLER, or ADMIN.'}
    )


def _get_target_user(user_id: int) -> User:
    try:
        return _admin_user_queryset().get(pk=user_id)
    except User.DoesNotExist as exc:
        raise NotFound('User not found.') from exc


class AdminUserListView(APIView):
    """Paginated Admin user directory with search and filters."""

    permission_classes = [IsAdminUser]
    pagination_class = AdminUserPagination

    @extend_schema(
        tags=['Admin Users'],
        summary='List users (staff only)',
        parameters=ADMIN_USER_LIST_PARAMETERS,
        responses={200: AdminUserSerializer(many=True)},
    )
    def get(self, request):
        queryset = _admin_user_queryset()

        search = request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(username__icontains=search) | Q(email__icontains=search)
            )

        queryset = _apply_role_filter(
            queryset,
            request.query_params.get('role'),
        )

        is_active = parse_is_active_query(
            request.query_params.get('is_active')
        )
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = AdminUserSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class AdminUserDetailView(APIView):
    """Read-only Admin user detail. No PATCH/PUT/DELETE."""

    permission_classes = [IsAdminUser]
    http_method_names = ['get', 'head', 'options']

    @extend_schema(
        tags=['Admin Users'],
        summary='Retrieve user (staff only)',
        responses={200: AdminUserSerializer},
    )
    def get(self, request, user_id: int):
        user = _get_target_user(user_id)
        return Response(AdminUserSerializer(user).data)


class AdminUserSuspendView(APIView):
    """Suspend a marketplace BUYER/SELLER (is_active=False + revoke token)."""

    permission_classes = [IsAdminUser]
    http_method_names = ['post', 'head', 'options']

    @extend_schema(
        tags=['Admin Users'],
        summary='Suspend marketplace user (staff only)',
        request=None,
        responses={200: AdminUserSerializer},
    )
    def post(self, request, user_id: int):
        # Ensure 404 before guard messaging for missing ids.
        _get_target_user(user_id)
        user = suspend_marketplace_user(actor=request.user, target_id=user_id)
        # Refresh related profile for role serialization consistency.
        user = _admin_user_queryset().get(pk=user.pk)
        return Response(AdminUserSerializer(user).data, status=status.HTTP_200_OK)


class AdminUserReactivateView(APIView):
    """Reactivate a marketplace BUYER/SELLER without restoring tokens."""

    permission_classes = [IsAdminUser]
    http_method_names = ['post', 'head', 'options']

    @extend_schema(
        tags=['Admin Users'],
        summary='Reactivate marketplace user (staff only)',
        request=None,
        responses={200: AdminUserSerializer},
    )
    def post(self, request, user_id: int):
        _get_target_user(user_id)
        user = reactivate_marketplace_user(actor=request.user, target_id=user_id)
        user = _admin_user_queryset().get(pk=user.pk)
        return Response(AdminUserSerializer(user).data, status=status.HTTP_200_OK)
