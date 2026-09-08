"""Admin-facing platform financial summary (MON-F01)."""

from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .financial import admin_financial_summary
from .serializers import AdminFinancialSummarySerializer


class AdminFinancialSummaryView(APIView):
    """Exact platform revenue aggregates from COMPLETED Payment snapshots."""

    permission_classes = [IsAdminUser]

    @extend_schema(
        tags=['Admin Finance'],
        summary='Admin financial summary (mock checkout ledger)',
        responses={200: AdminFinancialSummarySerializer},
    )
    def get(self, request):
        payload = admin_financial_summary()
        serializer = AdminFinancialSummarySerializer(payload)
        return Response(serializer.data)
