from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification
from .pagination import NotificationPagination
from .serializers import NotificationSerializer


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """User-scoped persistent notification inbox (NT-B01).

    Surface:
    * ``GET  /api/notifications/``
    * ``POST /api/notifications/<id>/read/``
    * ``POST /api/notifications/read-all/``

    No create/update/delete. Admin has no global bypass.
    """

    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = NotificationPagination
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=True, methods=['post'], url_path='read')
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=['is_read'])
        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=['post'], url_path='read-all')
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({'updated': updated}, status=status.HTTP_200_OK)
