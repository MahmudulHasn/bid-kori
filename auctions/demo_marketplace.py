"""Deterministic SHOW-D01 demo marketplace population helpers.

Creates clearly marked demo users/products/auctions for software-lab showcase.
Does not alter auction domain rules; prefers BidService / lifecycle / checkout.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files import File
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.authtoken.models import Token

from auctions.models import Auction, AuctionImage, Bid, Payment
from auctions.services import (
    AuctionLifecycleService,
    BidService,
    CheckoutService,
)
from notifications.models import Notification
from products.category_bootstrap import ensure_mvp_categories
from products.models import Category, Product, ProductImage
from users.models import UserProfile, ensure_user_profile

DEMO_PASSWORD = 'DemoShowcase123!'
DEMO_TITLE_PREFIX = '[DEMO] '
DEMO_BUYER_PREFIX = 'demo_buyer_'
DEMO_SELLER_PREFIX = 'demo_seller_'
DEMO_ADMIN_USERNAME = 'demo_admin'

# Local SHOW-S02 category assets under demo_assets/products/ (not user uploads).
CATEGORY_DEMO_IMAGE_FILES: dict[str, str] = {
    'Smartphones': 'smartphones.jpg',
    'Laptops': 'laptops.jpg',
    'Gaming Consoles': 'gaming-consoles.jpg',
    'PC Components': 'pc-components.jpg',
    'Cameras': 'cameras.jpg',
    'Sneakers': 'sneakers.jpg',
    'Watches': 'watches.jpg',
    'Collectibles': 'collectibles.jpg',
}


SHOWCASE_CATEGORY_NAMES: tuple[str, ...] = (
    'Smartphones',
    'Laptops',
    'Gaming Consoles',
    'PC Components',
    'Cameras',
    'Sneakers',
    'Watches',
    'Collectibles',
)

SELLERS: tuple[dict, ...] = (
    {
        'username': 'demo_seller_electronics',
        'email': 'demo_seller_electronics@bidkori.local',
        'role': UserProfile.Role.SELLER,
    },
    {
        'username': 'demo_seller_gaming',
        'email': 'demo_seller_gaming@bidkori.local',
        'role': UserProfile.Role.SELLER,
    },
    {
        'username': 'demo_seller_collectibles',
        'email': 'demo_seller_collectibles@bidkori.local',
        'role': UserProfile.Role.SELLER,
    },
)

BUYERS: tuple[dict, ...] = (
    {
        'username': 'demo_buyer_a',
        'email': 'demo_buyer_a@bidkori.local',
        'role': UserProfile.Role.BUYER,
    },
    {
        'username': 'demo_buyer_b',
        'email': 'demo_buyer_b@bidkori.local',
        'role': UserProfile.Role.BUYER,
    },
    {
        'username': 'demo_buyer_c',
        'email': 'demo_buyer_c@bidkori.local',
        'role': UserProfile.Role.BUYER,
    },
    {
        'username': 'demo_buyer_d',
        'email': 'demo_buyer_d@bidkori.local',
        'role': UserProfile.Role.BUYER,
    },
)


@dataclass
class SeedSummary:
    users_created: int = 0
    users_existing: int = 0
    categories_ensured: int = 0
    products: int = 0
    product_images: int = 0
    auction_images: int = 0
    live_auctions: int = 0
    upcoming_auctions: int = 0
    closed_auctions: int = 0
    closed_no_winner: int = 0
    cancelled_auctions: int = 0
    bids: int = 0
    payments: int = 0
    notifications: int = 0
    reset_deleted_users: int = 0
    notes: list[str] = field(default_factory=list)


def _demo_assets_dir() -> Path:
    return Path(settings.BASE_DIR) / 'demo_assets' / 'products'


def _category_demo_asset_path(category: Category | None) -> Path | None:
    if category is None:
        return None
    filename = CATEGORY_DEMO_IMAGE_FILES.get(category.name)
    if not filename:
        return None
    path = _demo_assets_dir() / filename
    return path if path.is_file() else None


def _ensure_product_demo_image(product: Product) -> bool:
    """Attach one ProductImage from the category demo pack if missing.

    Returns True when a new ProductImage row was created.
    """
    if product.images.exists():
        return False
    asset = _category_demo_asset_path(product.category)
    if asset is None:
        return False
    with asset.open('rb') as handle:
        ProductImage.objects.create(
            product=product,
            image=File(handle, name=asset.name),
        )
    return True


def _ensure_auction_demo_image(auction: Auction, product: Product) -> bool:
    """Attach one AuctionImage so marketplace cards/detail show media.

    Marketplace UI reads ``auction.images`` (AuctionImage), while Seller catalog
    uses ProductImage. Reuse the same category asset file for both.
    """
    if auction.images.exists():
        return False
    asset = _category_demo_asset_path(product.category)
    if asset is None and product.images.exists():
        # Fall back to copying the already-attached product image bytes.
        product_image = product.images.order_by('uploaded_at', 'id').first()
        if product_image is None or not product_image.image:
            return False
        with product_image.image.open('rb') as handle:
            AuctionImage.objects.create(
                auction=auction,
                image=File(handle, name=Path(product_image.image.name).name),
            )
        return True
    if asset is None:
        return False
    with asset.open('rb') as handle:
        AuctionImage.objects.create(
            auction=auction,
            image=File(handle, name=asset.name),
        )
    return True


def demo_product_title(name: str) -> str:
    return f'{DEMO_TITLE_PREFIX}{name}'


def is_demo_username(username: str) -> bool:
    return (
        username.startswith(DEMO_SELLER_PREFIX)
        or username.startswith(DEMO_BUYER_PREFIX)
        or username == DEMO_ADMIN_USERNAME
    )


def demo_user_queryset():
    User = get_user_model()
    return User.objects.filter(
        Q(username__startswith=DEMO_SELLER_PREFIX)
        | Q(username__startswith=DEMO_BUYER_PREFIX)
        | Q(username=DEMO_ADMIN_USERNAME)
    )


def demo_product_queryset():
    return Product.objects.filter(
        Q(title__startswith=DEMO_TITLE_PREFIX)
        | Q(seller__in=demo_user_queryset())
    )


@transaction.atomic
def clear_demo_marketplace() -> int:
    """Delete only SHOW-D01 demo records. Returns deleted user count."""
    users = demo_user_queryset()
    user_count = users.count()
    products = demo_product_queryset()
    auction_ids = list(
        Auction.objects.filter(product__in=products).values_list('id', flat=True)
    )

    Payment.objects.filter(auction_id__in=auction_ids).delete()
    # Null out auction FKs first (SET_NULL) so late on_commit rows cannot block deletes.
    Notification.objects.filter(auction_id__in=auction_ids).update(auction=None)
    Notification.objects.filter(user__in=users).delete()
    Bid.objects.filter(auction_id__in=auction_ids).delete()
    AuctionImage.objects.filter(auction_id__in=auction_ids).delete()
    Auction.objects.filter(id__in=auction_ids).delete()
    ProductImage.objects.filter(product__in=products).delete()
    products.delete()
    Token.objects.filter(user__in=users).delete()
    users.delete()
    return user_count


def ensure_showcase_categories() -> dict[str, Category]:
    ensure_mvp_categories()
    by_name: dict[str, Category] = {}
    for name in SHOWCASE_CATEGORY_NAMES:
        category, _ = Category.objects.get_or_create(
            name=name,
            defaults={'slug': slugify(name)},
        )
        by_name[name] = category
    # Also index MVP names for fallback.
    for category in Category.objects.all():
        by_name.setdefault(category.name, category)
    return by_name


def _ensure_user(*, username: str, email: str, role: str, is_staff: bool = False):
    User = get_user_model()
    user = User.objects.filter(username=username).first()
    created = False
    if user is None:
        user = User.objects.create_user(
            username=username,
            email=email,
            password=DEMO_PASSWORD,
        )
        created = True
    else:
        user.email = email
        user.set_password(DEMO_PASSWORD)
        user.save(update_fields=['email', 'password'])

    if is_staff:
        if not user.is_staff:
            user.is_staff = True
            user.save(update_fields=['is_staff'])
    else:
        profile = ensure_user_profile(user, role=role)
        if profile.role != role:
            profile.role = role
            profile.save(update_fields=['role', 'updated_at'])
    return user, created


def _get_or_create_product(
    *,
    seller,
    short_title: str,
    description: str,
    condition: str,
    category: Category | None,
) -> tuple[Product, bool]:
    title = demo_product_title(short_title)
    product, created = Product.objects.get_or_create(
        seller=seller,
        title=title,
        defaults={
            'description': description,
            'condition': condition,
            'category': category,
            'is_hidden': False,
        },
    )
    if not created:
        product.description = description
        product.condition = condition
        product.category = category
        product.is_hidden = False
        product.save(
            update_fields=[
                'description',
                'condition',
                'category',
                'is_hidden',
                'updated_at',
            ]
        )
    return product, created


def _create_auction_for_product(
    *,
    product: Product,
    starting_bid: Decimal,
    min_increment: Decimal,
    start_time,
    end_time,
    reserve_price: Decimal | None = None,
) -> Auction:
    existing = Auction.objects.filter(product=product).first()
    if existing is not None:
        # Replace demo auction only — delete dependents then recreate cleanly.
        Payment.objects.filter(auction=existing).delete()
        Notification.objects.filter(auction=existing).update(auction=None)
        Notification.objects.filter(auction=existing).delete()
        Bid.objects.filter(auction=existing).delete()
        AuctionImage.objects.filter(auction=existing).delete()
        existing.delete()

    return Auction.objects.create(
        product=product,
        starting_bid=starting_bid,
        current_highest_bid=starting_bid,
        min_increment=min_increment,
        reserve_price=reserve_price,
        start_time=start_time,
        end_time=end_time,
        status=Auction.Status.ACTIVE,
        is_hidden=False,
    )


def _place_bids(auction: Auction, ladder: list[tuple[object, Decimal]]) -> int:
    count = 0
    for bidder, amount in ladder:
        BidService.place_bid(auction.pk, bidder, amount)
        count += 1
    auction.refresh_from_db()
    return count


def seed_demo_marketplace(
    *,
    reset: bool = False,
    live_duration_minutes: int = 45,
) -> SeedSummary:
    summary = SeedSummary()
    if reset:
        summary.reset_deleted_users = clear_demo_marketplace()
        summary.notes.append(
            f'Reset removed {summary.reset_deleted_users} demo user(s).'
        )

    categories = ensure_showcase_categories()
    summary.categories_ensured = len(SHOWCASE_CATEGORY_NAMES)

    users: dict[str, object] = {}
    for spec in (*SELLERS, *BUYERS):
        user, created = _ensure_user(
            username=spec['username'],
            email=spec['email'],
            role=spec['role'],
        )
        users[spec['username']] = user
        if created:
            summary.users_created += 1
        else:
            summary.users_existing += 1

    admin, admin_created = _ensure_user(
        username=DEMO_ADMIN_USERNAME,
        email='demo_admin@bidkori.local',
        role=UserProfile.Role.BUYER,
        is_staff=True,
    )
    users[DEMO_ADMIN_USERNAME] = admin
    if admin_created:
        summary.users_created += 1
    else:
        summary.users_existing += 1

    seller_e = users['demo_seller_electronics']
    seller_g = users['demo_seller_gaming']
    seller_c = users['demo_seller_collectibles']
    buyer_a = users['demo_buyer_a']
    buyer_b = users['demo_buyer_b']
    buyer_c = users['demo_buyer_c']
    buyer_d = users['demo_buyer_d']

    now = timezone.now()
    live_end = now + timedelta(minutes=max(20, int(live_duration_minutes)))

    # Catalog definition: (seller, short_title, category, condition, start, incr,
    #   kind, reserve|None, bid_plan, checkout)
    # kind: live|upcoming|closed_win|closed_reserve|cancelled|product_only
    catalog: list[dict] = [
        # --- LIVE (8) ---
        {
            'seller': seller_e,
            'title': 'iPhone 13 128GB',
            'category': 'Smartphones',
            'condition': Product.Condition.USED_LIKE_NEW,
            'desc': 'Unlocked dual-SIM handset with healthy battery and original box.',
            'start': Decimal('45000.00'),
            'incr': Decimal('500.00'),
            'kind': 'live',
            'end_offset_min': 0,
            'bids': [('demo_buyer_b', 1), ('demo_buyer_a', 2)],  # A highest
        },
        {
            'seller': seller_e,
            'title': 'Samsung Galaxy S22',
            'category': 'Smartphones',
            'condition': Product.Condition.USED_GOOD,
            'desc': 'Clean Cosmic Black unit with charger; light screen wear only.',
            'start': Decimal('38000.00'),
            'incr': Decimal('500.00'),
            'kind': 'live',
            'end_offset_min': 8,
            'bids': [
                ('demo_buyer_a', 1),
                ('demo_buyer_b', 2),
                ('demo_buyer_c', 3),
            ],  # A outbid
        },
        {
            'seller': seller_e,
            'title': 'Google Pixel 7',
            'category': 'Smartphones',
            'condition': Product.Condition.USED_LIKE_NEW,
            'desc': 'Factory reset Pixel with solid camera performance for daily use.',
            'start': Decimal('32000.00'),
            'incr': Decimal('400.00'),
            'kind': 'live',
            'end_offset_min': 15,
            'bids': [('demo_buyer_d', 1), ('demo_buyer_a', 2)],
        },
        {
            'seller': seller_e,
            'title': 'MacBook Air M1',
            'category': 'Laptops',
            'condition': Product.Condition.USED_LIKE_NEW,
            'desc': '8GB/256GB Air in Space Gray; battery cycle count remains low.',
            'start': Decimal('70000.00'),
            'incr': Decimal('1000.00'),
            'kind': 'live',
            'end_offset_min': 22,
            'bids': [
                ('demo_buyer_b', 1),
                ('demo_buyer_c', 2),
                ('demo_buyer_a', 3),
            ],
        },
        {
            'seller': seller_g,
            'title': 'PlayStation 5 Slim',
            'category': 'Gaming Consoles',
            'condition': Product.Condition.USED_GOOD,
            'desc': 'Disc edition console with one DualSense controller included.',
            'start': Decimal('48000.00'),
            'incr': Decimal('500.00'),
            'kind': 'live',
            'end_offset_min': 30,
            'bids': [('demo_buyer_c', 1), ('demo_buyer_b', 2)],
        },
        {
            'seller': seller_g,
            'title': 'Xbox Series X',
            'category': 'Gaming Consoles',
            'condition': Product.Condition.USED_LIKE_NEW,
            'desc': '1TB Series X with HDMI cable; tested on 4K display.',
            'start': Decimal('52000.00'),
            'incr': Decimal('500.00'),
            'kind': 'live',
            'end_offset_min': 35,
            'bids': [('demo_buyer_a', 1), ('demo_buyer_d', 2)],
        },
        {
            'seller': seller_g,
            'title': 'RTX 4060 Ti',
            'category': 'PC Components',
            'condition': Product.Condition.USED_GOOD,
            'desc': '8GB dual-fan card, re-pasted and stress-tested before listing.',
            'start': Decimal('42000.00'),
            'incr': Decimal('500.00'),
            'kind': 'live',
            'end_offset_min': 40,
            'bids': [
                ('demo_buyer_b', 1),
                ('demo_buyer_a', 2),
                ('demo_buyer_c', 3),
            ],
        },
        {
            'seller': seller_e,
            'title': 'Canon EOS M50 Mark II',
            'category': 'Cameras',
            'condition': Product.Condition.USED_GOOD,
            'desc': 'Mirrorless kit with 15-45mm lens; shutter count under 8k.',
            'start': Decimal('55000.00'),
            'incr': Decimal('750.00'),
            'kind': 'live',
            'end_offset_min': 12,
            'bids': [('demo_buyer_d', 1), ('demo_buyer_b', 2)],
        },
        # --- UPCOMING (5) ---
        {
            'seller': seller_e,
            'title': 'ASUS ROG Zephyrus G14',
            'category': 'Laptops',
            'condition': Product.Condition.USED_LIKE_NEW,
            'desc': 'Compact gaming laptop with Ryzen CPU; demo listing for upcoming slot.',
            'start': Decimal('95000.00'),
            'incr': Decimal('1000.00'),
            'kind': 'upcoming',
            'start_in_min': 30,
            'duration_hours': 24,
        },
        {
            'seller': seller_e,
            'title': 'Lenovo ThinkPad T14',
            'category': 'Laptops',
            'condition': Product.Condition.USED_GOOD,
            'desc': 'Business ultrabook with docking port; keyboard backlight works.',
            'start': Decimal('48000.00'),
            'incr': Decimal('500.00'),
            'kind': 'upcoming',
            'start_in_min': 60,
            'duration_hours': 24,
        },
        {
            'seller': seller_g,
            'title': 'Nintendo Switch OLED',
            'category': 'Gaming Consoles',
            'condition': Product.Condition.NEW,
            'desc': 'White OLED model, sealed accessories, ready for local multiplayer.',
            'start': Decimal('36000.00'),
            'incr': Decimal('400.00'),
            'kind': 'upcoming',
            'start_in_min': 180,
            'duration_hours': 36,
        },
        {
            'seller': seller_c,
            'title': 'Air Jordan 1 Retro',
            'category': 'Sneakers',
            'condition': Product.Condition.USED_LIKE_NEW,
            'desc': 'Size 42 pair with original box; lightly tried on indoors only.',
            'start': Decimal('18000.00'),
            'incr': Decimal('250.00'),
            'kind': 'upcoming',
            'start_in_min': 720,
            'duration_hours': 48,
        },
        {
            'seller': seller_c,
            'title': 'Nike Dunk Low',
            'category': 'Sneakers',
            'condition': Product.Condition.USED_GOOD,
            'desc': 'Panda colorway, size 43, honest sole wear documented in photos.',
            'start': Decimal('12000.00'),
            'incr': Decimal('200.00'),
            'kind': 'upcoming',
            'start_in_min': 1440,
            'duration_hours': 48,
        },
        # --- CLOSED with winners (5) ---
        {
            'seller': seller_e,
            'title': 'Sony A6400',
            'category': 'Cameras',
            'condition': Product.Condition.USED_LIKE_NEW,
            'desc': 'APS-C body with kit lens; ideal for vlogging and stills.',
            'start': Decimal('60000.00'),
            'incr': Decimal('500.00'),
            'kind': 'closed_win',
            'bids': [
                ('demo_buyer_b', 1),
                ('demo_buyer_c', 2),
                ('demo_buyer_a', 3),
            ],  # A wins + checkout
            'checkout': True,
        },
        {
            'seller': seller_g,
            'title': 'RTX 3070 Graphics Card',
            'category': 'PC Components',
            'condition': Product.Condition.USED_GOOD,
            'desc': 'Previous-gen 8GB card, cleaned fans, stable under load tests.',
            'start': Decimal('35000.00'),
            'incr': Decimal('500.00'),
            'kind': 'closed_win',
            'bids': [
                ('demo_buyer_d', 1),
                ('demo_buyer_b', 2),
                ('demo_buyer_a', 3),
            ],  # A wins, unpaid
            'checkout': False,
        },
        {
            'seller': seller_e,
            'title': 'Casio G-Shock',
            'category': 'Watches',
            'condition': Product.Condition.USED_GOOD,
            'desc': 'Rugged quartz watch with fresh battery and intact resin strap.',
            'start': Decimal('4500.00'),
            'incr': Decimal('100.00'),
            'kind': 'closed_win',
            'bids': [
                ('demo_buyer_a', 1),
                ('demo_buyer_b', 2),
                ('demo_buyer_c', 3),
            ],  # A lost; electronics seller gets paid sale
            'checkout': True,
        },
        {
            'seller': seller_c,
            'title': 'Seiko 5 Automatic',
            'category': 'Watches',
            'condition': Product.Condition.USED_LIKE_NEW,
            'desc': 'Automatic diver-style Seiko keeping good time after service.',
            'start': Decimal('14000.00'),
            'incr': Decimal('200.00'),
            'kind': 'closed_win',
            'bids': [
                ('demo_buyer_a', 1),
                ('demo_buyer_d', 2),
                ('demo_buyer_c', 3),
            ],  # C wins
            'checkout': True,
        },
        {
            'seller': seller_g,
            'title': 'Mechanical Keyboard Compact',
            'category': 'PC Components',
            'condition': Product.Condition.USED_LIKE_NEW,
            'desc': '75% hot-swap board with tactile switches and PBT keycaps.',
            'start': Decimal('6500.00'),
            'incr': Decimal('150.00'),
            'kind': 'closed_win',
            'bids': [
                ('demo_buyer_b', 1),
                ('demo_buyer_a', 2),
                ('demo_buyer_d', 3),
            ],  # D wins
            'checkout': True,
        },
        # --- CLOSED reserve unmet (3) ---
        {
            'seller': seller_e,
            'title': 'Vintage Camera Lens',
            'category': 'Cameras',
            'condition': Product.Condition.FAIR,
            'desc': 'Manual-focus 50mm prime with cosmetic marks; glass is clear.',
            'start': Decimal('8000.00'),
            'incr': Decimal('200.00'),
            'kind': 'closed_reserve',
            'reserve': Decimal('20000.00'),
            'bids': [('demo_buyer_a', 1), ('demo_buyer_b', 2)],
        },
        {
            'seller': seller_c,
            'title': 'Vintage Mechanical Watch',
            'category': 'Watches',
            'condition': Product.Condition.FAIR,
            'desc': 'Estate hand-wind watch; runs but would benefit from service.',
            'start': Decimal('9000.00'),
            'incr': Decimal('250.00'),
            'kind': 'closed_reserve',
            'reserve': Decimal('25000.00'),
            'bids': [('demo_buyer_c', 1), ('demo_buyer_d', 2)],
        },
        {
            'seller': seller_g,
            'title': 'Limited Edition Controller',
            'category': 'Gaming Consoles',
            'condition': Product.Condition.USED_GOOD,
            'desc': 'Third-party premium pad with hall-effect sticks; no stick drift.',
            'start': Decimal('5000.00'),
            'incr': Decimal('100.00'),
            'kind': 'closed_reserve',
            'reserve': Decimal('15000.00'),
            'bids': [('demo_buyer_a', 1), ('demo_buyer_c', 2)],
        },
        # --- CANCELLED (2) ---
        {
            'seller': seller_e,
            'title': 'Tablet Stand Bundle',
            'category': 'Laptops',
            'condition': Product.Condition.NEW,
            'desc': 'Aluminum stand with cable clips; listing cancelled for demo.',
            'start': Decimal('2500.00'),
            'incr': Decimal('50.00'),
            'kind': 'cancelled',
            'bids': [('demo_buyer_a', 1), ('demo_buyer_b', 2)],
        },
        {
            'seller': seller_c,
            'title': 'Pokemon Card Collection',
            'category': 'Collectibles',
            'condition': Product.Condition.USED_GOOD,
            'desc': 'Binder of common/uncommon cards; cancelled before close for demo.',
            'start': Decimal('3500.00'),
            'incr': Decimal('100.00'),
            'kind': 'cancelled',
            'bids': [('demo_buyer_d', 1)],
        },
        # --- Extra catalog products (no auction) for seller density ---
        {
            'seller': seller_e,
            'title': 'USB-C Hub Multiport',
            'category': 'PC Components',
            'condition': Product.Condition.NEW,
            'desc': 'Seven-port hub for laptops; catalog-only demo product.',
            'kind': 'product_only',
        },
        {
            'seller': seller_e,
            'title': 'Wireless Earbuds Case Set',
            'category': 'Smartphones',
            'condition': Product.Condition.USED_LIKE_NEW,
            'desc': 'Spare charging case compatible with common earbuds.',
            'kind': 'product_only',
        },
        {
            'seller': seller_g,
            'title': 'Gaming Mousepad XL',
            'category': 'PC Components',
            'condition': Product.Condition.NEW,
            'desc': 'Stitched-edge cloth pad; catalog-only for seller inventory.',
            'kind': 'product_only',
        },
    ]

    for item in catalog:
        category = categories.get(item['category'])
        with transaction.atomic():
            product, _ = _get_or_create_product(
                seller=item['seller'],
                short_title=item['title'],
                description=item['desc'],
                condition=item['condition'],
                category=category,
            )
            summary.products += 1
            if _ensure_product_demo_image(product):
                summary.product_images += 1

            kind = item['kind']
            if kind == 'product_only':
                continue

            starting = item['start']
            incr = item['incr']

            if kind == 'live':
                end = live_end + timedelta(minutes=int(item.get('end_offset_min', 0)))
                auction = _create_auction_for_product(
                    product=product,
                    starting_bid=starting,
                    min_increment=incr,
                    start_time=now - timedelta(hours=2),
                    end_time=end,
                )
                if _ensure_auction_demo_image(auction, product):
                    summary.auction_images += 1
                ladder_spec = item.get('bids') or []
                ladder = [
                    (users[uname], starting + (incr * step))
                    for uname, step in ladder_spec
                ]
                summary.bids += _place_bids(auction, ladder)
                summary.live_auctions += 1

            elif kind == 'upcoming':
                start_at = now + timedelta(minutes=int(item['start_in_min']))
                end_at = start_at + timedelta(hours=int(item['duration_hours']))
                auction = _create_auction_for_product(
                    product=product,
                    starting_bid=starting,
                    min_increment=incr,
                    start_time=start_at,
                    end_time=end_at,
                )
                if _ensure_auction_demo_image(auction, product):
                    summary.auction_images += 1
                summary.upcoming_auctions += 1

            elif kind == 'closed_win':
                auction = _create_auction_for_product(
                    product=product,
                    starting_bid=starting,
                    min_increment=incr,
                    start_time=now - timedelta(days=2),
                    end_time=now + timedelta(hours=6),
                )
                if _ensure_auction_demo_image(auction, product):
                    summary.auction_images += 1
                ladder_spec = item.get('bids') or []
                ladder = [
                    (users[uname], starting + (incr * step))
                    for uname, step in ladder_spec
                ]
                summary.bids += _place_bids(auction, ladder)
                closed, did_close = AuctionLifecycleService.close_auction(auction.pk)
                if not did_close:
                    summary.notes.append(
                        f'Close skipped for {product.title} (already terminal).'
                    )
                summary.closed_auctions += 1
                if item.get('checkout') and closed.winning_bidder_id:
                    CheckoutService.checkout_for_winner(
                        closed.pk,
                        closed.winning_bidder,
                    )
                    summary.payments += 1

            elif kind == 'closed_reserve':
                reserve = item['reserve']
                auction = _create_auction_for_product(
                    product=product,
                    starting_bid=starting,
                    min_increment=incr,
                    start_time=now - timedelta(days=2),
                    end_time=now + timedelta(hours=6),
                    reserve_price=reserve,
                )
                if _ensure_auction_demo_image(auction, product):
                    summary.auction_images += 1
                ladder_spec = item.get('bids') or []
                ladder = [
                    (users[uname], starting + (incr * step))
                    for uname, step in ladder_spec
                ]
                summary.bids += _place_bids(auction, ladder)
                AuctionLifecycleService.close_auction(auction.pk)
                summary.closed_no_winner += 1

            elif kind == 'cancelled':
                auction = _create_auction_for_product(
                    product=product,
                    starting_bid=starting,
                    min_increment=incr,
                    start_time=now - timedelta(hours=3),
                    end_time=now + timedelta(hours=12),
                )
                if _ensure_auction_demo_image(auction, product):
                    summary.auction_images += 1
                ladder_spec = item.get('bids') or []
                if ladder_spec:
                    ladder = [
                        (users[uname], starting + (incr * step))
                        for uname, step in ladder_spec
                    ]
                    summary.bids += _place_bids(auction, ladder)
                AuctionLifecycleService.cancel_auction(auction.pk)
                summary.cancelled_auctions += 1

    summary.notifications = Notification.objects.filter(
        user__in=demo_user_queryset()
    ).count()
    summary.notes.append(
        'Live windows use server now + live-duration; re-run with --reset to refresh.'
    )
    return summary
