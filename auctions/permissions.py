from rest_framework.permissions import SAFE_METHODS, BasePermission

from users.models import resolve_user_role

from .models import Auction


class IsAuctionSellerOrReadOnly(BasePermission):
    """Allow read access to anyone; write access only to the auction's product seller."""

    message = 'Action forbidden: Only the seller can modify this auction.'

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        auction = obj if isinstance(obj, Auction) else getattr(obj, 'auction', None)
        if auction is None:
            return False
        return request.user == auction.product.seller


class IsSellerOrAdminForAuctionCreate(BasePermission):
    """Restrict auction creation to SELLER or ADMIN marketplace roles.

    BUYER tokens remain authenticated but cannot create auctions.
    Object-level ownership for existing products is enforced in the serializer.
    """

    message = 'Action forbidden: Only sellers can create auctions.'

    def has_permission(self, request, view):
        if getattr(view, 'action', None) != 'create':
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        role = resolve_user_role(request.user)
        return role in ('SELLER', 'ADMIN')


class IsNotSeller(BasePermission):
    """Prevent the auction's product seller from placing a bid on their own listing."""

    message = 'Action forbidden: Sellers cannot bid on their own listings.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        auction = self._get_auction(view)
        if auction is None:
            return True
        return request.user != auction.product.seller

    def has_object_permission(self, request, view, obj):
        auction = obj if isinstance(obj, Auction) else getattr(obj, 'auction', None)
        if auction is None:
            return True
        return request.user != auction.product.seller

    def _get_auction(self, view):
        auction_id = (
            view.kwargs.get('auction_id')
            or view.kwargs.get('pk')
            or view.kwargs.get('auction_pk')
        )
        if auction_id is None:
            return None
        try:
            return Auction.objects.select_related('product__seller').get(pk=auction_id)
        except Auction.DoesNotExist:
            return None
