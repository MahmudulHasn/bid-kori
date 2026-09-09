"""Regression: Postgres FOR UPDATE must not target nullable outer joins."""

from django.contrib.auth.models import User
from django.db import connection, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from products.models import Category, Product
from products.mutation_policy import ProductMutationPolicy

from .models import Auction
from .services import AuctionLifecycleService


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class PostgresSelectForUpdateJoinTests(TestCase):
    """These locks previously 500'd on PostgreSQL with nullable select_related."""

    def setUp(self):
        if connection.vendor != 'postgresql':
            self.skipTest('Requires PostgreSQL (nullable OUTER JOIN FOR UPDATE).')
        self.seller = User.objects.create_user('lock_seller', password='x')
        self.buyer = User.objects.create_user('lock_buyer', password='x')
        self.category = Category.objects.create(name='Lock Cat', slug='lock-cat')
        self.product = Product.objects.create(
            seller=self.seller,
            category=self.category,
            title='Lock Product',
            description='d',
            condition=Product.Condition.USED_GOOD,
        )
        now = timezone.now()
        self.auction = Auction.objects.create(
            product=self.product,
            starting_bid=Decimal('100.00'),
            current_highest_bid=Decimal('100.00'),
            min_increment=Decimal('10.00'),
            start_time=now - timedelta(minutes=1),
            end_time=now + timedelta(hours=1),
            status=Auction.Status.ACTIVE,
        )

    def test_lifecycle_lock_with_nullable_winning_bidder_and_payment(self):
        with transaction.atomic():
            locked = AuctionLifecycleService._lock_auction(self.auction.pk)
        self.assertEqual(locked.pk, self.auction.pk)

    def test_product_mutation_lock_with_nullable_category(self):
        with transaction.atomic():
            locked = ProductMutationPolicy.lock_product_for_mutation(self.product.pk)
        self.assertEqual(locked.pk, self.product.pk)

    def test_user_suspend_lock_with_profile_outer_join(self):
        from users.account_control import suspend_marketplace_user

        admin = User.objects.create_superuser(
            'lock_admin', 'a@a.local', 'x'
        )
        target = User.objects.create_user('lock_target', password='x')
        from users.models import ensure_user_profile, UserProfile

        ensure_user_profile(target, role=UserProfile.Role.BUYER)
        with transaction.atomic():
            suspended = suspend_marketplace_user(actor=admin, target_id=target.pk)
        self.assertFalse(suspended.is_active)

    def test_lazy_close_path_does_not_500_on_retrieve_lock(self):
        """close_if_expired uses _lock_auction with nullable relations."""
        self.auction.end_time = timezone.now() - timedelta(seconds=1)
        self.auction.save(update_fields=['end_time'])
        with transaction.atomic():
            auction, closed = AuctionLifecycleService.close_if_expired(self.auction.pk)
        self.assertTrue(closed)
        self.assertEqual(auction.status, Auction.Status.CLOSED)
