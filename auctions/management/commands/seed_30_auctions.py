"""Seed 30 realistic demo auctions with original product photography."""

from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files import File
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from auctions.models import Auction, AuctionImage, Bid
from auctions.services import BidService
from products.models import Category, Product, ProductImage
from users.models import UserProfile, ensure_user_profile

DEMO_PASSWORD = 'DemoShowcase123!'
DEMO_TITLE_PREFIX = '[DEMO] '

DEMO_SELLERS = [
    {'username': 'demo_seller_electronics', 'email': 'demo_seller_electronics@bidkori.local'},
    {'username': 'demo_seller_gaming', 'email': 'demo_seller_gaming@bidkori.local'},
    {'username': 'demo_seller_collectibles', 'email': 'demo_seller_collectibles@bidkori.local'},
]

DEMO_BUYERS = [
    {'username': 'demo_buyer_a', 'email': 'demo_buyer_a@bidkori.local'},
    {'username': 'demo_buyer_b', 'email': 'demo_buyer_b@bidkori.local'},
    {'username': 'demo_buyer_c', 'email': 'demo_buyer_c@bidkori.local'},
    {'username': 'demo_buyer_d', 'email': 'demo_buyer_d@bidkori.local'},
]

DEMO_ITEMS = [
    {
        'title': 'iPhone 15 Pro Max Natural Titanium 256GB',
        'category': 'Smartphones',
        'condition': Product.Condition.USED_LIKE_NEW,
        'desc': 'Flawless condition iPhone 15 Pro Max with 100% battery health. Comes with original box, braided USB-C cable, and AppleCare+ valid through 2027.',
        'start': Decimal('135000.00'),
        'incr': Decimal('1000.00'),
        'image': 'iphone_15_pro.jpg',
        'hours_left': 8,
        'seller': 'demo_seller_electronics',
        'bids': [('demo_buyer_a', 1), ('demo_buyer_b', 2), ('demo_buyer_d', 3)],
    },
    {
        'title': 'Samsung Galaxy S24 Ultra Titanium Gray 512GB',
        'category': 'Smartphones',
        'condition': Product.Condition.USED_LIKE_NEW,
        'desc': 'Flagship S24 Ultra with Snapdragon 8 Gen 3, integrated S-Pen, and Galaxy AI features. Screen protected with official anti-reflective film.',
        'start': Decimal('125000.00'),
        'incr': Decimal('1000.00'),
        'image': 's24_ultra.jpg',
        'hours_left': 14,
        'seller': 'demo_seller_electronics',
        'bids': [('demo_buyer_c', 1), ('demo_buyer_a', 2)],
    },
    {
        'title': 'Google Pixel 8 Pro Bay Blue 128GB',
        'category': 'Smartphones',
        'condition': Product.Condition.USED_GOOD,
        'desc': 'Stunning Bay Blue finish with Tensor G3 chip and class-leading computational photography. Factory unlocked for all carriers.',
        'start': Decimal('68000.00'),
        'incr': Decimal('500.00'),
        'image': 'pixel_8_pro.jpg',
        'hours_left': 22,
        'seller': 'demo_seller_electronics',
        'bids': [('demo_buyer_b', 1), ('demo_buyer_d', 2)],
    },
    {
        'title': 'OnePlus 12 Emerald Green 16GB RAM 512GB',
        'category': 'Smartphones',
        'condition': Product.Condition.USED_LIKE_NEW,
        'desc': 'Powerful flagship with Snapdragon 8 Gen 3 and 100W SUPERVOOC fast charger included. 2K ProXDR display with Aqua Touch.',
        'start': Decimal('62000.00'),
        'incr': Decimal('500.00'),
        'image': 'oneplus_12.jpg',
        'hours_left': 36,
        'seller': 'demo_seller_electronics',
        'bids': [('demo_buyer_a', 1)],
    },
    {
        'title': 'Apple MacBook Pro 16-inch M3 Max (36GB / 1TB)',
        'category': 'Laptops',
        'condition': Product.Condition.USED_LIKE_NEW,
        'desc': 'Liquid Retina XDR display in Space Black. 16-core CPU, 40-core GPU powerhouse for 8K video editing and machine learning workflows.',
        'start': Decimal('280000.00'),
        'incr': Decimal('2500.00'),
        'image': 'macbook_pro.jpg',
        'hours_left': 12,
        'seller': 'demo_seller_electronics',
        'bids': [('demo_buyer_b', 1), ('demo_buyer_c', 2), ('demo_buyer_a', 3)],
    },
    {
        'title': 'Dell XPS 15 9530 OLED InfinityEdge Laptop',
        'category': 'Laptops',
        'condition': Product.Condition.USED_GOOD,
        'desc': 'Intel Core i7-13700H with 3.5K OLED touch display and NVIDIA RTX 4060 graphics. Premium CNC machined aluminum body with carbon fiber palm rest.',
        'start': Decimal('140000.00'),
        'incr': Decimal('1000.00'),
        'image': 'dell_xps.jpg',
        'hours_left': 18,
        'seller': 'demo_seller_electronics',
        'bids': [('demo_buyer_d', 1), ('demo_buyer_b', 2)],
    },
    {
        'title': 'ASUS ROG Zephyrus G16 OLED Gaming Laptop',
        'category': 'Laptops',
        'condition': Product.Condition.USED_LIKE_NEW,
        'desc': 'Ultra-slim gaming laptop with 240Hz ROG Nebula OLED panel, Intel Core Ultra 9, and RTX 4070. Includes 240W charger and ROG sleeve.',
        'start': Decimal('185000.00'),
        'incr': Decimal('1500.00'),
        'image': 'rog_laptop.jpg',
        'hours_left': 28,
        'seller': 'demo_seller_gaming',
        'bids': [('demo_buyer_a', 1), ('demo_buyer_c', 2)],
    },
    {
        'title': 'Lenovo ThinkPad X1 Carbon Gen 11 Ultrabook',
        'category': 'Laptops',
        'condition': Product.Condition.USED_GOOD,
        'desc': 'Legendary business ultrabook weighing just 1.12kg. Features backlit keyboard, fingerprint reader, and battery life exceeding 12 hours.',
        'start': Decimal('95000.00'),
        'incr': Decimal('1000.00'),
        'image': 'thinkpad.jpg',
        'hours_left': 42,
        'seller': 'demo_seller_electronics',
        'bids': [('demo_buyer_b', 1)],
    },
    {
        'title': 'Sony PlayStation 5 Slim Digital Edition Console',
        'category': 'Gaming Consoles',
        'condition': Product.Condition.NEW,
        'desc': 'Brand new in sealed box. 1TB SSD storage, ultra-high speed loading, haptic feedback controller, and 3D Audio support.',
        'start': Decimal('52000.00'),
        'incr': Decimal('500.00'),
        'image': 'ps5.jpg',
        'hours_left': 6,
        'seller': 'demo_seller_gaming',
        'bids': [('demo_buyer_c', 1), ('demo_buyer_d', 2), ('demo_buyer_a', 3)],
    },
    {
        'title': 'Xbox Series X 1TB Gaming Console',
        'category': 'Gaming Consoles',
        'condition': Product.Condition.USED_GOOD,
        'desc': 'True 4K gaming at up to 120 FPS with 12 teraflops of raw graphic processing power. Includes Wireless Controller and high-speed HDMI 2.1 cable.',
        'start': Decimal('54000.00'),
        'incr': Decimal('500.00'),
        'image': 'xbox_series_x.jpg',
        'hours_left': 16,
        'seller': 'demo_seller_gaming',
        'bids': [('demo_buyer_a', 1), ('demo_buyer_b', 2)],
    },
    {
        'title': 'Nintendo Switch OLED Mario Red Edition',
        'category': 'Gaming Consoles',
        'condition': Product.Condition.USED_LIKE_NEW,
        'desc': 'Vibrant 7-inch OLED screen in signature Mario Red styling with subtle silhouette surprises on the dock. Complete packaging included.',
        'start': Decimal('34000.00'),
        'incr': Decimal('400.00'),
        'image': 'switch_oled.jpg',
        'hours_left': 24,
        'seller': 'demo_seller_gaming',
        'bids': [('demo_buyer_d', 1), ('demo_buyer_c', 2)],
    },
    {
        'title': 'Steam Deck OLED 1TB Handheld Gaming PC',
        'category': 'Gaming Consoles',
        'condition': Product.Condition.USED_LIKE_NEW,
        'desc': 'Top-spec 1TB model with premium anti-glare etched glass, 90Hz HDR OLED display, carrying case with removable liner, and power supply.',
        'start': Decimal('68000.00'),
        'incr': Decimal('500.00'),
        'image': 'steam_deck.jpg',
        'hours_left': 30,
        'seller': 'demo_seller_gaming',
        'bids': [('demo_buyer_b', 1), ('demo_buyer_a', 2)],
    },
    {
        'title': 'Sony Alpha 7 IV Full-Frame Hybrid Camera',
        'category': 'Cameras',
        'condition': Product.Condition.USED_LIKE_NEW,
        'desc': '33MP full-frame Exmor R CMOS sensor with BIONZ XR processing. Shutter count under 4,200. Clean sensor, original strap, and dual battery charger.',
        'start': Decimal('195000.00'),
        'incr': Decimal('1500.00'),
        'image': 'sony_a7iv.jpg',
        'hours_left': 10,
        'seller': 'demo_seller_electronics',
        'bids': [('demo_buyer_d', 1), ('demo_buyer_c', 2), ('demo_buyer_b', 3)],
    },
    {
        'title': 'Canon EOS R6 Mark II Mirrorless Body',
        'category': 'Cameras',
        'condition': Product.Condition.USED_GOOD,
        'desc': '24.2 MP full-frame sensor capable of 40 fps electronic shutter shooting and 6K oversampled 4K 60p video. Pristine condition with EF-EOS R adapter.',
        'start': Decimal('210000.00'),
        'incr': Decimal('2000.00'),
        'image': 'canon_r6.jpg',
        'hours_left': 20,
        'seller': 'demo_seller_electronics',
        'bids': [('demo_buyer_a', 1), ('demo_buyer_d', 2)],
    },
    {
        'title': 'Fujifilm X-T5 Mirrorless Camera Silver Body',
        'category': 'Cameras',
        'condition': Product.Condition.USED_LIKE_NEW,
        'desc': 'Fifth-generation 40.2MP X-Trans CMOS 5 HR sensor in a compact, classic dial-based chassis. Legendary film simulation profiles built-in.',
        'start': Decimal('165000.00'),
        'incr': Decimal('1000.00'),
        'image': 'fujifilm_xt5.jpg',
        'hours_left': 32,
        'seller': 'demo_seller_collectibles',
        'bids': [('demo_buyer_b', 1), ('demo_buyer_c', 2)],
    },
    {
        'title': 'DJI Mini 4 Pro Drone Fly More Combo Plus',
        'category': 'Cameras',
        'condition': Product.Condition.NEW,
        'desc': 'Omnidirectional obstacle sensing, 4K/60fps HDR True Vertical Shooting, and extended 45-min flight time with 3 Intelligent Flight Batteries.',
        'start': Decimal('115000.00'),
        'incr': Decimal('1000.00'),
        'image': 'dji_drone.jpg',
        'hours_left': 15,
        'seller': 'demo_seller_electronics',
        'bids': [('demo_buyer_c', 1), ('demo_buyer_a', 2), ('demo_buyer_d', 3)],
    },
    {
        'title': 'NVIDIA GeForce RTX 4080 Super Founders Edition',
        'category': 'PC Components',
        'condition': Product.Condition.NEW,
        'desc': '16GB GDDR6X memory with DLSS 3 frame generation and cutting-edge Ada Lovelace architecture. Factory sealed with original receipt.',
        'start': Decimal('135000.00'),
        'incr': Decimal('1000.00'),
        'image': 'rtx_4080.jpg',
        'hours_left': 11,
        'seller': 'demo_seller_gaming',
        'bids': [('demo_buyer_a', 1), ('demo_buyer_b', 2)],
    },
    {
        'title': 'AMD Ryzen 9 7950X3D 16-Core 3D V-Cache CPU',
        'category': 'PC Components',
        'condition': Product.Condition.NEW,
        'desc': 'Ultimate gaming and workstation processor with 144MB cache and 5.7 GHz max boost on the AM5 platform. Unopened box.',
        'start': Decimal('65000.00'),
        'incr': Decimal('500.00'),
        'image': 'ryzen_9.jpg',
        'hours_left': 38,
        'seller': 'demo_seller_gaming',
        'bids': [('demo_buyer_c', 1), ('demo_buyer_d', 2)],
    },
    {
        'title': 'Apple Watch Ultra 2 Titanium Case with Ocean Band',
        'category': 'Watches',
        'condition': Product.Condition.USED_LIKE_NEW,
        'desc': 'Rugged 49mm aerospace-grade titanium case with brightest 3000-nit display and precision dual-frequency GPS. Includes authentic orange Ocean band.',
        'start': Decimal('82000.00'),
        'incr': Decimal('800.00'),
        'image': 'apple_watch.jpg',
        'hours_left': 9,
        'seller': 'demo_seller_electronics',
        'bids': [('demo_buyer_b', 1), ('demo_buyer_a', 2), ('demo_buyer_c', 3)],
    },
    {
        'title': 'Omega Speedmaster Moonwatch Professional Chronograph',
        'category': 'Watches',
        'condition': Product.Condition.USED_LIKE_NEW,
        'desc': 'Master Chronometer certified Co-Axial Calibre 3861 with sapphire crystal and exhibition caseback. Complete box, papers, and warranty card.',
        'start': Decimal('620000.00'),
        'incr': Decimal('5000.00'),
        'image': 'omega_watch.jpg',
        'hours_left': 48,
        'seller': 'demo_seller_collectibles',
        'bids': [('demo_buyer_d', 1), ('demo_buyer_b', 2)],
    },
    {
        'title': 'Seiko Prospex Diver Automatic "King Turtle" SRPE03',
        'category': 'Watches',
        'condition': Product.Condition.USED_GOOD,
        'desc': '200m water resistance with ceramic bezel insert and waffle dial. 4R36 automatic movement with 41-hour power reserve. Solid stainless steel bracelet.',
        'start': Decimal('45000.00'),
        'incr': Decimal('500.00'),
        'image': 'seiko_diver.jpg',
        'hours_left': 26,
        'seller': 'demo_seller_collectibles',
        'bids': [('demo_buyer_a', 1), ('demo_buyer_c', 2)],
    },
    {
        'title': 'Casio G-Shock GA-2100 "CasiOak" All Black Edition',
        'category': 'Watches',
        'condition': Product.Condition.NEW,
        'desc': 'Stealth all-black colorway with Carbon Core Guard structure and 200-meter water resistance. Thin profile with double LED illuminator.',
        'start': Decimal('11500.00'),
        'incr': Decimal('200.00'),
        'image': 'gshock.jpg',
        'hours_left': 19,
        'seller': 'demo_seller_collectibles',
        'bids': [('demo_buyer_b', 1), ('demo_buyer_d', 2)],
    },
    {
        'title': 'Nike Air Jordan 1 Retro High OG "Chicago Lost and Found"',
        'category': 'Sneakers',
        'condition': Product.Condition.NEW,
        'desc': 'Deadstock condition, US Men size 10.5. Authentic vintage-inspired cracked leather aesthetic with retro invoice and original replacement laces.',
        'start': Decimal('38000.00'),
        'incr': Decimal('500.00'),
        'image': 'jordan_1.jpg',
        'hours_left': 7,
        'seller': 'demo_seller_collectibles',
        'bids': [('demo_buyer_c', 1), ('demo_buyer_a', 2), ('demo_buyer_d', 3)],
    },
    {
        'title': 'Adidas Yeezy Boost 350 V2 Zebra',
        'category': 'Sneakers',
        'condition': Product.Condition.USED_LIKE_NEW,
        'desc': 'Size US 10. Iconic black and white Primeknit pattern with bold red SPLY-350 text and responsive full-length Boost midsole cushioning.',
        'start': Decimal('28000.00'),
        'incr': Decimal('400.00'),
        'image': 'yeezy_350.jpg',
        'hours_left': 17,
        'seller': 'demo_seller_collectibles',
        'bids': [('demo_buyer_b', 1), ('demo_buyer_c', 2)],
    },
    {
        'title': 'New Balance 990v6 Made in USA Marblehead Grey',
        'category': 'Sneakers',
        'condition': Product.Condition.NEW,
        'desc': 'Premium pigskin suede and mesh upper with FuelCell foam cushioning. Unworn with tags and original heritage shoebox. US Men size 9.5.',
        'start': Decimal('24000.00'),
        'incr': Decimal('300.00'),
        'image': 'new_balance.jpg',
        'hours_left': 34,
        'seller': 'demo_seller_collectibles',
        'bids': [('demo_buyer_a', 1), ('demo_buyer_d', 2)],
    },
    {
        'title': 'Nike Dunk Low Retro Panda Black White',
        'category': 'Sneakers',
        'condition': Product.Condition.USED_GOOD,
        'desc': 'Classic two-tone leather colorblock Dunk Low. US Men size 10. Clean upper with minimal creasing and solid tread grip remaining.',
        'start': Decimal('13500.00'),
        'incr': Decimal('200.00'),
        'image': 'nike_dunk.jpg',
        'hours_left': 25,
        'seller': 'demo_seller_collectibles',
        'bids': [('demo_buyer_b', 1), ('demo_buyer_a', 2)],
    },
    {
        'title': 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
        'category': 'Electronics',
        'condition': Product.Condition.USED_LIKE_NEW,
        'desc': 'Industry-leading noise cancellation with two processors and 8 microphones. 30-hour battery life with quick charge. Soft fit leather in silver.',
        'start': Decimal('36000.00'),
        'incr': Decimal('400.00'),
        'image': 'sony_headphones.jpg',
        'hours_left': 13,
        'seller': 'demo_seller_electronics',
        'bids': [('demo_buyer_c', 1), ('demo_buyer_d', 2)],
    },
    {
        'title': 'Bose QuietComfort Ultra Wireless Headphones',
        'category': 'Electronics',
        'condition': Product.Condition.NEW,
        'desc': 'Spatial audio immersion with CustomTune technology and World-Class active noise cancellation. Black finish, unopened original retail box.',
        'start': Decimal('42000.00'),
        'incr': Decimal('500.00'),
        'image': 'bose_headphones.jpg',
        'hours_left': 27,
        'seller': 'demo_seller_electronics',
        'bids': [('demo_buyer_a', 1), ('demo_buyer_b', 2), ('demo_buyer_c', 3)],
    },
    {
        'title': 'Keychron Q1 Pro Custom Wireless Mechanical Keyboard',
        'category': 'Electronics',
        'condition': Product.Condition.USED_LIKE_NEW,
        'desc': 'Full CNC aluminum body, 75% layout, hot-swappable Keychron K Pro Banana tactile switches, PBT keycaps, and custom QMK/VIA key remapping.',
        'start': Decimal('21000.00'),
        'incr': Decimal('300.00'),
        'image': 'mechanical_keyboard.jpg',
        'hours_left': 31,
        'seller': 'demo_seller_electronics',
        'bids': [('demo_buyer_d', 1), ('demo_buyer_a', 2)],
    },
    {
        'title': '1999 Pokemon Base Set 1st Edition Charizard Holo (PSA 8)',
        'category': 'Collectibles',
        'condition': Product.Condition.USED_LIKE_NEW,
        'desc': 'Holy grail of vintage Pokemon cards. Authenticated and graded Near Mint-Mint 8 by PSA in tamper-evident sonic-sealed slab.',
        'start': Decimal('850000.00'),
        'incr': Decimal('10000.00'),
        'image': 'charizard_card.jpg',
        'hours_left': 45,
        'seller': 'demo_seller_collectibles',
        'bids': [('demo_buyer_c', 1), ('demo_buyer_b', 2), ('demo_buyer_a', 3)],
    },
]


class Command(BaseCommand):
    help = 'Seed 30 realistic live demo auctions with high-resolution original product images.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('Starting 30-demo-auction seeding...'))
        assets_dir = Path(settings.BASE_DIR) / 'demo_assets' / 'products_30'
        if not assets_dir.is_dir():
            self.stderr.write(f'Assets directory not found: {assets_dir}')
            return

        User = get_user_model()

        # 1. Ensure Categories
        categories = {}
        for item in DEMO_ITEMS:
            cat_name = item['category']
            if cat_name not in categories:
                cat, _ = Category.objects.get_or_create(
                    name=cat_name,
                    defaults={'slug': slugify(cat_name)},
                )
                categories[cat_name] = cat

        # 2. Ensure Sellers with verified status
        sellers = {}
        for s_data in DEMO_SELLERS:
            user, _ = User.objects.get_or_create(
                username=s_data['username'],
                defaults={'email': s_data['email']},
            )
            user.set_password(DEMO_PASSWORD)
            user.save()
            profile = ensure_user_profile(user, role=UserProfile.Role.SELLER)
            profile.role = UserProfile.Role.SELLER
            profile.seller_verified = True
            profile.save()
            sellers[s_data['username']] = user

        # 3. Ensure Buyers
        buyers = {}
        for b_data in DEMO_BUYERS:
            user, _ = User.objects.get_or_create(
                username=b_data['username'],
                defaults={'email': b_data['email']},
            )
            user.set_password(DEMO_PASSWORD)
            user.save()
            profile = ensure_user_profile(user, role=UserProfile.Role.BUYER)
            profile.role = UserProfile.Role.BUYER
            profile.save()
            buyers[b_data['username']] = user

        # 4. Remove previous [DEMO] products & auctions
        with transaction.atomic():
            old_products = Product.objects.filter(title__startswith=DEMO_TITLE_PREFIX)
            old_count = old_products.count()
            old_products.delete()
            self.stdout.write(f'Cleaned up {old_count} prior demo products.')

        # 5. Create 30 Products and Auctions with original photos
        now = timezone.now()
        created_auctions = 0
        created_bids = 0

        for idx, item in enumerate(DEMO_ITEMS, start=1):
            with transaction.atomic():
                seller = sellers[item['seller']]
                cat = categories[item['category']]
                title = f"{DEMO_TITLE_PREFIX}{item['title']}"

                product = Product.objects.create(
                    seller=seller,
                    title=title,
                    description=item['desc'],
                    condition=item['condition'],
                    category=cat,
                )

                # Attach ProductImage
                img_path = assets_dir / item['image']
                if img_path.is_file():
                    with img_path.open('rb') as f:
                        ProductImage.objects.create(
                            product=product,
                            image=File(f, name=f"{slugify(item['title'])[:40]}.jpg"),
                        )

                # Create Live Auction
                start_time = now - timedelta(hours=2)
                end_time = now + timedelta(hours=item['hours_left'])
                auction = Auction.objects.create(
                    product=product,
                    start_time=start_time,
                    end_time=end_time,
                    starting_bid=item['start'],
                    current_highest_bid=item['start'],
                    min_increment=item['incr'],
                    status=Auction.Status.ACTIVE,
                )

                # Attach AuctionImage
                if img_path.is_file():
                    with img_path.open('rb') as f:
                        AuctionImage.objects.create(
                            auction=auction,
                            image=File(f, name=f"{slugify(item['title'])[:40]}.jpg"),
                        )

                # Place ladder bids
                for b_username, step in item.get('bids', []):
                    buyer = buyers[b_username]
                    amount = item['start'] + (item['incr'] * step)
                    try:
                        BidService.place_bid(
                            auction=auction,
                            bidder=buyer,
                            amount=amount,
                        )
                        created_bids += 1
                    except Exception as exc:
                        # Fallback direct creation if validation edge case
                        Bid.objects.create(
                            auction=auction,
                            bidder=buyer,
                            amount=amount,
                        )
                        auction.current_highest_bid = amount
                        auction.winning_bidder = buyer
                        auction.save(update_fields=['current_highest_bid', 'winning_bidder'])
                        created_bids += 1

                created_auctions += 1
                self.stdout.write(f"[{idx}/30] Created auction for {item['title']} (Ends in {item['hours_left']}h)")

        self.stdout.write(self.style.SUCCESS(
            f"\nFinished seeding! Successfully created {created_auctions} demo auctions with original images and {created_bids} bids."
        ))
