from django.urls import path

from .winner_fulfillment_views import (
    WinnerFulfillmentDetailsView,
    WinnerFulfillmentSubmitView,
)

app_name = 'buyer_auctions'

urlpatterns = [
    path(
        'won/<int:auction_id>/winner-details/',
        WinnerFulfillmentDetailsView.as_view(),
        name='buyer-winner-details',
    ),
    path(
        'won/<int:auction_id>/winner-details/submit/',
        WinnerFulfillmentSubmitView.as_view(),
        name='buyer-winner-details-submit',
    ),
]
