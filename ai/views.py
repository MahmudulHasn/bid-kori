"""HTTP API for the BidKori support chatbot (AI-B02)."""

from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .chat_service import AIChatError, AIChatService, resolve_chat_role_label
from .serializers import SupportChatSerializer
from .throttling import AIChatBurstThrottle


class SupportChatView(APIView):
    """Stateless BidKori platform-help chat.

    Public (AllowAny). Optional auth enables Buyer/Seller navigation flavor only.
    No tools, persistence, private data, or actions.
    """

    permission_classes = [AllowAny]
    throttle_classes = [AIChatBurstThrottle]
    throttle_scope = 'ai_chat'

    @extend_schema(
        tags=['AI'],
        summary='BidKori support chat (stateless)',
        request=SupportChatSerializer,
        responses={200: dict},
    )
    def post(self, request):
        serializer = SupportChatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.validated_data['message']
        role_label = resolve_chat_role_label(request.user)

        try:
            answer = AIChatService.answer(message=message, role_label=role_label)
        except AIChatError as exc:
            return Response({'error': exc.message}, status=exc.status_code)

        return Response({'answer': answer}, status=status.HTTP_200_OK)
