from rest_framework.permissions import SAFE_METHODS, BasePermission


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
