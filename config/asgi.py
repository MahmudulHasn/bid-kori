"""
ASGI config for BidKori.

HTTP continues through Django ASGI. WebSockets use Django Channels for
public auction rooms and authenticated private notification streams.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Initialize Django before importing app routing / models.
django_asgi_app = get_asgi_application()

from channels.auth import AuthMiddlewareStack  # noqa: E402
from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402

from auctions.routing import websocket_urlpatterns as auction_websocket_urlpatterns  # noqa: E402
from notifications.routing import (  # noqa: E402
    websocket_urlpatterns as notification_websocket_urlpatterns,
)

websocket_urlpatterns = (
    auction_websocket_urlpatterns + notification_websocket_urlpatterns
)

application = ProtocolTypeRouter(
    {
        'http': django_asgi_app,
        'websocket': AllowedHostsOriginValidator(
            AuthMiddlewareStack(URLRouter(websocket_urlpatterns))
        ),
    }
)
