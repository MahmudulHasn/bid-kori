import logging
from django.conf import settings
from django.http import HttpResponse, HttpResponseRedirect
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from .services import WinnerDetailsUnlockService

logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name='dispatch')
class SSLCommerzSuccessCallbackView(View):
    """Callback endpoint reached via browser POST from SSLCommerz on successful payment."""

    def post(self, request, *args, **kwargs):
        tran_id = request.POST.get('tran_id')
        val_id = request.POST.get('val_id')
        logger.info('SSLCommerz success callback received: tran_id=%s, val_id=%s', tran_id, val_id)

        frontend_url = getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:3000')

        if not tran_id or not val_id:
            logger.warning('SSLCommerz success callback missing tran_id or val_id')
            return HttpResponseRedirect(
                f"{frontend_url}/seller/sales?payment=failed&error=missing_transaction_data"
            )

        try:
            auction_id = WinnerDetailsUnlockService.handle_sslcommerz_success(
                tran_id=tran_id,
                val_id=val_id,
                post_data=request.POST,
            )
            return HttpResponseRedirect(
                f"{frontend_url}/seller/auctions/{auction_id}?payment=success&tran_id={tran_id}"
            )
        except Exception as exc:
            logger.exception('Failed to process SSLCommerz payment success for tran_id=%s', tran_id)
            return HttpResponseRedirect(
                f"{frontend_url}/seller/sales?payment=failed&error={exc}&tran_id={tran_id}"
            )


@method_decorator(csrf_exempt, name='dispatch')
class SSLCommerzFailCallbackView(View):
    """Callback endpoint reached via browser POST from SSLCommerz on failed payment."""

    def post(self, request, *args, **kwargs):
        tran_id = request.POST.get('tran_id')
        logger.warning('SSLCommerz fail callback received: tran_id=%s', tran_id)
        frontend_url = getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:3000')

        try:
            auction_id = WinnerDetailsUnlockService.handle_sslcommerz_fail(
                tran_id=tran_id,
                post_data=request.POST,
            )
            return HttpResponseRedirect(
                f"{frontend_url}/seller/auctions/{auction_id}?payment=failed&tran_id={tran_id}"
            )
        except Exception:
            return HttpResponseRedirect(
                f"{frontend_url}/seller/sales?payment=failed&tran_id={tran_id}"
            )


@method_decorator(csrf_exempt, name='dispatch')
class SSLCommerzCancelCallbackView(View):
    """Callback endpoint reached via browser POST from SSLCommerz when payment is cancelled."""

    def post(self, request, *args, **kwargs):
        tran_id = request.POST.get('tran_id')
        logger.info('SSLCommerz cancel callback received: tran_id=%s', tran_id)
        frontend_url = getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:3000')

        try:
            auction_id = WinnerDetailsUnlockService.handle_sslcommerz_cancel(
                tran_id=tran_id,
                post_data=request.POST,
            )
            return HttpResponseRedirect(
                f"{frontend_url}/seller/auctions/{auction_id}?payment=cancelled&tran_id={tran_id}"
            )
        except Exception:
            return HttpResponseRedirect(f"{frontend_url}/seller/sales?payment=cancelled")


@method_decorator(csrf_exempt, name='dispatch')
class SSLCommerzIPNCallbackView(View):
    """Server-to-server IPN webhook endpoint from SSLCommerz."""

    def post(self, request, *args, **kwargs):
        tran_id = request.POST.get('tran_id')
        val_id = request.POST.get('val_id')
        logger.info('SSLCommerz IPN received: tran_id=%s, val_id=%s', tran_id, val_id)

        if not tran_id or not val_id:
            return HttpResponse('Missing data', status=400)

        try:
            WinnerDetailsUnlockService.handle_sslcommerz_success(
                tran_id=tran_id,
                val_id=val_id,
                post_data=request.POST,
            )
            return HttpResponse('IPN Processed OK', status=200)
        except Exception as exc:
            logger.exception('SSLCommerz IPN processing failed for tran_id=%s', tran_id)
            return HttpResponse(f'IPN Error: {exc}', status=400)
