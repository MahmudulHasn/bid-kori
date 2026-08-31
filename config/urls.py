from config.admin import bidkori_admin_site
from django.urls import include, path
from django.http import JsonResponse

def api_root(request):
    return JsonResponse({
        "status": "online",
        "platform": "BidKori API",
        "endpoints": {
            "admin": "/admin/",
            "products": "/api/products/",
            "auctions": "/api/auctions/",
            "register": "/api/users/register/",
            "login": "/api/users/login/",
            "me": "/api/users/me/",
        }
    })

urlpatterns = [
    path('', api_root, name='api-root'),
    path('admin/', bidkori_admin_site.urls),
    path('api/products/', include('products.urls')),
    path('api/auctions/', include('auctions.urls')),
    path('api/users/', include('users.urls')),
]