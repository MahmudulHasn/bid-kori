from django.urls import path

from .seller_verification_views import (
    SellerVerificationStatusView,
    SellerVerificationSubmitView,
)

app_name = 'seller_verification'

urlpatterns = [
    path('status/', SellerVerificationStatusView.as_view(), name='status'),
    path('submit/', SellerVerificationSubmitView.as_view(), name='submit'),
]
