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
            "admin_users": "/api/admin/users/",
            "admin_products": "/api/admin/products/",
            "admin_auctions": "/api/admin/auctions/",
            "admin_finance": "/api/admin/finance/",
            "seller_sales": "/api/seller/sales/",
            "seller_earnings": "/api/seller/earnings/",
            "notifications": "/api/notifications/",
            "ai_chat": "/api/ai/chat/",
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
    path('api/admin/users/', include('users.admin_urls')),
    path('api/admin/products/', include('products.admin_urls')),
    path('api/admin/auctions/', include('auctions.admin_urls')),
    path('api/admin/finance/', include('auctions.admin_finance_urls')),
    path('api/seller/', include('auctions.seller_urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/ai/', include('ai.urls')),
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