from rest_framework.pagination import PageNumberPagination


class NotificationPagination(PageNumberPagination):
    """Inbox pagination — notifications grow continuously."""

    page_size = 20
    page_size_query_param = None
    max_page_size = 20
