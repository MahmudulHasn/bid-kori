"""
Centralized Safe Route Registry and Intent Matching for BidKori Help (CHAT-X01).

Guarantees:
- Only approved internal routes can ever be returned as navigation actions.
- Role checks strictly honor backend authenticated user role (ANONYMOUS, BUYER, SELLER, ADMIN).
- Never generates arbitrary URLs, javascript:, data:, or external links.
- Handles deterministic navigation shortcuts even if AI provider is offline.
- Handles deferred features truthfully without hallucinating navigation.
- Handles page-aware contextual help (UPCOMING, CLOSED, LIVE auction state).
"""

from __future__ import annotations

import re
from typing import Any

# Authoritative Route Registry
ROUTE_REGISTRY: list[dict[str, Any]] = [
    # PUBLIC ROUTES
    {
        'href': '/',
        'title': 'Home',
        'description': 'BidKori marketplace homepage with live auctions and category shortcuts.',
        'roles': {'ANONYMOUS', 'BUYER', 'SELLER', 'ADMIN'},
        'keywords': ['home', 'homepage', 'main page', 'landing page', 'start', 'bidkori'],
        'default_label': 'Go to Home',
    },
    {
        'href': '/auctions',
        'title': 'Browse Auctions',
        'description': 'Marketplace auctions directory showing all live and upcoming listings.',
        'roles': {'ANONYMOUS', 'BUYER', 'SELLER', 'ADMIN'},
        'keywords': [
            'auctions',
            'browse auctions',
            'all auctions',
            'marketplace',
            'find auctions',
            'view listings',
            'listings',
            'take me to auctions',
            'open auctions',
            'go to auctions',
            'show auctions',
        ],
        'default_label': 'Browse Auctions',
    },
    {
        'href': '/search',
        'title': 'Search',
        'description': 'Search auctions and products by keyword, category, or status.',
        'roles': {'ANONYMOUS', 'BUYER', 'SELLER', 'ADMIN'},
        'keywords': ['search', 'search marketplace', 'find item', 'search products', 'lookup'],
        'default_label': 'Search Marketplace',
    },
    {
        'href': '/auth/login',
        'title': 'Sign In',
        'description': 'Sign in to your BidKori account to place bids or manage listings.',
        'roles': {'ANONYMOUS', 'BUYER', 'SELLER', 'ADMIN'},
        'keywords': ['login', 'sign in', 'log in', 'signin', 'authenticate'],
        'default_label': 'Sign In',
    },
    {
        'href': '/auth/register',
        'title': 'Register',
        'description': 'Create a new Buyer or Seller account on BidKori.',
        'roles': {'ANONYMOUS', 'BUYER', 'SELLER', 'ADMIN'},
        'keywords': ['register', 'sign up', 'create account', 'signup', 'join bidkori', 'become a seller', 'how do i become a seller'],
        'default_label': 'Create Account',
    },

    # BUYER ROUTES
    {
        'href': '/buyer',
        'title': 'Buyer Dashboard',
        'description': 'Buyer account home with active bids, won auctions, and activity.',
        'roles': {'BUYER'},
        'keywords': ['buyer dashboard', 'buyer home', 'buyer account', 'buyer overview', 'my account'],
        'default_label': 'Open Buyer Dashboard',
    },
    {
        'href': '/buyer/my-bids',
        'title': 'My Bids',
        'description': 'Track all auctions you have bid on, your highest bids, and outbid status.',
        'roles': {'BUYER'},
        'keywords': [
            'my bids',
            'bids',
            'bid history',
            'participated auctions',
            'active bids',
            'outbid items',
            'where are my bids',
            'view my bids',
            'my bidding',
            'take me to my bids',
            'open my bids',
            'show my bids',
            'bidding history',
            'auctions i joined',
        ],
        'default_label': 'Open My Bids',
    },
    {
        'href': '/buyer/won',
        'title': 'Won Auctions',
        'description': 'View all auctions you have won, payment status, and checkout.',
        'roles': {'BUYER'},
        'keywords': [
            'won',
            'won auctions',
            'my wins',
            'items won',
            'things i won',
            'auctions i won',
            'checkout won',
            'where are my won auctions',
            'where are the auctions i won',
            'winning auctions',
            'open won',
            'show won',
            'view won',
        ],
        'default_label': 'View Won Auctions',
    },
    {
        'href': '/buyer/notifications',
        'title': 'Buyer Notifications',
        'description': 'In-app notifications for outbid alerts, won auctions, and platform updates.',
        'roles': {'BUYER'},
        'keywords': ['buyer notifications', 'outbid notifications', 'my notifications', 'buyer alerts', 'notifications'],
        'default_label': 'Open Notifications',
    },
    {
        'href': '/buyer/profile',
        'title': 'Buyer Profile',
        'description': 'View and edit your buyer profile details.',
        'roles': {'BUYER'},
        'keywords': ['buyer profile', 'my profile', 'edit my profile', 'where can i edit my profile', 'profile'],
        'default_label': 'View Profile',
    },
    {
        'href': '/buyer/settings',
        'title': 'Buyer Settings',
        'description': 'Buyer account preferences and settings.',
        'roles': {'BUYER'},
        'keywords': ['buyer settings', 'account settings', 'preferences'],
        'default_label': 'Open Settings',
    },

    # SELLER ROUTES
    {
        'href': '/seller',
        'title': 'Seller Dashboard',
        'description': 'Seller command center with active listings, sales overview, and quick actions.',
        'roles': {'SELLER'},
        'keywords': ['seller dashboard', 'seller home', 'seller overview', 'seller workspace', 'seller command center'],
        'default_label': 'Open Seller Dashboard',
    },
    {
        'href': '/seller/products',
        'title': 'Seller Products',
        'description': 'Manage your product inventory, photos, and descriptions.',
        'roles': {'SELLER'},
        'keywords': [
            'seller products',
            'my products',
            'product list',
            'inventory',
            'product catalog',
            'manage products',
            'seller inventory',
            'open seller products',
            'take me to seller products',
            'view products',
        ],
        'default_label': 'Manage Products',
    },
    {
        'href': '/seller/products/create',
        'title': 'Create Product',
        'description': 'Add a new product listing with AI description assistant and photos.',
        'roles': {'SELLER'},
        'keywords': [
            'create product',
            'add product',
            'new product',
            'list product',
            'new listing',
            'create a product',
            'how do i create a product',
            'how do i list an item',
            'how to add product',
        ],
        'default_label': 'Create Product',
    },
    {
        'href': '/seller/auctions',
        'title': 'Seller Auctions',
        'description': 'Manage your auctions, countdown timers, starting prices, and reserves.',
        'roles': {'SELLER'},
        'keywords': ['seller auctions', 'my auctions', 'auction list', 'manage auctions', 'view seller auctions', 'open seller auctions'],
        'default_label': 'Manage Auctions',
    },
    {
        'href': '/seller/auctions/create',
        'title': 'Create Auction',
        'description': 'Schedule and launch a new auction for an existing product.',
        'roles': {'SELLER'},
        'keywords': [
            'create auction',
            'create an auction',
            'new auction',
            'start auction',
            'launch auction',
            'schedule auction',
            'take me to create auction',
            'open create auction',
        ],
        'default_label': 'Create Auction',
    },
    {
        'href': '/seller/sales',
        'title': 'Seller Sales',
        'description': 'Review sales history, gross revenue, platform fees, and net earnings.',
        'roles': {'SELLER'},
        'keywords': [
            'seller sales',
            'sales',
            'earnings',
            'revenue',
            'sold items',
            'open seller sales',
            'view sales',
            'my sales',
            'show my sales',
            'where can i see sales',
            'see sales',
        ],
        'default_label': 'View Seller Sales',
    },
    {
        'href': '/seller/notifications',
        'title': 'Seller Notifications',
        'description': 'Notifications for new bids received, auction endings, and sales.',
        'roles': {'SELLER'},
        'keywords': ['seller notifications', 'bid alerts', 'sale alerts'],
        'default_label': 'Open Notifications',
    },
    {
        'href': '/seller/profile',
        'title': 'Seller Profile',
        'description': 'View and manage your seller business profile details.',
        'roles': {'SELLER'},
        'keywords': ['seller profile', 'store profile'],
        'default_label': 'View Profile',
    },
    {
        'href': '/seller/settings',
        'title': 'Seller Settings',
        'description': 'Seller preferences and workspace configuration.',
        'roles': {'SELLER'},
        'keywords': ['seller settings'],
        'default_label': 'Open Settings',
    },

    # ADMIN ROUTES
    {
        'href': '/admin',
        'title': 'Admin Command Center',
        'description': 'Platform overview, key metrics, and administrative oversight.',
        'roles': {'ADMIN'},
        'keywords': ['admin', 'admin dashboard', 'command center', 'admin overview', 'platform overview', 'admin command center', 'open admin'],
        'default_label': 'Open Admin Command Center',
    },
    {
        'href': '/admin/users',
        'title': 'User Management',
        'description': 'Oversee marketplace accounts, suspend/reactivate users, and inspect profiles.',
        'roles': {'ADMIN'},
        'keywords': [
            'admin users',
            'manage users',
            'user management',
            'accounts',
            'suspend users',
            'open user management',
            'where can i manage users',
            'manage accounts',
            'take me to admin users',
        ],
        'default_label': 'Manage Users',
    },
    {
        'href': '/admin/products',
        'title': 'Product Moderation',
        'description': 'Inspect and moderate all products submitted across the platform.',
        'roles': {'ADMIN'},
        'keywords': ['admin products', 'moderate products', 'product moderation', 'where can i manage products', 'all products'],
        'default_label': 'Manage Products',
    },
    {
        'href': '/admin/auctions',
        'title': 'Auction Moderation',
        'description': 'Monitor active, upcoming, closed, and cancelled auctions across all sellers.',
        'roles': {'ADMIN'},
        'keywords': ['admin auctions', 'moderate auctions', 'open auction moderation', 'auction oversight', 'all auctions admin'],
        'default_label': 'Moderate Auctions',
    },
    {
        'href': '/admin/bids',
        'title': 'Bid Oversight',
        'description': 'Audit live and historic bids placed across the marketplace.',
        'roles': {'ADMIN'},
        'keywords': ['admin bids', 'bid oversight', 'bid logs', 'audit bids', 'all bids'],
        'default_label': 'Review Bids',
    },
    {
        'href': '/admin/analytics',
        'title': 'Platform Analytics',
        'description': 'Platform revenue, commission fees, active auctions, and volume analytics.',
        'roles': {'ADMIN'},
        'keywords': [
            'admin analytics',
            'analytics',
            'platform analytics',
            'show analytics',
            'take me to admin analytics',
            'go to admin analytics',
            'platform metrics',
            'revenue stats',
        ],
        'default_label': 'Open Analytics',
    },
    {
        'href': '/admin/profile',
        'title': 'Admin Profile',
        'description': 'Staff profile settings and credentials.',
        'roles': {'ADMIN'},
        'keywords': ['admin profile'],
        'default_label': 'View Profile',
    },
    {
        'href': '/admin/settings',
        'title': 'Admin Settings',
        'description': 'System configuration, platform commission rate, and operational thresholds.',
        'roles': {'ADMIN'},
        'keywords': ['admin settings', 'platform settings', 'fee settings'],
        'default_label': 'Open Admin Settings',
    },
]

APPROVED_HREFS = {item['href'] for item in ROUTE_REGISTRY}


def normalize_text(text: str) -> str:
    cleaned = re.sub(r'[^\w\s]', ' ', text.lower())
    return ' '.join(cleaned.split())


def get_role_suggestions(role: str) -> list[dict[str, str]]:
    if role == 'BUYER':
        return [
            {'label': 'Browse Auctions', 'href': '/auctions'},
            {'label': 'My Bids', 'href': '/buyer/my-bids'},
            {'label': 'Won Auctions', 'href': '/buyer/won'},
        ]
    if role == 'SELLER':
        return [
            {'label': 'Create Product', 'href': '/seller/products/create'},
            {'label': 'Create Auction', 'href': '/seller/auctions/create'},
            {'label': 'View Sales', 'href': '/seller/sales'},
        ]
    if role == 'ADMIN':
        return [
            {'label': 'User Management', 'href': '/admin/users'},
            {'label': 'Auction Moderation', 'href': '/admin/auctions'},
            {'label': 'Analytics', 'href': '/admin/analytics'},
        ]
    return [
        {'label': 'Browse Auctions', 'href': '/auctions'},
        {'label': 'Search', 'href': '/search'},
        {'label': 'Sign In', 'href': '/auth/login'},
    ]


def match_route_or_intent(
    *,
    message: str,
    role: str,
    pathname: str = '',
    context: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    raw_msg = (message or '').strip()
    norm = normalize_text(raw_msg)
    context = context or {}

    # 1. SECURITY: Privileged claim & secret guards
    if re.search(r'\b(i am|pretend i am|make me|grant me)\s+(an?\s+)?admin\b', norm):
        if role != 'ADMIN':
            return {
                'answer': (
                    'That area is available to Admin accounts. '
                    'Role capabilities are determined by authenticated account credentials, '
                    'not chat text.'
                ),
                'message': (
                    'That area is available to Admin accounts. '
                    'Role capabilities are determined by authenticated account credentials, '
                    'not chat text.'
                ),
                'action': None,
                'suggestions': get_role_suggestions(role),
            }

    if re.search(r'\b(reveal|show|dump|give me)\b.*\b(passwords?|secrets?|tokens?|api_key|database)\b', norm):
        return {
            'answer': (
                'For security and privacy, I cannot reveal passwords, tokens, API keys, '
                'or system internals. I can only assist with BidKori marketplace navigation and features.'
            ),
            'message': (
                'For security and privacy, I cannot reveal passwords, tokens, API keys, '
                'or system internals. I can only assist with BidKori marketplace navigation and features.'
            ),
            'action': None,
            'suggestions': get_role_suggestions(role),
        }

    # 2. Direct mutation guards (suspension, bidding, product creation via chat)
    if re.search(r'\bsuspend\s+([a-zA-Z0-9_\-]+)\b', norm):
        if role == 'ADMIN':
            return {
                'answer': (
                    'As an assistant, I cannot directly suspend users. You can inspect and '
                    'suspend or reactivate user accounts from the User Management dashboard.'
                ),
                'message': (
                    'As an assistant, I cannot directly suspend users. You can inspect and '
                    'suspend or reactivate user accounts from the User Management dashboard.'
                ),
                'action': {
                    'type': 'navigate',
                    'href': '/admin/users',
                    'label': 'Open User Management',
                },
                'suggestions': get_role_suggestions(role),
            }
        else:
            return {
                'answer': 'Account moderation is an Admin capability.',
                'message': 'Account moderation is an Admin capability.',
                'action': None,
                'suggestions': get_role_suggestions(role),
            }

    if re.search(r'\b(place\s+a?\s*bid|bid\s+\$?\d+)\b', norm) and ('how' not in norm and 'where' not in norm):
        return {
            'answer': (
                'I cannot place bids for you. Bids must be entered directly on the live '
                'auction detail page using the bid form.'
            ),
            'message': (
                'I cannot place bids for you. Bids must be entered directly on the live '
                'auction detail page using the bid form.'
            ),
            'action': {
                'type': 'navigate',
                'href': '/auctions',
                'label': 'Browse Auctions',
            },
            'suggestions': get_role_suggestions(role),
        }

    # 3. Contextual Help on Current Page
    auction_state = str(context.get('auction_state', '')).upper()
    if pathname.startswith('/auctions/') and len(pathname.split('/')) >= 3:
        if any(phrase in norm for phrase in ['why cant i bid', "why can't i bid", 'cant bid', 'cannot bid', 'bidding disabled']):
            if auction_state == 'UPCOMING':
                return {
                    'answer': (
                        'Bidding has not started yet. This auction is in the UPCOMING state '
                        'and will open for bids when its scheduled start time arrives.'
                    ),
                    'message': (
                        'Bidding has not started yet. This auction is in the UPCOMING state '
                        'and will open for bids when its scheduled start time arrives.'
                    ),
                    'action': None,
                    'suggestions': get_role_suggestions(role),
                }
            if auction_state in ('CLOSED', 'FINALIZING'):
                return {
                    'answer': (
                        'This auction has ended, so new bids are disabled. If a reserve was met '
                        'and bids were placed, the highest bidder is the winner.'
                    ),
                    'message': (
                        'This auction has ended, so new bids are disabled. If a reserve was met '
                        'and bids were placed, the highest bidder is the winner.'
                    ),
                    'action': None,
                    'suggestions': get_role_suggestions(role),
                }
            if auction_state == 'CANCELLED':
                return {
                    'answer': 'This auction was cancelled and is no longer available for bidding.',
                    'message': 'This auction was cancelled and is no longer available for bidding.',
                    'action': None,
                    'suggestions': get_role_suggestions(role),
                }

        if any(phrase in norm for phrase in ['what can i do here', 'what is this page', 'explain this page']):
            if auction_state == 'LIVE':
                return {
                    'answer': (
                        'This is a LIVE auction. You can view the product description, check the '
                        'current highest bid and countdown timer, and submit a higher bid using the bid form.'
                    ),
                    'message': (
                        'This is a LIVE auction. You can view the product description, check the '
                        'current highest bid and countdown timer, and submit a higher bid using the bid form.'
                    ),
                    'action': None,
                    'suggestions': get_role_suggestions(role),
                }
            if auction_state == 'UPCOMING':
                return {
                    'answer': (
                        'This is an UPCOMING auction. You can review the product details and start time. '
                        'Bidding will open automatically when the start time is reached.'
                    ),
                    'message': (
                        'This is an UPCOMING auction. You can review the product details and start time. '
                        'Bidding will open automatically when the start time is reached.'
                    ),
                    'action': None,
                    'suggestions': get_role_suggestions(role),
                }

    # 4. Deferred / Unsupported Features
    if 'watchlist' in norm or 'saved items' in norm:
        return {
            'answer': (
                'Watchlist is not currently available in this version of BidKori. '
                'You can track auctions you have participated in from My Bids.'
            ),
            'message': (
                'Watchlist is not currently available in this version of BidKori. '
                'You can track auctions you have participated in from My Bids.'
            ),
            'action': (
                {'type': 'navigate', 'href': '/buyer/my-bids', 'label': 'Open My Bids'}
                if role == 'BUYER' else None
            ),
            'suggestions': get_role_suggestions(role),
        }

    if any(k in norm for k in ['refund', 'dispute', 'chargeback', 'buyer protection']):
        return {
            'answer': (
                'Dispute resolution and formal refund processing are not built into this version of BidKori. '
                'BidKori currently operates with a demonstration checkout ledger.'
            ),
            'message': (
                'Dispute resolution and formal refund processing are not built into this version of BidKori. '
                'BidKori currently operates with a demonstration checkout ledger.'
            ),
            'action': None,
            'suggestions': get_role_suggestions(role),
        }

    if any(k in norm for k in ['rating', 'reviews', 'seller rating', 'leave a review']):
        return {
            'answer': (
                'Seller ratings and buyer reviews are not currently supported in this version of BidKori.'
            ),
            'message': (
                'Seller ratings and buyer reviews are not currently supported in this version of BidKori.'
            ),
            'action': None,
            'suggestions': get_role_suggestions(role),
        }

    if any(k in norm for k in ['payout', 'bank transfer', 'withdraw earnings']):
        return {
            'answer': (
                'External payout and bank transfers are not supported in this version of BidKori. '
                'Sellers can inspect net earnings from the Seller Sales ledger.'
            ),
            'message': (
                'External payout and bank transfers are not supported in this version of BidKori. '
                'Sellers can inspect net earnings from the Seller Sales ledger.'
            ),
            'action': (
                {'type': 'navigate', 'href': '/seller/sales', 'label': 'View Seller Sales'}
                if role == 'SELLER' else None
            ),
            'suggestions': get_role_suggestions(role),
        }

    # 5. Deterministic Route Matching for Navigation Intents
    nav_prefixes = (
        'take me to',
        'open ',
        'go to',
        'navigate to',
        'show my ',
        'show me ',
        'show ',
        'view my ',
        'view ',
        'where are the auctions i won',
        'where are my won auctions',
        'where can i see sales',
        'where can i manage users',
        'where can i manage products',
    )
    exact_targets = {
        'my bids',
        'won auctions',
        'seller sales',
        'seller products',
        'seller auctions',
        'admin analytics',
        'admin users',
        'user management',
        'auction moderation',
        'browse auctions',
        'all auctions',
        'auctions',
        'login',
        'register',
    }

    is_nav = any(norm.startswith(p) or f' {p} ' in f' {norm} ' for p in nav_prefixes) or (norm in exact_targets)
    if not is_nav:
        return None

    matched_entry: dict[str, Any] | None = None
    best_len = 0

    for entry in ROUTE_REGISTRY:
        for kw in entry['keywords']:
            kw_norm = normalize_text(kw)
            if norm == kw_norm or f' {kw_norm} ' in f' {norm} ' or norm.startswith(f'{kw_norm} ') or norm.endswith(f' {kw_norm}'):
                if len(kw_norm) > best_len:
                    best_len = len(kw_norm)
                    matched_entry = entry

    if matched_entry:
        target_href = matched_entry['href']
        allowed_roles = matched_entry['roles']
        target_title = matched_entry['title']

        if role in allowed_roles:
            action_label = matched_entry['default_label']
            msg = (
                f'You can open {target_title} at {target_href}. '
                f'{matched_entry["description"]}'
            )
            return {
                'answer': msg,
                'message': msg,
                'action': {
                    'type': 'navigate',
                    'href': target_href,
                    'label': action_label,
                },
                'suggestions': get_role_suggestions(role),
            }

        # Role Mismatch Handling
        if role == 'ANONYMOUS':
            msg = (
                f'{target_title} requires you to be logged in. '
                'Please sign in to your account.'
            )
            return {
                'answer': msg,
                'message': msg,
                'action': {
                    'type': 'navigate',
                    'href': '/auth/login',
                    'label': 'Sign In to Continue',
                },
                'suggestions': get_role_suggestions(role),
            }

        if 'SELLER' in allowed_roles and role != 'SELLER':
            msg = (
                f'{target_title} is part of the Seller workspace. '
                f'Your current account has the {role} role.'
            )
            return {
                'answer': msg,
                'message': msg,
                'action': None,
                'suggestions': get_role_suggestions(role),
            }

        if 'ADMIN' in allowed_roles and role != 'ADMIN':
            msg = (
                f'{target_title} is available only to platform Admin accounts. '
                f'Your current account has the {role} role.'
            )
            return {
                'answer': msg,
                'message': msg,
                'action': None,
                'suggestions': get_role_suggestions(role),
            }

        if 'BUYER' in allowed_roles and role != 'BUYER':
            msg = (
                f'{target_title} is part of the Buyer workspace. '
                f'Your current account has the {role} role.'
            )
            return {
                'answer': msg,
                'message': msg,
                'action': None,
                'suggestions': get_role_suggestions(role),
            }

    return None
