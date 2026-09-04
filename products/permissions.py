from rest_framework.permissions import SAFE_METHODS, BasePermission

from users.models import resolve_user_role


class IsSellerOrReadOnly(BasePermission):
    """Allow read access to anyone; write access only to the product's seller."""

    message = (
        'Action forbidden: Only the seller can modify this listing.'
    )

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return request.user == obj.seller


class IsSellerOrAdminForProductCreate(BasePermission):
    """Restrict Product creation to SELLER or ADMIN marketplace roles.

    BUYER tokens remain authenticated but cannot POST /api/products/.
    Nested Product creation inside AuctionSerializer is unaffected.
    """

    message = 'Action forbidden: Only sellers can create products.'

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        if request.method != 'POST':
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        role = resolve_user_role(request.user)
        return role in ('SELLER', 'ADMIN')
