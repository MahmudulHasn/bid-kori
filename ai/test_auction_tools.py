"""Unit tests for BidKori chatbot auction tools and intent detection (CHAT-X02)."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from auctions.models import Auction, Bid
from products.models import Category, Product

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
from .intent_detector import (
    detect_auction_intent,
    invalidate_category_cache,
)


class AuctionToolsTestBase(TestCase):
    """Shared test fixtures for auction tools tests."""

    @classmethod
    def setUpTestData(cls):
        cls.seller = User.objects.create_user('seller', 'seller@test.com', 'pass123')
        cls.buyer = User.objects.create_user('buyer', 'buyer@test.com', 'pass123')

        cls.cat_electronics = Category.objects.create(name='Electronics', slug='electronics')
        cls.cat_watches = Category.objects.create(name='Watches', slug='watches')
        cls.cat_art = Category.objects.create(name='Art', slug='art')

        now = timezone.now()

        # Product 1: iPhone in Electronics
        cls.product_iphone = Product.objects.create(
            seller=cls.seller,
            title='iPhone 15 Pro Max',
            description='Latest Apple smartphone',
            category=cls.cat_electronics,
            condition='NEW',
        )
        cls.auction_iphone = Auction.objects.create(
            product=cls.product_iphone,
            starting_bid=Decimal('50000.00'),
            current_highest_bid=Decimal('65000.00'),
            min_increment=Decimal('500.00'),
            start_time=now - timedelta(hours=2),
            end_time=now + timedelta(hours=4),
            status=Auction.Status.ACTIVE,
        )

        # Product 2: Rolex in Watches
        cls.product_rolex = Product.objects.create(
            seller=cls.seller,
            title='Rolex Submariner Date',
            description='Swiss luxury watch',
            category=cls.cat_watches,
            condition='USED_LIKE_NEW',
        )
        cls.auction_rolex = Auction.objects.create(
            product=cls.product_rolex,
            starting_bid=Decimal('150000.00'),
            current_highest_bid=Decimal('185000.00'),
            min_increment=Decimal('1000.00'),
            reserve_price=Decimal('200000.00'),
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1),
            status=Auction.Status.ACTIVE,
        )

        # Product 3: Samsung in Electronics (hidden — should NOT appear)
        cls.product_samsung = Product.objects.create(
            seller=cls.seller,
            title='Samsung Galaxy S24',
            description='Latest Samsung phone',
            category=cls.cat_electronics,
            condition='NEW',
        )
        cls.auction_samsung_hidden = Auction.objects.create(
            product=cls.product_samsung,
            starting_bid=Decimal('40000.00'),
            current_highest_bid=Decimal('45000.00'),
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=3),
            status=Auction.Status.ACTIVE,
            is_hidden=True,
        )

        # Product 4: Painting in Art (CLOSED — should NOT appear in live search)
        cls.product_painting = Product.objects.create(
            seller=cls.seller,
            title='Oil Painting Sunset',
            description='Beautiful painting',
            category=cls.cat_art,
            condition='USED_GOOD',
        )
        cls.auction_painting_closed = Auction.objects.create(
            product=cls.product_painting,
            starting_bid=Decimal('10000.00'),
            current_highest_bid=Decimal('25000.00'),
            start_time=now - timedelta(days=2),
            end_time=now - timedelta(hours=1),
            status=Auction.Status.CLOSED,
        )

        # Add some bids
        Bid.objects.create(
            auction=cls.auction_iphone,
            bidder=cls.buyer,
            amount=Decimal('65000.00'),
        )
        Bid.objects.create(
            auction=cls.auction_rolex,
            bidder=cls.buyer,
            amount=Decimal('185000.00'),
        )

        # Invalidate category cache for fresh test runs
        invalidate_category_cache()


class SearchLiveAuctionsTests(AuctionToolsTestBase):
    """Test search_live_auctions tool."""

    def test_returns_only_active_non_hidden_auctions(self):
        results = search_live_auctions()
        auction_ids = {r['auction_id'] for r in results}
        self.assertIn(self.auction_iphone.pk, auction_ids)
        self.assertIn(self.auction_rolex.pk, auction_ids)
        # Hidden and closed should NOT appear
        self.assertNotIn(self.auction_samsung_hidden.pk, auction_ids)
        self.assertNotIn(self.auction_painting_closed.pk, auction_ids)

    def test_search_by_keyword(self):
        results = search_live_auctions(query='iPhone')
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['title'], 'iPhone 15 Pro Max')

    def test_search_by_keyword_case_insensitive(self):
        results = search_live_auctions(query='rolex')
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['title'], 'Rolex Submariner Date')

    def test_search_by_category(self):
        results = search_live_auctions(category='Electronics')
        # Only iPhone (Samsung is hidden)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['category_name'], 'Electronics')

    def test_search_by_max_price(self):
        results = search_live_auctions(max_price=100000.0)
        titles = [r['title'] for r in results]
        self.assertIn('iPhone 15 Pro Max', titles)
        self.assertNotIn('Rolex Submariner Date', titles)

    def test_search_no_results(self):
        results = search_live_auctions(query='nonexistent_xyz')
        self.assertEqual(results, [])

    def test_card_structure(self):
        results = search_live_auctions(query='iPhone')
        self.assertEqual(len(results), 1)
        card = results[0]
        self.assertIn('auction_id', card)
        self.assertIn('title', card)
        self.assertIn('current_bid', card)
        self.assertIn('starting_bid', card)
        self.assertIn('bid_count', card)
        self.assertIn('ends_in_seconds', card)
        self.assertIn('status', card)
        self.assertIn('href', card)
        self.assertEqual(card['href'], f'/auctions/{self.auction_iphone.pk}')
        self.assertGreater(card['ends_in_seconds'], 0)

    def test_hidden_auctions_never_returned(self):
        results = search_live_auctions(query='Samsung')
        self.assertEqual(len(results), 0)

    def test_sort_by_price_asc(self):
        results = search_live_auctions(sort_by='price_asc')
        if len(results) >= 2:
            self.assertLessEqual(
                float(results[0]['current_bid']),
                float(results[1]['current_bid']),
            )


class GetAuctionDetailsTests(AuctionToolsTestBase):
    """Test get_auction_details tool."""

    def test_returns_details_for_valid_auction(self):
        details = get_auction_details(self.auction_iphone.pk)
        self.assertIsNotNone(details)
        self.assertEqual(details['title'], 'iPhone 15 Pro Max')
        self.assertEqual(details['current_bid'], '65000.00')

    def test_returns_none_for_hidden_auction(self):
        details = get_auction_details(self.auction_samsung_hidden.pk)
        # Hidden auctions are correctly excluded by is_hidden=False filter
        self.assertIsNone(details)

    def test_returns_none_for_nonexistent_auction(self):
        details = get_auction_details(99999)
        self.assertIsNone(details)

    def test_reserve_met_field(self):
        details = get_auction_details(self.auction_rolex.pk)
        self.assertIsNotNone(details)
        self.assertTrue(details['has_reserve'])
        # 185000 < 200000 reserve
        self.assertFalse(details['reserve_met'])


class GetCurrentBidTests(AuctionToolsTestBase):
    """Test get_current_bid tool."""

    def test_returns_bid_info(self):
        info = get_current_bid(self.auction_iphone.pk)
        self.assertIsNotNone(info)
        self.assertEqual(info['current_bid'], '65000.00')
        self.assertEqual(info['bid_count'], 1)

    def test_returns_none_for_nonexistent(self):
        info = get_current_bid(99999)
        self.assertIsNone(info)


class GetTimeRemainingTests(AuctionToolsTestBase):
    """Test get_time_remaining tool."""

    def test_returns_time_info(self):
        info = get_time_remaining(self.auction_iphone.pk)
        self.assertIsNotNone(info)
        self.assertGreater(info['ends_in_seconds'], 0)


class GetEndingSoonTests(AuctionToolsTestBase):
    """Test get_ending_soon tool."""

    def test_returns_auctions_ordered_by_end_time(self):
        results = get_ending_soon()
        self.assertGreater(len(results), 0)
        # Rolex ends sooner than iPhone (1h vs 4h)
        if len(results) >= 2:
            self.assertLessEqual(
                results[0]['ends_in_seconds'],
                results[1]['ends_in_seconds'],
            )


class GetCategoriesWithCountsTests(AuctionToolsTestBase):
    """Test get_categories_with_counts tool."""

    def test_returns_all_categories(self):
        cats = get_categories_with_counts()
        names = {c['name'] for c in cats}
        self.assertIn('Electronics', names)
        self.assertIn('Watches', names)
        self.assertIn('Art', names)

    def test_counts_exclude_hidden(self):
        cats = get_categories_with_counts()
        electronics = next(c for c in cats if c['name'] == 'Electronics')
        # Only iPhone is active+visible (Samsung is hidden)
        self.assertEqual(electronics['active_auction_count'], 1)


class GetAuctionCountTests(AuctionToolsTestBase):
    """Test get_auction_count tool."""

    def test_counts_only_active_visible(self):
        count = get_auction_count()
        # iPhone + Rolex (Samsung hidden, Painting closed)
        self.assertEqual(count, 2)


class FormatHelpersTests(TestCase):
    """Test formatting utility functions."""

    def test_format_taka_integer(self):
        self.assertEqual(format_taka('5000.00'), '৳5,000')

    def test_format_taka_decimal(self):
        self.assertEqual(format_taka('5000.50'), '৳5,000.50')

    def test_format_time_remaining_seconds(self):
        self.assertEqual(format_time_remaining(45), '45s')

    def test_format_time_remaining_minutes(self):
        self.assertEqual(format_time_remaining(150), '2m 30s')

    def test_format_time_remaining_hours(self):
        self.assertEqual(format_time_remaining(7200), '2h')

    def test_format_time_remaining_days(self):
        self.assertEqual(format_time_remaining(90000), '1d 1h')

    def test_format_time_remaining_ended(self):
        self.assertEqual(format_time_remaining(0), 'ended')


class IntentDetectorTests(TestCase):
    """Test intent_detector.detect_auction_intent."""

    @classmethod
    def setUpTestData(cls):
        Category.objects.create(name='Electronics', slug='electronics')
        Category.objects.create(name='Watches', slug='watches')
        invalidate_category_cache()

    def test_search_auctions_intent(self):
        result = detect_auction_intent('show me all live auctions')
        self.assertIsNotNone(result)
        self.assertEqual(result['intent'], 'SEARCH_AUCTIONS')

    def test_search_with_keyword(self):
        result = detect_auction_intent('find me iPhone auctions')
        self.assertIsNotNone(result)
        self.assertEqual(result['intent'], 'SEARCH_AUCTIONS')

    def test_category_list_intent(self):
        result = detect_auction_intent('what categories are available?')
        self.assertIsNotNone(result)
        self.assertEqual(result['intent'], 'GET_CATEGORY_LIST')

    def test_ending_soon_intent(self):
        result = detect_auction_intent('what auctions are ending soon?')
        self.assertIsNotNone(result)
        self.assertEqual(result['intent'], 'GET_ENDING_SOON')

    def test_auction_count_intent(self):
        result = detect_auction_intent('how many live auctions are there?')
        self.assertIsNotNone(result)
        self.assertEqual(result['intent'], 'GET_AUCTION_COUNT')

    def test_details_by_id(self):
        result = detect_auction_intent('show me details of auction #42')
        self.assertIsNotNone(result)
        self.assertEqual(result['intent'], 'GET_AUCTION_DETAILS')
        self.assertEqual(result['auction_id'], 42)

    def test_current_bid_intent(self):
        result = detect_auction_intent('what is the current bid on auction #10')
        self.assertIsNotNone(result)
        self.assertEqual(result['intent'], 'GET_CURRENT_BID')
        self.assertEqual(result['auction_id'], 10)

    def test_time_remaining_intent(self):
        result = detect_auction_intent('how much time is left on auction #5')
        self.assertIsNotNone(result)
        self.assertEqual(result['intent'], 'GET_TIME_REMAINING')
        self.assertEqual(result['auction_id'], 5)

    def test_navigate_by_id(self):
        result = detect_auction_intent('take me to auction #42')
        self.assertIsNotNone(result)
        self.assertEqual(result['intent'], 'NAVIGATE_TO_AUCTION')
        self.assertEqual(result['auction_id'], 42)

    def test_private_data_guard(self):
        result = detect_auction_intent('show me user john bids')
        self.assertIsNotNone(result)
        self.assertEqual(result['intent'], 'PRIVATE_DATA_GUARD')

    def test_category_search(self):
        # Re-invalidate cache to pick up categories from setUpTestData
        invalidate_category_cache()
        result = detect_auction_intent('show me electronics auctions')
        self.assertIsNotNone(result)
        self.assertIn(result['intent'], ['SEARCH_BY_CATEGORY', 'SEARCH_AUCTIONS'])

    def test_no_intent_for_general_question(self):
        result = detect_auction_intent('how do I place a bid?')
        self.assertIsNone(result)

    def test_no_intent_for_short_message(self):
        result = detect_auction_intent('hi')
        self.assertIsNone(result)

    def test_price_extraction_under(self):
        result = detect_auction_intent('show me auctions under 5000')
        self.assertIsNotNone(result)
        self.assertEqual(result.get('max_price'), 5000.0)

    def test_price_extraction_above(self):
        result = detect_auction_intent('find auctions above 10000')
        self.assertIsNotNone(result)
        self.assertEqual(result.get('min_price'), 10000.0)

    def test_who_is_winning_guard(self):
        result = detect_auction_intent('who is the highest bidder on auction 5?')
        self.assertIsNotNone(result)
        self.assertEqual(result['intent'], 'PRIVATE_DATA_GUARD')
