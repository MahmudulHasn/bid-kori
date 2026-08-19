import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from auctions.models import Auction, Bid
from products.models import Product


class Command(BaseCommand):
    """Seed the database with demo users, products, auctions, and bids.

    Creates a seller, two buyers, and four products owned by the seller. Each
    product gets a 7-day ACTIVE auction with two simulated bids, and the
    auction's highest bid / winning bidder are updated accordingly. The command
    is idempotent: re-running it will not create duplicates or crash.
    """

    help = 'Seeds demo users, products, auctions, and simulated bids.'

    USERS = [
        {
            'username': 'seller_demo',
            'email': 'seller@bidkori.com',
            'password': 'password123',
        },
        {
            'username': 'buyer_one',
            'email': 'buyer_one@bidkori.com',
            'password': 'password123',
        },
        {
            'username': 'buyer_two',
            'email': 'buyer_two@bidkori.com',
            'password': 'password123',
        },
    ]

    PRODUCTS = [
        {
            'title': 'Vintage Camera',
            'description': (
                'A beautifully preserved 1970s 35mm film camera with a fast '
                '50mm prime lens. Fully mechanical, tested, and ready to shoot.'
            ),
            'condition': Product.Condition.USED_GOOD,
            'starting_price': Decimal('4500.00'),
        },
        {
            'title': 'Mechanical Keyboard',
            'description': (
                'Compact 75% hot-swappable mechanical keyboard with tactile '
                'brown switches, PBT keycaps, and per-key RGB lighting.'
            ),
            'condition': Product.Condition.USED_LIKE_NEW,
            'starting_price': Decimal('3200.00'),
        },
        {
            'title': 'Leather Jacket',
            'description': (
                'Genuine full-grain leather biker jacket in classic black. '
                'Size M, minimal wear, with a soft quilted inner lining.'
            ),
            'condition': Product.Condition.USED_GOOD,
            'starting_price': Decimal('6000.00'),
        },
        {
            'title': 'Antique Watch',
            'description': (
                'Rare hand-wound Swiss dress watch from the 1950s with a '
                'restored dial, sapphire crystal, and a genuine leather strap.'
            ),
            'condition': Product.Condition.FAIR,
            'starting_price': Decimal('15000.00'),
        },
    ]

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()

        created_users = {}
        for data in self.USERS:
            user = User.objects.filter(username=data['username']).first()
            if user is None:
                user = User.objects.create_user(
                    username=data['username'],
                    email=data['email'],
                    password=data['password'],
                )
                self.stdout.write(
                    self.style.SUCCESS(f"Created user '{user.username}'.")
                )
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f"User '{user.username}' already exists, skipping."
                    )
                )
            created_users[data['username']] = user

        seller = created_users['seller_demo']
        buyer_one = created_users['buyer_one']
        buyer_two = created_users['buyer_two']

        now = timezone.now()

        for data in self.PRODUCTS:
            starting_price = data['starting_price']

            product, created = Product.objects.get_or_create(
                title=data['title'],
                seller=seller,
                defaults={
                    'description': data['description'],
                    'condition': data['condition'],
                },
            )
            if created:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Created product '{product.title}' "
                        f"(starting price: {starting_price})."
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f"Product '{product.title}' already exists, skipping."
                    )
                )

            auction, auction_created = Auction.objects.get_or_create(
                product=product,
                defaults={
                    'starting_bid': starting_price,
                    'current_highest_bid': starting_price,
                    'start_time': now,
                    'end_time': now + datetime.timedelta(days=7),
                    'status': Auction.Status.ACTIVE,
                },
            )
            if auction_created:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  Created 7-day ACTIVE auction for '{product.title}'."
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f"  Auction for '{product.title}' already exists, skipping."
                    )
                )

            planned_bids = [
                (buyer_one, starting_price + Decimal('10.00')),
                (buyer_two, starting_price + Decimal('25.00')),
            ]

            for bidder, amount in planned_bids:
                bid, bid_created = Bid.objects.get_or_create(
                    auction=auction,
                    bidder=bidder,
                    amount=amount,
                )
                if bid_created:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"    {bidder.username} bid {amount}."
                        )
                    )

            highest_bid = auction.bids.order_by('-amount').first()
            if highest_bid is not None and (
                auction.current_highest_bid != highest_bid.amount
                or auction.winning_bidder_id != highest_bid.bidder_id
            ):
                auction.current_highest_bid = highest_bid.amount
                auction.winning_bidder = highest_bid.bidder
                auction.save(update_fields=['current_highest_bid', 'winning_bidder'])
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  Highest bid: {highest_bid.amount} by "
                        f"{highest_bid.bidder.username}."
                    )
                )

        self.stdout.write(
            self.style.SUCCESS('Seed data (users + products + auctions + bids) complete.')
        )
