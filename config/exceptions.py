from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    """Normalize all DRF error responses to a unified JSON shape.

    Output format::

        {"status_code": <int>, "error": <message_string_or_dict>}
    """
    response = exception_handler(exc, context)

    if response is not None:
        response.data = {
            'status_code': response.status_code,
            'error': _extract_error_payload(response.data),
        }

    return response


def _extract_error_payload(data):
    """Reduce common DRF error bodies to a string or structured dict."""
    if isinstance(data, list):
        if len(data) == 1:
            return str(data[0])
        return [str(item) for item in data]

    if not isinstance(data, dict):
        return data

    # Prefer an existing "error" key when it is the sole payload.
    if 'error' in data and len(data) == 1:
        return data['error']

    # Standard DRF "detail" responses (401/403/404, etc.).
    if 'detail' in data and len(data) == 1:
        return data['detail']

    return data
