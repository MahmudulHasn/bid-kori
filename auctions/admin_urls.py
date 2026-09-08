from django.urls import path

from .admin_moderation_views import AdminAuctionHideView, AdminAuctionRestoreView

app_name = 'admin_auctions'

urlpatterns = [
    path(
        '<int:auction_id>/hide/',
        AdminAuctionHideView.as_view(),
        name='hide',
    ),
    path(
        '<int:auction_id>/restore/',
        AdminAuctionRestoreView.as_view(),
        name='restore',
    ),
]
