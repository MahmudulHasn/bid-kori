"""HTTP API for the BidKori support chatbot (AI-B02)."""

from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .chat_service import AIChatError, AIChatService, resolve_chat_role_label
from .route_registry import get_role_suggestions, match_route_or_intent
from .serializers import SupportChatSerializer
from .throttling import AIChatBurstThrottle


class SupportChatView(APIView):
    """Stateless BidKori platform-help chat (CHAT-X01).

    Public (AllowAny). Auth determines user role authoritatively from Django session/token.
    Provides deterministic safe navigation and grounded LLM answers.
    """

    permission_classes = [AllowAny]
    throttle_classes = [AIChatBurstThrottle]
    throttle_scope = 'ai_chat'

    @extend_schema(
        tags=['AI'],
        summary='BidKori support chat (stateless & role-aware)',
        request=SupportChatSerializer,
        responses={200: dict},
    )
    def post(self, request):
        serializer = SupportChatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.validated_data['message']
        pathname = serializer.validated_data.get('pathname', '')
        client_context = serializer.validated_data.get('context', {})

        user = request.user
        if user and getattr(user, 'is_authenticated', False):
            from users.models import resolve_user_role
            market_role = resolve_user_role(user)
        else:
            market_role = 'ANONYMOUS'

        # 1. Deterministic intent & safe navigation
        matched = match_route_or_intent(
            message=message,
            role=market_role,
            pathname=pathname,
            context=client_context,
        )
        if matched is not None:
            return Response(matched, status=status.HTTP_200_OK)

        # 2. General explanation via AIChatService
        role_label = resolve_chat_role_label(user)
        try:
            answer = AIChatService.answer(message=message, role_label=role_label)
        except AIChatError as exc:
            return Response({'error': exc.message}, status=exc.status_code)

        return Response({'answer': answer}, status=status.HTTP_200_OK)
