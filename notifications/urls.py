from django.urls import path

from .views import NotificationViewSet

app_name = 'notifications'

notification_list = NotificationViewSet.as_view({'get': 'list'})
notification_read = NotificationViewSet.as_view({'post': 'mark_read'})
notification_read_all = NotificationViewSet.as_view({'post': 'mark_all_read'})

urlpatterns = [
    path('', notification_list, name='notification-list'),
    path('read-all/', notification_read_all, name='notification-read-all'),
    path('<int:pk>/read/', notification_read, name='notification-read'),
]
