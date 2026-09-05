import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_ANALYTICS_API_PATH,
  ADMIN_ANALYTICS_PATH,
  ADMIN_ANALYTICS_READ_METHODS,
  ANALYTICS_ESCALATION_SAMPLE_HINT,
  ANALYTICS_PAGE_VOLUME_HINT,
  BIDDING_VOLUME_HINT,
  BIDDING_VOLUME_LABEL,
  formatAdminPriceGrowth,
  getAdminAnalyticsSummary,
  isAnalyticsRevenueLabel,
  mapAdminAnalyticsCategoryRows,
  mapAdminAnalyticsEscalationRows,
  mapAdminAnalyticsTopBidders,
  normalizeAdminAnalytics,
  type AdminAnalytics,
} from './adminAnalytics.ts';
import { adminAuctionDetailPath } from './adminAuctions.ts';
import { getRoleHome } from './authRouting.ts';
import {
  isNavItemActive,
  WORKSPACE_CONFIGS,
} from './workspaceNavigation.ts';

test('analytics endpoint remains staff GET /auctions/analytics/', () => {
  assert.equal(ADMIN_ANALYTICS_API_PATH, '/auctions/analytics/');
  assert.deepEqual([...ADMIN_ANALYTICS_READ_METHODS], ['GET']);
  assert.equal(ADMIN_ANALYTICS_PATH, '/admin/analytics');
  assert.doesNotMatch(ADMIN_ANALYTICS_API_PATH, /html|dashboard|template/i);
});

test('summary metrics map authoritative analytics fields', () => {
  const analytics: AdminAnalytics = {
    total_active_auctions: 4,
    total_bids_placed: 18,
    total_bidding_volume: '1200.00',
    category_breakdown: [
      {
        category: 'Art',
        avg_starting_price: '10',
        avg_highest_bid: '20',
        avg_price_growth: '10',
        auction_count: 1,
      },
      {
        category: 'Tech',
        avg_starting_price: '100',
        avg_highest_bid: '200',
        avg_price_growth: '100',
        auction_count: 2,
      },
    ],
    bid_escalation_history: [],
    top_active_bidders: [],
  };
  const summary = getAdminAnalyticsSummary(analytics);
  assert.equal(summary.activeAuctions, analytics.total_active_auctions);
  assert.equal(summary.totalBidsPlaced, analytics.total_bids_placed);
  assert.equal(summary.biddingVolume, analytics.total_bidding_volume);
  assert.equal(summary.categoriesRepresented, 2);
  assert.equal(summary.categoriesRepresented, analytics.category_breakdown.length);
});

test('bidding volume label stays honest — no Revenue/GMV', () => {
  assert.equal(BIDDING_VOLUME_LABEL, 'Total Bidding Volume');
  assert.equal(isAnalyticsRevenueLabel(BIDDING_VOLUME_LABEL), false);
  assert.equal(isAnalyticsRevenueLabel('Revenue'), true);
  assert.equal(isAnalyticsRevenueLabel('GMV'), true);
  assert.match(ANALYTICS_PAGE_VOLUME_HINT.toLowerCase(), /not platform revenue/);
  assert.match(BIDDING_VOLUME_HINT.toLowerCase(), /not revenue/);
  assert.doesNotMatch(BIDDING_VOLUME_LABEL, /revenue|gmv|sales/i);
});

test('category breakdown maps real fields; growth is money not percent', () => {
  const rows = mapAdminAnalyticsCategoryRows([
    {
      category: 'Electronics',
      avg_starting_price: '100.00',
      avg_highest_bid: '250.00',
      avg_price_growth: '150.00',
      auction_count: 3,
    },
  ]);
  assert.equal(rows[0]?.category, 'Electronics');
  assert.equal(rows[0]?.auctionCount, 3);
  assert.match(rows[0]?.avgStartingPrice ?? '', /^৳/);
  assert.match(rows[0]?.avgHighestBid ?? '', /^৳/);
  assert.match(rows[0]?.avgPriceGrowth ?? '', /^৳/);
  assert.doesNotMatch(rows[0]?.avgPriceGrowth ?? '', /%/);
  assert.equal(formatAdminPriceGrowth('42.50'), formatAdminPriceGrowth(42.5));
  assert.doesNotMatch(formatAdminPriceGrowth('12.00'), /%/);
  assert.deepEqual(mapAdminAnalyticsCategoryRows([]), []);
});

test('top active bidders map username/count/amount without user routes', () => {
  const rows = mapAdminAnalyticsTopBidders([
    { username: 'alice', bid_count: 9, total_bid_amount: '500.00' },
    { username: '', bid_count: 1, total_bid_amount: '10' },
  ]);
  assert.equal(rows[0]?.username, 'alice');
  assert.equal(rows[0]?.bidCount, 9);
  assert.match(rows[0]?.totalBidAmount ?? '', /^৳/);
  assert.equal(rows[1]?.username, 'Unknown');
  assert.deepEqual(mapAdminAnalyticsTopBidders([]), []);
  for (const row of rows) {
    assert.equal('href' in row, false);
    assert.doesNotMatch(JSON.stringify(row), /\/admin\/users/);
  }
});

test('bid escalation maps auction deep links and sample semantics', () => {
  const source = [
    {
      bid_id: 1,
      auction_id: 7,
      amount: '10.00',
      timestamp: '2026-01-01T00:00:00Z',
      bidder_username: 'a',
    },
    {
      bid_id: 2,
      auction_id: 8,
      amount: '20.00',
      timestamp: '2026-01-02T00:00:00Z',
      bidder_username: 'b',
    },
  ];
  const frozen = source.map((r) => ({ ...r }));
  const rows = mapAdminAnalyticsEscalationRows(source);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.bidId, 2);
  assert.equal(rows[0]?.auctionId, 8);
  assert.equal(rows[0]?.bidderUsername, 'b');
  assert.match(rows[0]?.amount ?? '', /^৳/);
  assert.equal(rows[0]?.timestamp, '2026-01-02T00:00:00Z');
  assert.equal(adminAuctionDetailPath(rows[0]!.auctionId), '/admin/auctions/8');
  assert.deepEqual(source, frozen);
  assert.match(ANALYTICS_ESCALATION_SAMPLE_HINT.toLowerCase(), /sample|100/);
  assert.doesNotMatch(ANALYTICS_ESCALATION_SAMPLE_HINT, /all bids|complete ledger/i);
  assert.deepEqual(mapAdminAnalyticsEscalationRows([]), []);
  for (const row of rows) {
    assert.equal('actions' in row, false);
    assert.equal('canDelete' in row, false);
  }
});

test('normalizeAdminAnalytics tolerates empty collections', () => {
  const empty = normalizeAdminAnalytics({
    total_active_auctions: 0,
    total_bids_placed: 0,
    total_bidding_volume: '0.00',
    category_breakdown: [],
    bid_escalation_history: [],
    top_active_bidders: [],
  });
  assert.deepEqual(empty.category_breakdown, []);
  assert.deepEqual(empty.top_active_bidders, []);
  assert.deepEqual(empty.bid_escalation_history, []);
  assert.equal(getAdminAnalyticsSummary(empty).categoriesRepresented, 0);
});

test('admin Analytics nav enabled; management routes stay disabled', () => {
  const admin = WORKSPACE_CONFIGS.ADMIN;
  const analytics = admin.navItems.find((item) => item.id === 'analytics');
  assert.equal(analytics?.enabled, true);
  assert.equal(analytics?.href, ADMIN_ANALYTICS_PATH);

  const home = getRoleHome('ADMIN');
  assert.equal(isNavItemActive('/admin/analytics', analytics!, home), true);
  assert.equal(
    isNavItemActive('/admin/analytics', { href: '/admin', enabled: true }, home),
    false,
  );
  assert.equal(
    isNavItemActive('/admin', { href: '/admin', enabled: true }, home),
    true,
  );

  for (const id of [
    'dashboard',
    'products',
    'auctions',
    'bids',
    'analytics',
    'profile',
    'settings',
  ]) {
    assert.equal(admin.navItems.find((item) => item.id === id)?.enabled, true);
  }
  for (const id of ['users', 'categories', 'reports']) {
    assert.equal(admin.navItems.find((item) => item.id === id)?.enabled, false);
  }
});
