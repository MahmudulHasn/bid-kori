from rest_framework.pagination import PageNumberPagination


class SellerSalesPagination(PageNumberPagination):
    """Seller completed-sales ledger — fixed page size for stable UI contracts."""

    page_size = 20
    page_size_query_param = None
    max_page_size = 20
