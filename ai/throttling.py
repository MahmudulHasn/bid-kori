from rest_framework.throttling import ScopedRateThrottle


class AIChatBurstThrottle(ScopedRateThrottle):
    """Limit support-chat requests for anonymous (IP) and authenticated users.

    Scope ``ai_chat`` is independent of ``ai_listing``.
    DRF ScopedRateThrottle uses user PK when authenticated, else client IP.
    """

    scope = 'ai_chat'
