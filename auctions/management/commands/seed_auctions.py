from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from auctions.models import Auction
from products.models import Category, Product


class Command(BaseCommand):
    """Seed the database with a test user, categories, and sample auctions."""

    help = 'Seeds the database with mock categories and auctions for testing.'

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()

        seller, created = User.objects.get_or_create(
            username='seller_test',
            defaults={'email': 'seller_test@example.com'},
        )
        if created:
            seller.set_password('testpass123')
            seller.save(update_fields=['password'])
            self.stdout.write(self.style.SUCCESS("Created test user 'seller_test'."))
        else:
            self.stdout.write("Test user 'seller_test' already exists.")

        categories = {}
        for name in ['Electronics', 'Gaming']:
            category, created = Category.objects.get_or_create(
                name=name,
                defaults={'slug': slugify(name)},
            )
            categories[name] = category
            if created:
                self.stdout.write(self.style.SUCCESS(f"Created category '{name}'."))
            else:
                self.stdout.write(f"Category '{name}' already exists.")

        now = timezone.now()

        sample_auctions = [
            {
                'product': {
                    'title': 'Vintage Film Camera',
                    'description': 'A collectible film camera in working condition.',
                    'category': categories['Electronics'],
                    'condition': Product.Condition.USED_GOOD,
                },
                'auction': {
                    'starting_bid': Decimal('500.00'),
                    'min_increment': Decimal('50.00'),
                    'status': Auction.Status.ACTIVE,
                    'start_time': now + timedelta(days=1),
                    'end_time': now + timedelta(days=2),
                },
            },
            {
                'product': {
                    'title': 'Next-Gen Gaming Console',
                    'description': 'Latest generation console, barely used.',
                    'category': categories['Gaming'],
                    'condition': Product.Condition.USED_LIKE_NEW,
                },
                'auction': {
                    'starting_bid': Decimal('20000.00'),
                    'min_increment': Decimal('500.00'),
                    'status': Auction.Status.ACTIVE,
                    'start_time': now - timedelta(hours=1),
                    'end_time': now + timedelta(hours=2),
                },
            },
            {
                'product': {
                    'title': 'Mechanical Keyboard',
                    'description': 'RGB mechanical keyboard with hot-swappable switches.',
                    'category': categories['Gaming'],
                    'condition': Product.Condition.NEW,
                },
                'auction': {
                    'starting_bid': Decimal('3000.00'),
                    'min_increment': Decimal('100.00'),
                    'status': Auction.Status.CLOSED,
                    'start_time': now - timedelta(hours=5),
                    'end_time': now - timedelta(hours=1),
                },
            },
        ]

        created_count = 0
        for entry in sample_auctions:
            product_data = entry['product']
            auction_data = entry['auction']

            if Auction.objects.filter(product__title=product_data['title']).exists():
                self.stdout.write(
                    f"Auction for '{product_data['title']}' already exists, skipping."
                )
                continue

            product = Product.objects.create(seller=seller, **product_data)
            Auction.objects.create(
                product=product,
                current_highest_bid=auction_data['starting_bid'],
                **auction_data,
            )
            created_count += 1
            self.stdout.write(
                self.style.SUCCESS(
                    f"Created {auction_data['status']} auction for "
                    f"'{product_data['title']}'."
                )
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Seeding complete. Created {created_count} new auction(s).'
            )
        )
