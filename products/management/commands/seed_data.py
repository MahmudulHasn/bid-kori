from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from products.models import Product


class Command(BaseCommand):
    """Seed the database with demo users and sample products.

    This is the first half of the seed workflow: it creates a seller, two
    buyers, and four products owned by the seller. Starting prices are carried
    on each product's future auction (see the auctions seeder), since the
    Product model itself has no price field.
    """

    help = 'Seeds demo users (1 seller, 2 buyers) and 4 sample products.'

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

        for data in self.PRODUCTS:
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
                        f"(starting price: {data['starting_price']})."
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f"Product '{product.title}' already exists, skipping."
                    )
                )

        self.stdout.write(self.style.SUCCESS('Seed data (users + products) complete.'))
