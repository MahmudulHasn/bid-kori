from rest_framework.throttling import ScopedRateThrottle


class AIListingBurstThrottle(ScopedRateThrottle):
    """Limit AI description generations per authenticated user.

    Pair with ``throttle_scope = 'ai_listing'`` on the view (required by DRF
    ``ScopedRateThrottle``). Rate comes from ``DEFAULT_THROTTLE_RATES['ai_listing']``.
    """

    scope = 'ai_listing'
