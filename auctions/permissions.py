from rest_framework.permissions import BasePermission

from .models import Auction


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
