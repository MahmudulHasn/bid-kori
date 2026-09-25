import logging
from decimal import Decimal
import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class SSLCommerzError(Exception):
    """Custom exception raised when SSLCommerz API interactions fail."""

    def __init__(self, message, raw_response=None):
        super().__init__(message)
        self.message = message
        self.raw_response = raw_response or {}


def initiate_sslcommerz_session(
    *,
    tran_id: str,
    amount: Decimal,
    customer_name: str,
    customer_email: str,
    customer_phone: str,
    auction_id: int,
    success_url: str,
    fail_url: str,
    cancel_url: str,
    ipn_url: str,
) -> str:
    """Initiate a payment session with SSLCommerz gateway.

    Returns the GatewayPageURL string to redirect the user to.
    """
    store_id = getattr(settings, 'SSLCOMMERZ_STORE_ID', 'unica6ab6bc4a8cc25')
    store_passwd = getattr(settings, 'SSLCOMMERZ_STORE_PASSWORD', 'unica6ab6bc4a8cc25@ssl')
    session_api = getattr(
        settings,
        'SSLCOMMERZ_SESSION_API',
        'https://sandbox.sslcommerz.com/gwprocess/v4/api.php',
    )

    payload = {
        'store_id': store_id,
        'store_passwd': store_passwd,
        'total_amount': f'{Decimal(str(amount)):.2f}',
        'currency': 'BDT',
        'tran_id': tran_id,
        'success_url': success_url,
        'fail_url': fail_url,
        'cancel_url': cancel_url,
        'ipn_url': ipn_url,
        'cus_name': customer_name or 'BidKori Seller',
        'cus_email': customer_email or 'seller@bidkori.com',
        'cus_add1': 'Dhaka',
        'cus_city': 'Dhaka',
        'cus_country': 'Bangladesh',
        'cus_phone': customer_phone or '01700000000',
        'shipping_method': 'NO',
        'product_name': f'Winner Details Unlock Fee for Auction #{auction_id}',
        'product_category': 'Service',
        'product_profile': 'general',
        'value_a': str(auction_id),
    }

    try:
        response = requests.post(
            session_api,
            data=payload,
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        logger.exception('SSLCommerz gateway session request failed for tran_id=%s', tran_id)
        raise SSLCommerzError('Unable to connect to payment gateway. Please try again.') from exc
    except ValueError as exc:
        logger.exception('Invalid JSON from SSLCommerz session API for tran_id=%s', tran_id)
        raise SSLCommerzError('Invalid response from payment gateway.') from exc

    status = (data.get('status') or '').upper()
    if status == 'SUCCESS':
        gateway_url = data.get('GatewayPageURL') or data.get('redirectGatewayURL')
        if not gateway_url:
            raise SSLCommerzError('Gateway URL not provided in payment response.', raw_response=data)
        return gateway_url

    failed_reason = data.get('failedreason') or 'Payment gateway initialization failed.'
    logger.warning('SSLCommerz session initiation rejected: %s', failed_reason)
    raise SSLCommerzError(failed_reason, raw_response=data)


def validate_sslcommerz_payment(val_id: str) -> dict:
    """Validate payment with SSLCommerz server-to-server validation API.

    Returns dict with validated payment data if VALID/VALIDATED, otherwise raises SSLCommerzError.
    """
    store_id = getattr(settings, 'SSLCOMMERZ_STORE_ID', 'unica6ab6bc4a8cc25')
    store_passwd = getattr(settings, 'SSLCOMMERZ_STORE_PASSWORD', 'unica6ab6bc4a8cc25@ssl')
    validation_api = getattr(
        settings,
        'SSLCOMMERZ_VALIDATION_API',
        'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php',
    )

    params = {
        'val_id': val_id,
        'store_id': store_id,
        'store_passwd': store_passwd,
        'v': '1',
        'format': 'json',
    }

    try:
        response = requests.get(
            validation_api,
            params=params,
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        logger.exception('SSLCommerz validation request failed for val_id=%s', val_id)
        raise SSLCommerzError('Unable to validate payment with gateway.') from exc
    except ValueError as exc:
        logger.exception('Invalid JSON from SSLCommerz validation API for val_id=%s', val_id)
        raise SSLCommerzError('Invalid response from payment validation server.') from exc

    status = (data.get('status') or '').upper()
    if status in ('VALID', 'VALIDATED'):
        return data

    failed_reason = data.get('error') or f'Payment validation failed (status: {status}).'
    logger.warning('SSLCommerz validation rejected for val_id=%s: %s', val_id, failed_reason)
    raise SSLCommerzError(failed_reason, raw_response=data)
