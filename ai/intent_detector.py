"""Regex-based auction intent classification for BidKori chatbot (CHAT-X02).

Classifies user messages into structured intents without involving the LLM.
Returns None when no auction intent is detected, allowing fallback to the
LLM general help pathway.

Intent types:
- SEARCH_AUCTIONS: keyword/price/condition search
- SEARCH_BY_CATEGORY: category-specific auction search
- GET_AUCTION_DETAILS: fetch details by auction ID
- GET_CURRENT_BID: current bid for a specific auction
- GET_TIME_REMAINING: time left for a specific auction
- GET_CATEGORY_LIST: list all categories
- GET_ENDING_SOON: auctions ending soonest
- GET_AUCTION_COUNT: count of live auctions
- GET_ACTIVE_AUCTIONS: list all live auctions
- NAVIGATE_TO_AUCTION: find and navigate to a specific auction
"""

from __future__ import annotations

import re
from typing import Any


def _normalize(text: str) -> str:
    """Lowercase, collapse whitespace, strip punctuation at edges."""
    return re.sub(r'\s+', ' ', text.strip().lower())


def _extract_price(text: str) -> tuple[float | None, float | None]:
    """Extract price constraints from text.

    Patterns:
    - "under 5000" / "below 5000" / "less than 5000" → max_price=5000
    - "above 5000" / "over 5000" / "more than 5000" → min_price=5000
    - "between 1000 and 5000" → min_price=1000, max_price=5000
    """
    max_price = None
    min_price = None

    # "between X and Y"
    m = re.search(r'between\s+(\d[\d,]*)\s+(?:and|to|-)\s+(\d[\d,]*)', text)
    if m:
        min_price = float(m.group(1).replace(',', ''))
        max_price = float(m.group(2).replace(',', ''))
        return min_price, max_price

    # "under/below/less than X"
    m = re.search(r'(?:under|below|less\s+than|cheaper\s+than|max|at\s+most)\s+[\$৳]?(\d[\d,]*)', text)
    if m:
        max_price = float(m.group(1).replace(',', ''))

    # "above/over/more than X"
    m = re.search(r'(?:above|over|more\s+than|at\s+least|min(?:imum)?)\s+[\$৳]?(\d[\d,]*)', text)
    if m:
        min_price = float(m.group(1).replace(',', ''))

    return min_price, max_price


def _extract_auction_id(text: str) -> int | None:
    """Extract an auction ID from text.

    Patterns: "auction #42", "auction 42", "AUC-42", "#42"
    """
    # "auction #42" or "auction 42"
    m = re.search(r'auction\s*#?\s*(\d+)', text)
    if m:
        return int(m.group(1))

    # "AUC-42"
    m = re.search(r'auc[- ]?(\d+)', text)
    if m:
        return int(m.group(1))

    # Standalone "#42" — only match if preceded by intent keywords
    m = re.search(r'#(\d+)', text)
    if m:
        return int(m.group(1))

    return None


def _extract_condition(text: str) -> str | None:
    """Extract product condition from text."""
    conditions = {
        'brand new': 'NEW',
        'new': 'NEW',
        'like new': 'USED_LIKE_NEW',
        'used like new': 'USED_LIKE_NEW',
        'used good': 'USED_GOOD',
        'good condition': 'USED_GOOD',
        'fair': 'FAIR',
        'fair condition': 'FAIR',
    }
    for label, value in conditions.items():
        if label in text:
            return value
    return None


def _extract_sort(text: str) -> str:
    """Extract sorting preference from text."""
    if any(kw in text for kw in ['cheapest', 'lowest price', 'price low', 'low to high']):
        return 'price_asc'
    if any(kw in text for kw in ['expensive', 'highest price', 'price high', 'high to low', 'most expensive', 'priciest']):
        return 'price_desc'
    if any(kw in text for kw in ['newest', 'latest', 'recently', 'new listing']):
        return 'newest'
    if any(kw in text for kw in ['ending soon', 'ending first', 'about to end', 'almost over']):
        return 'ending_soon'
    return 'ending_soon'


def _extract_search_query(text: str) -> str | None:
    """Extract the meaningful search query from a user message.

    Strips intent prefixes like "show me", "find", "search for", etc.
    to leave only the product/keyword terms.
    """
    # Remove navigation/search prefixes
    prefixes = [
        r'(?:can you |please |could you )?(?:show me |find me |search for |look for |find |search |look up |get me )',
        r'(?:i (?:want|need|am looking for|would like) (?:to see |to find )?)',
        r'(?:are there any |is there (?:a |an )?|do you have (?:any )?)',
        r'(?:what |which )(?:are the |are )',
        r'take me to (?:the )?',
        r'open (?:the )?',
        r'go to (?:the )?',
        r'navigate to (?:the )?',
    ]

    cleaned = text
    for prefix_pattern in prefixes:
        cleaned = re.sub(f'^{prefix_pattern}', '', cleaned).strip()

    # Remove trailing "auctions", "auction", "listings"
    cleaned = re.sub(r'\s*(?:auction|auctions|listings?)\s*$', '', cleaned).strip()

    # Remove price/condition/sort qualifiers
    cleaned = re.sub(r'(?:under|below|above|over|less than|more than|between)\s+[\$৳]?\d[\d,]*(?:\s+(?:and|to)\s+[\$৳]?\d[\d,]*)?', '', cleaned).strip()
    cleaned = re.sub(r'(?:brand new|like new|used (?:good|like new)|fair condition|good condition)', '', cleaned).strip()
    cleaned = re.sub(r'(?:cheapest|most expensive|newest|ending soon|latest|priciest)', '', cleaned).strip()
    cleaned = re.sub(r'(?:taka|bdt|tk|৳)', '', cleaned).strip()
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()

    # If nothing meaningful is left
    if not cleaned or len(cleaned) < 2:
        return None

    return cleaned


# Known category names — used to detect category-specific intent.
# These are loaded lazily from the database on first use.
_cached_categories: list[str] | None = None


def _get_known_categories() -> list[str]:
    """Load category names from DB (cached per process)."""
    global _cached_categories
    if _cached_categories is None:
        try:
            from products.models import Category
            _cached_categories = list(
                Category.objects.values_list('name', flat=True)
            )
        except Exception:
            _cached_categories = []
    return _cached_categories


def _match_category(text: str) -> str | None:
    """Check if the text mentions a known category name."""
    categories = _get_known_categories()
    for cat_name in categories:
        if cat_name.lower() in text:
            return cat_name
    return None


# ─── Intent patterns ───────────────────────────────────────────────

# Patterns that indicate the user wants to search/browse auctions
_SEARCH_PATTERNS = [
    r'show\s+(?:me\s+)?(?:(?:live|active|current|all)\s+)?(?:\w+\s+)?auctions?',
    r'find\s+(?:me\s+)?(?:\w+\s+)?auctions?',
    r'search\s+(?:for\s+)?(?:\w+\s+)?auctions?',
    r'(?:any|are there)\s+(?:\w+\s+)?auctions?',
    r'i\s+(?:want|need|am looking)\s+(?:to\s+)?(?:see|find|browse)\s+(?:\w+\s+)?auctions?',
    r'(?:looking for|interested in)\s+(?:\w+\s+)?auctions?',
    r'(?:show|find|get|list)\s+(?:me\s+)?(?:live|active|current)\s+auctions?',
    r'what\s+(?:auctions?|items?|products?)\s+(?:are|is)\s+(?:live|active|available)',
    r'(?:show|find|list)\s+(?:me\s+)?(?:the\s+)?(?:cheapest|most expensive|newest|latest)',
    r'(?:show|find|list)\s+(?:me\s+)?(?:\w+\s+)?(?:under|below|above|over)\s+\d+',
    r'(?:show|find)\s+(?:me\s+)?\w+\s+(?:auction|item|product)s?\s+',
    r'(?:i want to see|let me see)\s+\w+\s+auctions?',
]

# Patterns for getting specific auction details by ID
_DETAILS_PATTERNS = [
    r'(?:details?|info|information)\s+(?:of|about|for|on)\s+auction\s*#?\s*\d+',
    r'auction\s*#?\s*\d+\s+(?:details?|info)',
    r'(?:show|tell)\s+(?:me\s+)?(?:about|details of)\s+auction\s*#?\s*\d+',
    r'what(?:\'s| is)\s+auction\s*#?\s*\d+',
]

# Patterns for asking about current bid
_BID_PATTERNS = [
    r'(?:what|how much)\s+(?:is|are)\s+(?:the\s+)?(?:current|highest|top|latest)\s+bid',
    r'(?:current|highest|top)\s+bid\s+(?:for|on|of)',
    r'how much\s+(?:is|are)\s+(?:the\s+)?\w+\s+(?:auction|going for)',
    r'what\s+(?:is|are)\s+(?:\w+\s+)?(?:auction\s+)?(?:going for|at|priced)',
    r'(?:bid|price)\s+(?:for|on|of)\s+(?:the\s+)?\w+',
]

# Patterns for asking about time remaining
_TIME_PATTERNS = [
    r'(?:how much|how long)\s+(?:time\s+)?(?:is\s+)?(?:left|remaining)',
    r'(?:when|what time)\s+(?:does|will|is)\s+(?:the\s+)?\w+\s+(?:auction\s+)?(?:end|close|finish)',
    r'time\s+(?:left|remaining)\s+(?:for|on|of)',
    r'(?:is|does)\s+(?:the\s+)?\w+\s+(?:auction\s+)?(?:ending|closing)\s+soon',
]

# Patterns for category listing
_CATEGORY_LIST_PATTERNS = [
    r'(?:what|which|list|show)\s+(?:are\s+)?(?:the\s+)?(?:available\s+)?categories',
    r'(?:all|available|list)\s+categories',
    r'(?:show|list|get)\s+(?:me\s+)?(?:all\s+)?categories',
    r'category\s+list',
    r'what\s+(?:kinds?|types?)\s+(?:of\s+)?(?:items?|products?|auctions?)\s+(?:are\s+)?(?:there|available)',
    r'(?:do you have|is there)\s+(?:a\s+)?\w+\s+category',
]

# Patterns for ending soon
_ENDING_SOON_PATTERNS = [
    r'(?:what(?:\'s)?|which)\s+(?:is|are)\s+ending\s+soon',
    r'(?:auctions?\s+)?ending\s+soon',
    r'(?:about|almost)\s+(?:to\s+)?end',
    r'(?:show|find|get|list)\s+(?:me\s+)?(?:auctions?\s+)?ending\s+(?:soon|first)',
    r'(?:what|which)\s+(?:auction|auctions|item|items)\s+(?:is|are)\s+(?:ending|closing)\s+(?:soon|first|next)',
    r'closing\s+soon',
]

# Patterns for auction count
_COUNT_PATTERNS = [
    r'how\s+many\s+(?:live|active|current)?\s*auctions?',
    r'(?:total|number|count)\s+(?:of\s+)?(?:live|active|current)?\s*auctions?',
    r'how\s+many\s+(?:items?|products?|listings?)\s+(?:are\s+)?(?:live|active|up)',
]

# Patterns for navigating to a specific auction
_NAVIGATE_PATTERNS = [
    r'(?:take\s+me\s+to|open|go\s+to|navigate\s+to|show\s+me)\s+(?:the\s+)?\w+.*?auction',
    r'(?:take\s+me\s+to|open|go\s+to)\s+auction\s*#?\s*\d+',
]

# Patterns for private-data or action requests (security guard)
_PRIVATE_DATA_PATTERNS = [
    r'(?:show|tell|give)\s+(?:me\s+)?(?:\w+\s+)?(?:bids?|bidding|bid history)',
    r'(?:show|tell|give)\s+(?:me\s+)?(?:user|bidder|seller)\s+\w+\s+(?:data|info|email|phone|address|bids?)',
    r'(?:what|who)\s+(?:did|has)\s+(?:user|bidder)\s+\w+\s+(?:bid|win|buy)',
    r'(?:who\s+is|who\'s)\s+(?:winning|leading|the\s+(?:highest|top)\s+bidder)',
    r'(?:show|give|tell)\s+(?:me\s+)?\w+\s+(?:bid|bidding)\s+(?:history|data|info)',
]


def _matches_any(text: str, patterns: list[str]) -> bool:
    """Check if text matches any of the regex patterns."""
    for pattern in patterns:
        if re.search(pattern, text):
            return True
    return False


def detect_auction_intent(
    message: str,
    role: str = 'ANONYMOUS',
) -> dict[str, Any] | None:
    """Classify user message into an auction-related intent.

    Returns a dict with 'intent' and extracted parameters, or None if
    no auction intent is detected (message should fall through to LLM).

    Args:
        message: The raw user message.
        role: The user's marketplace role (ANONYMOUS, BUYER, SELLER, ADMIN).

    Returns:
        Intent dict or None.
    """
    norm = _normalize(message)

    if not norm or len(norm) < 3:
        return None

    # ── Security: private data / identity requests ──
    if _matches_any(norm, _PRIVATE_DATA_PATTERNS):
        return {
            'intent': 'PRIVATE_DATA_GUARD',
            'answer': (
                'For privacy and security, I cannot reveal information about other users\' '
                'bids, identities, or personal data. '
                'I can help you search for live auctions or navigate to specific pages.'
            ),
        }

    # ── Category listing ──
    if _matches_any(norm, _CATEGORY_LIST_PATTERNS):
        return {'intent': 'GET_CATEGORY_LIST'}

    # ── Auction count ──
    if _matches_any(norm, _COUNT_PATTERNS):
        return {'intent': 'GET_AUCTION_COUNT'}

    # ── Ending soon ──
    if _matches_any(norm, _ENDING_SOON_PATTERNS):
        return {'intent': 'GET_ENDING_SOON'}

    # ── Specific auction by ID: details ──
    if _matches_any(norm, _DETAILS_PATTERNS):
        auction_id = _extract_auction_id(norm)
        if auction_id:
            return {'intent': 'GET_AUCTION_DETAILS', 'auction_id': auction_id}

    # ── Current bid query ──
    if _matches_any(norm, _BID_PATTERNS):
        auction_id = _extract_auction_id(norm)
        if auction_id:
            return {'intent': 'GET_CURRENT_BID', 'auction_id': auction_id}
        # Try to extract search term to find the auction by name
        search_query = _extract_search_query(norm)
        if search_query:
            return {'intent': 'GET_CURRENT_BID', 'search_query': search_query}

    # ── Time remaining query ──
    if _matches_any(norm, _TIME_PATTERNS):
        auction_id = _extract_auction_id(norm)
        if auction_id:
            return {'intent': 'GET_TIME_REMAINING', 'auction_id': auction_id}
        search_query = _extract_search_query(norm)
        if search_query:
            return {'intent': 'GET_TIME_REMAINING', 'search_query': search_query}

    # ── Navigate to a specific auction by ID ──
    navigate_by_id = re.search(r'(?:take\s+me\s+to|open|go\s+to)\s+auction\s*#?\s*(\d+)', norm)
    if navigate_by_id:
        return {
            'intent': 'NAVIGATE_TO_AUCTION',
            'auction_id': int(navigate_by_id.group(1)),
        }

    # ── Category-specific auction search ──
    matched_category = _match_category(norm)
    if matched_category and any(kw in norm for kw in ['auction', 'show', 'find', 'browse', 'list', 'see', 'search', 'want', 'looking', 'interested']):
        return {
            'intent': 'SEARCH_BY_CATEGORY',
            'category': matched_category,
        }

    # ── General auction search ──
    if _matches_any(norm, _SEARCH_PATTERNS):
        min_price, max_price = _extract_price(norm)
        condition = _extract_condition(norm)
        sort_by = _extract_sort(norm)
        search_query = _extract_search_query(norm)

        return {
            'intent': 'SEARCH_AUCTIONS',
            'query': search_query,
            'min_price': min_price,
            'max_price': max_price,
            'condition': condition,
            'sort_by': sort_by,
        }

    # ── Navigate to auction by name (broader pattern — only if not a search) ──
    if _matches_any(norm, _NAVIGATE_PATTERNS):
        search_query = _extract_search_query(norm)
        if search_query:
            return {
                'intent': 'NAVIGATE_TO_AUCTION',
                'search_query': search_query,
            }

    return None


def invalidate_category_cache():
    """Force reload of category names on next intent detection."""
    global _cached_categories
    _cached_categories = None
