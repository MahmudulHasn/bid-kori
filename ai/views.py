"""HTTP API for the BidKori support chatbot (AI-B02, CHAT-X02).

Pipeline:
1. Deterministic route/intent match (existing CHAT-X01)
2. Auction-aware intent detection + tool execution (CHAT-X02)
3. Fallback → LLM general help (AI-B02)
"""

from __future__ import annotations

import logging

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .auction_tools import (
    format_taka,
    format_time_remaining,
    get_auction_count,
    get_auction_details,
    get_categories_with_counts,
    get_current_bid,
    get_ending_soon,
    get_time_remaining,
    search_by_category,
    search_live_auctions,
)
from .chat_service import AIChatError, AIChatService, resolve_chat_role_label
from .intent_detector import detect_auction_intent
from .route_registry import get_role_suggestions, match_route_or_intent
from .serializers import SupportChatSerializer
from .throttling import AIChatBurstThrottle

logger = logging.getLogger(__name__)


def _build_auction_response(
    *,
    answer: str,
    auction_cards: list | None = None,
    action: dict | None = None,
    suggestions: list | None = None,
    role: str = 'ANONYMOUS',
) -> dict:
    """Build a structured chat response with optional auction cards."""
    return {
        'answer': answer,
        'message': answer,
        'action': action,
        'auction_cards': auction_cards or [],
        'suggestions': suggestions or get_role_suggestions(role),
    }


def _handle_search_auctions(intent: dict, role: str) -> dict:
    """Handle SEARCH_AUCTIONS intent."""
    cards = search_live_auctions(
        query=intent.get('query'),
        category=intent.get('category'),
        max_price=intent.get('max_price'),
        min_price=intent.get('min_price'),
        condition=intent.get('condition'),
        sort_by=intent.get('sort_by', 'ending_soon'),
    )

    if not cards:
        query = intent.get('query', '')
        msg = f'I could not find any live auctions{f" matching \"{query}\"" if query else ""}. '
        msg += 'Try browsing all auctions in the marketplace.'
        return _build_auction_response(
            answer=msg,
            action={
                'type': 'navigate',
                'href': '/auctions',
                'label': 'Browse All Auctions',
            },
            role=role,
        )

    count = len(cards)
    query = intent.get('query', '')
    label = f'matching "{query}"' if query else 'live right now'
    answer = f'I found {count} auction{"s" if count > 1 else ""} {label}:'

    for card in cards:
        bid_label = format_taka(card['current_bid'])
        time_label = format_time_remaining(card['ends_in_seconds'])
        answer += f'\n• **{card["title"]}** — {bid_label} ({card["bid_count"]} bids, {time_label} left)'

    return _build_auction_response(
        answer=answer,
        auction_cards=cards,
        role=role,
    )


def _handle_search_by_category(intent: dict, role: str) -> dict:
    """Handle SEARCH_BY_CATEGORY intent."""
    category = intent.get('category', '')
    cards = search_by_category(category)

    if not cards:
        msg = f'There are no live auctions in the "{category}" category right now. Try browsing the marketplace.'
        return _build_auction_response(
            answer=msg,
            action={
                'type': 'navigate',
                'href': '/auctions',
                'label': 'Browse All Auctions',
            },
            role=role,
        )

    count = len(cards)
    answer = f'I found {count} live auction{"s" if count > 1 else ""} in **{category}**:'

    for card in cards:
        bid_label = format_taka(card['current_bid'])
        time_label = format_time_remaining(card['ends_in_seconds'])
        answer += f'\n• **{card["title"]}** — {bid_label} ({card["bid_count"]} bids, {time_label} left)'

    return _build_auction_response(
        answer=answer,
        auction_cards=cards,
        role=role,
    )


def _handle_get_auction_details(intent: dict, role: str) -> dict:
    """Handle GET_AUCTION_DETAILS intent."""
    auction_id = intent.get('auction_id')
    if not auction_id:
        return _build_auction_response(
            answer='Please provide an auction number. For example: "details of auction #42".',
            role=role,
        )

    card = get_auction_details(auction_id)
    if not card:
        return _build_auction_response(
            answer=f'I could not find auction #{auction_id}. It may not exist, or it may be unavailable.',
            role=role,
        )

    bid_label = format_taka(card['current_bid'])
    starting = format_taka(card['starting_bid'])
    time_label = format_time_remaining(card['ends_in_seconds'])

    answer = f'**{card["title"]}** (Auction #{card["auction_id"]})\n'
    answer += f'• Status: {card["status"]}\n'
    answer += f'• Starting bid: {starting}\n'
    answer += f'• Current highest bid: {bid_label}\n'
    answer += f'• Total bids: {card["bid_count"]}\n'
    answer += f'• Time remaining: {time_label}\n'
    if card.get('category_name'):
        answer += f'• Category: {card["category_name"]}\n'
    if card.get('has_reserve'):
        met = 'Yes ✓' if card.get('reserve_met') else 'Not yet'
        answer += f'• Reserve met: {met}'

    return _build_auction_response(
        answer=answer,
        auction_cards=[card],
        action={
            'type': 'navigate',
            'href': card['href'],
            'label': f'View {card["title"]}',
        },
        role=role,
    )


def _handle_get_current_bid(intent: dict, role: str) -> dict:
    """Handle GET_CURRENT_BID intent."""
    auction_id = intent.get('auction_id')
    search_query = intent.get('search_query')

    if auction_id:
        bid_info = get_current_bid(auction_id)
        if not bid_info:
            return _build_auction_response(
                answer=f'I could not find auction #{auction_id}.',
                role=role,
            )
        bid_label = format_taka(bid_info['current_bid'])
        answer = (
            f'**{bid_info["title"]}** (Auction #{bid_info["auction_id"]})\n'
            f'Current highest bid: {bid_label} ({bid_info["bid_count"]} bids placed)'
        )
        return _build_auction_response(
            answer=answer,
            action={
                'type': 'navigate',
                'href': bid_info['href'],
                'label': f'View {bid_info["title"]}',
            },
            role=role,
        )

    if search_query:
        cards = search_live_auctions(query=search_query, limit=1)
        if not cards:
            return _build_auction_response(
                answer=f'I could not find a live auction matching "{search_query}".',
                role=role,
            )
        card = cards[0]
        bid_label = format_taka(card['current_bid'])
        answer = (
            f'**{card["title"]}**\n'
            f'Current highest bid: {bid_label} ({card["bid_count"]} bids placed)'
        )
        return _build_auction_response(
            answer=answer,
            auction_cards=[card],
            action={
                'type': 'navigate',
                'href': card['href'],
                'label': f'View {card["title"]}',
            },
            role=role,
        )

    return _build_auction_response(
        answer='Please specify which auction you want to check. For example: "current bid on the iPhone auction".',
        role=role,
    )


def _handle_get_time_remaining(intent: dict, role: str) -> dict:
    """Handle GET_TIME_REMAINING intent."""
    auction_id = intent.get('auction_id')
    search_query = intent.get('search_query')

    if auction_id:
        time_info = get_time_remaining(auction_id)
        if not time_info:
            return _build_auction_response(
                answer=f'I could not find auction #{auction_id}.',
                role=role,
            )
        time_label = format_time_remaining(time_info['ends_in_seconds'])
        answer = (
            f'**{time_info["title"]}** (Auction #{time_info["auction_id"]})\n'
            f'Time remaining: {time_label}'
        )
        return _build_auction_response(
            answer=answer,
            action={
                'type': 'navigate',
                'href': time_info['href'],
                'label': f'View {time_info["title"]}',
            },
            role=role,
        )

    if search_query:
        cards = search_live_auctions(query=search_query, limit=1)
        if not cards:
            return _build_auction_response(
                answer=f'I could not find a live auction matching "{search_query}".',
                role=role,
            )
        card = cards[0]
        time_label = format_time_remaining(card['ends_in_seconds'])
        answer = (
            f'**{card["title"]}**\n'
            f'Time remaining: {time_label}'
        )
        return _build_auction_response(
            answer=answer,
            auction_cards=[card],
            action={
                'type': 'navigate',
                'href': card['href'],
                'label': f'View {card["title"]}',
            },
            role=role,
        )

    return _build_auction_response(
        answer='Please specify which auction. For example: "how much time left on the Rolex auction?".',
        role=role,
    )


def _handle_get_category_list(role: str) -> dict:
    """Handle GET_CATEGORY_LIST intent."""
    categories = get_categories_with_counts()

    if not categories:
        return _build_auction_response(
            answer='No categories have been created yet on BidKori.',
            role=role,
        )

    answer = f'BidKori has {len(categories)} categories:\n'
    for cat in categories:
        count_label = f'({cat["active_auction_count"]} live)' if cat['active_auction_count'] > 0 else '(no live auctions)'
        answer += f'• **{cat["name"]}** {count_label}\n'

    answer += '\nWant to see auctions in a specific category? Just ask!'

    return _build_auction_response(
        answer=answer.strip(),
        action={
            'type': 'navigate',
            'href': '/auctions',
            'label': 'Browse All Auctions',
        },
        role=role,
    )


def _handle_get_ending_soon(role: str) -> dict:
    """Handle GET_ENDING_SOON intent."""
    cards = get_ending_soon()

    if not cards:
        return _build_auction_response(
            answer='There are no live auctions right now. Check back soon!',
            action={
                'type': 'navigate',
                'href': '/auctions',
                'label': 'Browse Auctions',
            },
            role=role,
        )

    answer = f'Here are the auctions ending soonest:'
    for card in cards:
        bid_label = format_taka(card['current_bid'])
        time_label = format_time_remaining(card['ends_in_seconds'])
        answer += f'\n• **{card["title"]}** — {bid_label} ({time_label} left)'

    return _build_auction_response(
        answer=answer,
        auction_cards=cards,
        role=role,
    )


def _handle_get_auction_count(role: str) -> dict:
    """Handle GET_AUCTION_COUNT intent."""
    count = get_auction_count()

    if count == 0:
        return _build_auction_response(
            answer='There are no live auctions right now. Check back soon!',
            role=role,
        )

    answer = f'There {"is" if count == 1 else "are"} **{count}** live auction{"s" if count != 1 else ""} right now on BidKori.'
    return _build_auction_response(
        answer=answer,
        action={
            'type': 'navigate',
            'href': '/auctions',
            'label': 'Browse All Auctions',
        },
        role=role,
    )


def _handle_navigate_to_auction(intent: dict, role: str) -> dict:
    """Handle NAVIGATE_TO_AUCTION intent."""
    auction_id = intent.get('auction_id')
    search_query = intent.get('search_query')

    if auction_id:
        card = get_auction_details(auction_id)
        if not card:
            return _build_auction_response(
                answer=f'I could not find auction #{auction_id}.',
                role=role,
            )
        return _build_auction_response(
            answer=f'Here is **{card["title"]}** (Auction #{card["auction_id"]}). Click below to view it.',
            auction_cards=[card],
            action={
                'type': 'navigate',
                'href': card['href'],
                'label': f'Open {card["title"]}',
            },
            role=role,
        )

    if search_query:
        cards = search_live_auctions(query=search_query, limit=3)
        if not cards:
            return _build_auction_response(
                answer=f'I could not find a live auction matching "{search_query}". Try the marketplace to browse all auctions.',
                action={
                    'type': 'navigate',
                    'href': '/auctions',
                    'label': 'Browse All Auctions',
                },
                role=role,
            )

        if len(cards) == 1:
            card = cards[0]
            return _build_auction_response(
                answer=f'I found **{card["title"]}**. Click below to view the auction.',
                auction_cards=[card],
                action={
                    'type': 'navigate',
                    'href': card['href'],
                    'label': f'Open {card["title"]}',
                },
                role=role,
            )

        answer = f'I found {len(cards)} auctions matching "{search_query}". Which one would you like to view?'
        for card in cards:
            bid_label = format_taka(card['current_bid'])
            answer += f'\n• **{card["title"]}** — {bid_label}'

        return _build_auction_response(
            answer=answer,
            auction_cards=cards,
            role=role,
        )

    return _build_auction_response(
        answer='Please specify which auction. For example: "take me to the iPhone auction".',
        role=role,
    )


def _dispatch_auction_intent(intent: dict, role: str) -> dict | None:
    """Dispatch a detected auction intent to the appropriate handler.

    Returns a response dict, or None if intent dispatch fails.
    """
    intent_type = intent.get('intent')

    if intent_type == 'PRIVATE_DATA_GUARD':
        return _build_auction_response(
            answer=intent.get('answer', 'That information is not available.'),
            role=role,
        )

    try:
        if intent_type == 'SEARCH_AUCTIONS':
            return _handle_search_auctions(intent, role)
        if intent_type == 'SEARCH_BY_CATEGORY':
            return _handle_search_by_category(intent, role)
        if intent_type == 'GET_AUCTION_DETAILS':
            return _handle_get_auction_details(intent, role)
        if intent_type == 'GET_CURRENT_BID':
            return _handle_get_current_bid(intent, role)
        if intent_type == 'GET_TIME_REMAINING':
            return _handle_get_time_remaining(intent, role)
        if intent_type == 'GET_CATEGORY_LIST':
            return _handle_get_category_list(role)
        if intent_type == 'GET_ENDING_SOON':
            return _handle_get_ending_soon(role)
        if intent_type == 'GET_AUCTION_COUNT':
            return _handle_get_auction_count(role)
        if intent_type == 'NAVIGATE_TO_AUCTION':
            return _handle_navigate_to_auction(intent, role)
        if intent_type == 'GET_ACTIVE_AUCTIONS':
            return _handle_search_auctions(intent, role)
    except Exception:
        logger.exception('Auction intent dispatch error intent=%s', intent_type)
        return None

    return None


class SupportChatView(APIView):
    """Stateless BidKori platform-help chat (CHAT-X01, CHAT-X02).

    Public (AllowAny). Auth determines user role authoritatively from Django session/token.
    Provides deterministic safe navigation, auction-aware search, and grounded LLM answers.

    Pipeline:
    1. Deterministic route/intent match
    2. Auction-aware intent detection + tool execution
    3. Fallback → LLM general help
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

        # 1. Deterministic intent & safe navigation (existing CHAT-X01)
        matched = match_route_or_intent(
            message=message,
            role=market_role,
            pathname=pathname,
            context=client_context,
        )
        if matched is not None:
            return Response(matched, status=status.HTTP_200_OK)

        # 2. Auction-aware intent detection + tool execution (CHAT-X02)
        auction_intent = detect_auction_intent(message, role=market_role)
        if auction_intent is not None:
            result = _dispatch_auction_intent(auction_intent, role=market_role)
            if result is not None:
                return Response(result, status=status.HTTP_200_OK)

        # 3. General explanation via AIChatService (AI-B02 fallback)
        role_label = resolve_chat_role_label(user)
        try:
            answer = AIChatService.answer(message=message, role_label=role_label)
        except AIChatError as exc:
            return Response({'error': exc.message}, status=exc.status_code)

        return Response({'answer': answer}, status=status.HTTP_200_OK)
