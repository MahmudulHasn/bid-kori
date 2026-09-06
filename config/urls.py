from config.admin import bidkori_admin_site
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)


def api_root(request):
    return JsonResponse({
        "status": "online",
        "platform": "BidKori API",
        "endpoints": {
            "admin": "/admin/",
            "products": "/api/products/",
            "categories": "/api/categories/",
            "auctions": "/api/auctions/",
            "register": "/api/users/register/",
            "login": "/api/users/login/",
            "logout": "/api/users/logout/",
            "me": "/api/users/me/",
            "notifications": "/api/notifications/",
            "schema": "/api/schema/",
            "swagger": "/api/schema/swagger-ui/",
            "redoc": "/api/schema/redoc/",
        }
    })

urlpatterns = [
    path('', api_root, name='api-root'),
    path('admin/', bidkori_admin_site.urls),
    path('api/products/', include('products.urls')),
    path('api/categories/', include('products.category_urls')),
    path('api/auctions/', include('auctions.urls')),
    path('api/users/', include('users.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path(
        'api/schema/swagger-ui/',
        SpectacularSwaggerView.as_view(url_name='schema'),
        name='swagger-ui',
    ),
    path(
        'api/schema/redoc/',
        SpectacularRedocView.as_view(url_name='schema'),
        name='redoc',
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)