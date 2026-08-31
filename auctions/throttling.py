from rest_framework.throttling import ScopedRateThrottle


class BidBurstThrottle(ScopedRateThrottle):
    """Limit how quickly a user can place bids (scope: ``bids``)."""

    scope = 'bids'
