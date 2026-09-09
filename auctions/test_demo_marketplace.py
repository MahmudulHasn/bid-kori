"""Tests for SHOW-D01 demo marketplace seeder."""

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from auctions.demo_marketplace import (
    DEMO_PASSWORD,
    DEMO_TITLE_PREFIX,
    clear_demo_marketplace,
    seed_demo_marketplace,
)
from auctions.models import Auction, Bid, Payment
from products.models import Product
from users.models import resolve_user_role


@override_settings(DEBUG=True)
class DemoMarketplaceSeedTests(TestCase):
    def tearDown(self):
        clear_demo_marketplace()

    def test_seed_creates_expected_users_and_roles(self):
        with self.captureOnCommitCallbacks(execute=True):
            summary = seed_demo_marketplace(reset=True)

        User = get_user_model()
        self.assertGreaterEqual(summary.users_created, 7)
        seller = User.objects.get(username='demo_seller_electronics')
        buyer = User.objects.get(username='demo_buyer_a')
        admin = User.objects.get(username='demo_admin')
        self.assertEqual(resolve_user_role(seller), 'SELLER')
        self.assertEqual(resolve_user_role(buyer), 'BUYER')
        self.assertEqual(resolve_user_role(admin), 'ADMIN')
        self.assertTrue(buyer.check_password(DEMO_PASSWORD))

    def test_seed_is_idempotent_without_duplicate_users(self):
        with self.captureOnCommitCallbacks(execute=True):
            seed_demo_marketplace(reset=True)
            seed_demo_marketplace(reset=False)

        User = get_user_model()
        self.assertEqual(
            User.objects.filter(username='demo_buyer_a').count(),
            1,
        )
        demo_products = Product.objects.filter(title__startswith=DEMO_TITLE_PREFIX)
        self.assertGreaterEqual(demo_products.count(), 20)

    def test_reset_only_removes_demo_data(self):
        User = get_user_model()
        keeper = User.objects.create_user(
            username='real_user_keep',
            email='keep@example.com',
            password='keep-pass-123',
        )
        Product.objects.create(
            seller=keeper,
            title='Real Non-Demo Camera',
            description='Must survive reset.',
            condition=Product.Condition.USED_GOOD,
        )

        with self.captureOnCommitCallbacks(execute=True):
            seed_demo_marketplace(reset=True)
        clear_demo_marketplace()

        self.assertTrue(User.objects.filter(username='real_user_keep').exists())
        self.assertTrue(
            Product.objects.filter(title='Real Non-Demo Camera').exists()
        )
        self.assertFalse(User.objects.filter(username='demo_buyer_a').exists())
        self.assertFalse(
            Product.objects.filter(title__startswith=DEMO_TITLE_PREFIX).exists()
        )

    def test_primary_buyer_has_wins_active_bids_and_payments(self):
        with self.captureOnCommitCallbacks(execute=True):
            seed_demo_marketplace(reset=True)

        User = get_user_model()
        buyer_a = User.objects.get(username='demo_buyer_a')

        won = Auction.objects.filter(
            status=Auction.Status.CLOSED,
            winning_bidder=buyer_a,
            product__title__startswith=DEMO_TITLE_PREFIX,
        )
        self.assertGreaterEqual(won.count(), 2)

        active_bids = Bid.objects.filter(
            bidder=buyer_a,
            auction__status=Auction.Status.ACTIVE,
            auction__product__title__startswith=DEMO_TITLE_PREFIX,
        )
        self.assertGreaterEqual(
            active_bids.values('auction_id').distinct().count(),
            2,
        )

        payments = Payment.objects.filter(
            user=buyer_a,
            status=Payment.Status.COMPLETED,
            auction__product__title__startswith=DEMO_TITLE_PREFIX,
        )
        self.assertGreaterEqual(payments.count(), 1)
        payment = payments.first()
        self.assertIsNotNone(payment.platform_fee)
        self.assertIsNotNone(payment.seller_net_amount)
        self.assertEqual(
            payment.amount,
            payment.platform_fee + payment.seller_net_amount,
        )

    def test_demo_products_and_auctions_receive_images(self):
        with self.captureOnCommitCallbacks(execute=True):
            summary = seed_demo_marketplace(reset=True)

        from products.models import ProductImage
        from auctions.models import AuctionImage

        demo_products = Product.objects.filter(title__startswith=DEMO_TITLE_PREFIX)
        self.assertGreaterEqual(summary.product_images, 20)
        self.assertEqual(
            ProductImage.objects.filter(product__in=demo_products).count(),
            demo_products.count(),
        )
        auctioned = Auction.objects.filter(
            product__title__startswith=DEMO_TITLE_PREFIX,
        )
        self.assertGreaterEqual(summary.auction_images, auctioned.count())
        self.assertEqual(
            AuctionImage.objects.filter(auction__in=auctioned).count(),
            auctioned.count(),
        )
        # Idempotent reseed without reset must not duplicate images.
        with self.captureOnCommitCallbacks(execute=True):
            seed_demo_marketplace(reset=False)
        self.assertEqual(
            ProductImage.objects.filter(product__in=demo_products).count(),
            demo_products.count(),
        )
        self.assertEqual(
            AuctionImage.objects.filter(auction__in=auctioned).count(),
            auctioned.count(),
        )

    def test_integrity_cancelled_and_reserve_close(self):
        with self.captureOnCommitCallbacks(execute=True):
            seed_demo_marketplace(reset=True)

        cancelled = Auction.objects.filter(
            status=Auction.Status.CANCELLED,
            product__title__startswith=DEMO_TITLE_PREFIX,
        )
        self.assertGreaterEqual(cancelled.count(), 2)
        for auction in cancelled:
            self.assertIsNone(auction.winning_bidder_id)
            self.assertFalse(Payment.objects.filter(auction=auction).exists())

        no_winner = Auction.objects.filter(
            status=Auction.Status.CLOSED,
            winning_bidder__isnull=True,
            product__title__startswith=DEMO_TITLE_PREFIX,
        )
        self.assertGreaterEqual(no_winner.count(), 3)

        for auction in Auction.objects.filter(
            status=Auction.Status.CLOSED,
            winning_bidder__isnull=False,
            product__title__startswith=DEMO_TITLE_PREFIX,
        ):
            highest = auction.bids.order_by('-amount', 'timestamp').first()
            self.assertIsNotNone(highest)
            self.assertEqual(auction.winning_bidder_id, highest.bidder_id)
            self.assertEqual(auction.current_highest_bid, highest.amount)

    def test_management_command_runs(self):
        with self.captureOnCommitCallbacks(execute=True):
            call_command(
                'seed_demo_marketplace',
                '--reset',
                verbosity=0,
            )
        self.assertTrue(
            get_user_model().objects.filter(username='demo_buyer_a').exists()
        )

    def test_command_refuses_without_confirm_when_debug_false(self):
        with override_settings(DEBUG=False):
            with self.assertRaises(CommandError):
                call_command('seed_demo_marketplace', verbosity=0)
