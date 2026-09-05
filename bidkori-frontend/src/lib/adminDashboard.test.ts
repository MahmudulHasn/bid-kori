import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_ANALYTICS_API_PATH,
  BIDDING_VOLUME_HINT,
  BIDDING_VOLUME_LABEL,
  normalizeAdminAnalytics,
  type AdminAnalytics,
} from './adminAnalytics.ts';
import {
  buildAdminDashboardMetrics,
  formatAdminMoney,
  getAdminCatalogMetrics,
  isRevenueLabel,
  mapCategorySnapshot,
  mapRecentBidActivity,
  mapTopActiveBidders,
} from './adminDashboard.ts';
import type { Auction, Product } from './types.ts';
import { WORKSPACE_CONFIGS, getWorkspaceAccountPaths } from './workspaceNavigation.ts';

test('admin analytics endpoint path is staff auctions analytics', () => {
  assert.equal(ADMIN_ANALYTICS_API_PATH, '/auctions/analytics/');
});

test('normalizeAdminAnalytics maps staff response fields', () => {
  const normalized = normalizeAdminAnalytics({
    total_active_auctions: 3,
    total_bids_placed: 12,
    total_bidding_volume: '1500.50',
    category_breakdown: [
      {
        category: 'Electronics',
        avg_starting_price: '100.00',
        avg_highest_bid: '250.00',
        avg_price_growth: '150.00',
        auction_count: 2,
      },
    ],
    bid_escalation_history: [
      {
        bid_id: 1,
        auction_id: 9,
        amount: '50.00',
        timestamp: '2026-01-01T00:00:00Z',
        bidder_username: 'alice',
      },
    ],
    top_active_bidders: [
      {
        username: 'alice',
        bid_count: 4,
        total_bid_amount: '200.00',
      },
    ],
  });

  assert.equal(normalized.total_active_auctions, 3);
  assert.equal(normalized.total_bids_placed, 12);
  assert.equal(normalized.total_bidding_volume, '1500.50');
  assert.equal(normalized.category_breakdown[0]?.category, 'Electronics');
  assert.equal(normalized.bid_escalation_history[0]?.bidder_username, 'alice');
  assert.equal(normalized.top_active_bidders[0]?.bid_count, 4);
});

test('bidding volume label is not Revenue/GMV/Sales', () => {
  assert.equal(isRevenueLabel(BIDDING_VOLUME_LABEL), false);
  assert.equal(isRevenueLabel('Revenue'), true);
  assert.equal(isRevenueLabel('GMV'), true);
  assert.equal(isRevenueLabel('Sales'), true);
  assert.match(BIDDING_VOLUME_HINT.toLowerCase(), /not revenue/);
  assert.equal(BIDDING_VOLUME_LABEL, 'Total Bidding Volume');
});

test('active auctions and total bids use authoritative analytics fields', () => {
  const analytics: AdminAnalytics = {
    total_active_auctions: 7,
    total_bids_placed: 42,
    total_bidding_volume: '999.00',
    category_breakdown: [],
    bid_escalation_history: [],
    top_active_bidders: [],
  };
  const products: Product[] = [{ id: 1, title: 'A' }];
  const auctions: Auction[] = [
    { id: 1, current_highest_bid: 10, status: 'ACTIVE' },
    { id: 2, current_highest_bid: 20, status: 'ACTIVE' },
  ];

  const metrics = buildAdminDashboardMetrics({ analytics, products, auctions });
  assert.equal(metrics.activeAuctions, 7);
  assert.equal(metrics.totalBids, 42);
  assert.notEqual(metrics.activeAuctions, auctions.length);
});

test('total products and auctions derive from catalog collections', () => {
  const products: Product[] = [
    { id: 1, title: 'A' },
    { id: 2, title: 'B' },
    { id: 3, title: 'C' },
  ];
  const auctions: Auction[] = [
    { id: 10, current_highest_bid: 1, status: 'ACTIVE' },
    { id: 11, current_highest_bid: 2, status: 'CLOSED' },
  ];
  const catalog = getAdminCatalogMetrics(products, auctions);
  assert.equal(catalog.totalProducts, 3);
  assert.equal(catalog.totalAuctions, 2);
});

test('paid count uses is_paid === true only', () => {
  const auctions: Auction[] = [
    { id: 1, current_highest_bid: 1, status: 'CLOSED', is_paid: true },
    { id: 2, current_highest_bid: 2, status: 'CLOSED', is_paid: false },
    { id: 3, current_highest_bid: 3, status: 'CLOSED' },
    { id: 4, current_highest_bid: 4, status: 'ACTIVE', is_paid: true },
  ];
  const catalog = getAdminCatalogMetrics([], auctions);
  assert.equal(catalog.paidAuctions, 2);
});

test('ACTIVE/CLOSED/CANCELLED counting and empty catalogs', () => {
  assert.deepEqual(getAdminCatalogMetrics([], []), {
    totalProducts: 0,
    totalAuctions: 0,
    closedAuctions: 0,
    cancelledAuctions: 0,
    paidAuctions: 0,
  });

  const auctions: Auction[] = [
    { id: 1, current_highest_bid: 1, status: 'ACTIVE' },
    { id: 2, current_highest_bid: 2, status: 'closed' },
    { id: 3, current_highest_bid: 3, status: 'CANCELLED' },
    { id: 4, current_highest_bid: 4, status: 'cancelled' },
  ];
  const catalog = getAdminCatalogMetrics([{ id: 1, title: 'P' }], auctions);
  assert.equal(catalog.closedAuctions, 1);
  assert.equal(catalog.cancelledAuctions, 2);
  assert.equal(catalog.totalAuctions, 4);
  assert.equal(catalog.totalProducts, 1);
});

test('catalog helpers do not mutate source arrays', () => {
  const products: Product[] = [{ id: 1, title: 'A' }];
  const auctions: Auction[] = [
    { id: 1, current_highest_bid: 1, status: 'ACTIVE' },
  ];
  const productsCopy = products.slice();
  const auctionsCopy = auctions.slice();
  getAdminCatalogMetrics(products, auctions);
  assert.deepEqual(products, productsCopy);
  assert.deepEqual(auctions, auctionsCopy);
});

test('formatAdminMoney preserves decimal money formatting', () => {
  const formatted = formatAdminMoney('1500.50');
  assert.match(formatted, /^৳/);
  assert.match(formatted, /1[,.]?500/);
  assert.match(formatted, /50/);
  assert.equal(formatAdminMoney(null), '—');
});

test('category snapshot and top bidder mapping', () => {
  const categories = mapCategorySnapshot([
    {
      category: 'Art',
      avg_starting_price: '10.00',
      avg_highest_bid: '40.00',
      avg_price_growth: '30.00',
      auction_count: 5,
    },
  ]);
  assert.equal(categories[0]?.category, 'Art');
  assert.equal(categories[0]?.auctionCount, 5);
  assert.match(categories[0]?.avgStartingPrice ?? '', /^৳/);

  const top = mapTopActiveBidders([
    { username: 'bob', bid_count: 3, total_bid_amount: '99.00' },
  ]);
  assert.equal(top[0]?.username, 'bob');
  assert.equal(top[0]?.bidCount, 3);
  assert.match(top[0]?.totalBidAmount ?? '', /^৳/);
});

test('recent bid activity reverses chronological sample without mutating', () => {
  const rows = [
    {
      bid_id: 1,
      auction_id: 1,
      amount: '10',
      timestamp: '2026-01-01T00:00:00Z',
      bidder_username: 'a',
    },
    {
      bid_id: 2,
      auction_id: 1,
      amount: '20',
      timestamp: '2026-01-02T00:00:00Z',
      bidder_username: 'b',
    },
  ];
  const frozen = rows.map((r) => ({ ...r }));
  const recent = mapRecentBidActivity(rows, 1);
  assert.equal(recent.length, 1);
  assert.equal(recent[0]?.bidId, 2);
  assert.deepEqual(rows, frozen);
});

test('partial failure leaves catalog metrics when analytics missing', () => {
  const metrics = buildAdminDashboardMetrics({
    analytics: null,
    products: [{ id: 1, title: 'A' }],
    auctions: [
      { id: 1, current_highest_bid: 1, status: 'CLOSED', is_paid: true },
    ],
  });
  assert.equal(metrics.activeAuctions, null);
  assert.equal(metrics.totalBids, null);
  assert.equal(metrics.biddingVolume, null);
  assert.equal(metrics.totalProducts, 1);
  assert.equal(metrics.totalAuctions, 1);
  assert.equal(metrics.paidAuctions, 1);
});

test('admin dashboard keeps management nav disabled; products/auctions/analytics/profile/settings enabled', () => {
  const admin = WORKSPACE_CONFIGS.ADMIN;
  const dashboard = admin.navItems.find((item) => item.id === 'dashboard');
  assert.equal(dashboard?.enabled, true);
  assert.equal(dashboard?.href, '/admin');

  for (const id of ['users', 'categories', 'reports']) {
    const item = admin.navItems.find((nav) => nav.id === id);
    assert.ok(item, id);
    assert.equal(item?.enabled, false);
  }

  const products = admin.navItems.find((item) => item.id === 'products');
  const auctions = admin.navItems.find((item) => item.id === 'auctions');
  const bids = admin.navItems.find((item) => item.id === 'bids');
  const analytics = admin.navItems.find((item) => item.id === 'analytics');
  const profile = admin.navItems.find((item) => item.id === 'profile');
  const settings = admin.navItems.find((item) => item.id === 'settings');
  assert.equal(products?.enabled, true);
  assert.equal(products?.href, '/admin/products');
  assert.equal(auctions?.enabled, true);
  assert.equal(auctions?.href, '/admin/auctions');
  assert.equal(bids?.enabled, true);
  assert.equal(bids?.href, '/admin/bids');
  assert.equal(analytics?.enabled, true);
  assert.equal(analytics?.href, '/admin/analytics');
  assert.equal(profile?.enabled, true);
  assert.equal(settings?.enabled, true);
  assert.deepEqual(getWorkspaceAccountPaths('ADMIN'), {
    profile: '/admin/profile',
    settings: '/admin/settings',
  });
});
