import assert from 'node:assert/strict';
import test from 'node:test';

import { getRoleHome } from './authRouting.ts';
import {
  ADMIN_BIDS_GLOBAL_API_PATH,
  ADMIN_BIDS_AUCTION_CATALOG_API_PATH,
  ADMIN_BIDS_PATH,
  ADMIN_BIDS_READONLY_COPY,
  ADMIN_BIDS_READ_METHODS,
  ADMIN_BID_HISTORY_ORDER_HINT,
  adminBidsAllowsInvalidate,
  adminBidsAllowsMutationUi,
  adminBidsPath,
  buildAdminAuctionsApiPath,
  buildAuctionBidHistoryApiPath,
  getAdminBidAuctionContext,
  mapAdminBidsVisibilityHistory,
  parseAdminBidAuctionQuery,
  resolveAdminBidAuctionHint,
  shouldFetchBidHistoryForAuctionCatalog,
} from './adminBids.ts';
import { adminAuctionDetailPath } from './adminAuctions.ts';
import type { Auction, UserBid } from './types.ts';
import {
  ADMIN_BIDS_PATH as NAV_ADMIN_BIDS_PATH,
  WORKSPACE_CONFIGS,
  isNavItemActive,
} from './workspaceNavigation.ts';

test('admin bids uses auction catalog + per-auction history only', () => {
  assert.equal(ADMIN_BIDS_AUCTION_CATALOG_API_PATH, '/auctions/');
  assert.equal(buildAdminAuctionsApiPath(), '/auctions/');
  assert.equal(buildAuctionBidHistoryApiPath(42), '/auctions/42/history/');
  assert.equal(ADMIN_BIDS_GLOBAL_API_PATH, null);
  assert.deepEqual([...ADMIN_BIDS_READ_METHODS], ['GET']);
  assert.equal(shouldFetchBidHistoryForAuctionCatalog(), false);
});

test('admin bids introduces no mutation or invalidate surface', () => {
  assert.equal(adminBidsAllowsMutationUi(), false);
  assert.equal(adminBidsAllowsInvalidate(), false);
  assert.match(ADMIN_BIDS_READONLY_COPY.toLowerCase(), /read-only/);
});

test('admin bids path helpers and auction query parsing', () => {
  assert.equal(ADMIN_BIDS_PATH, '/admin/bids');
  assert.equal(adminBidsPath(), '/admin/bids');
  assert.equal(adminBidsPath(42), '/admin/bids?auction=42');
  assert.equal(parseAdminBidAuctionQuery('42'), 42);
  assert.equal(parseAdminBidAuctionQuery(null), null);
  assert.equal(parseAdminBidAuctionQuery(''), null);
  assert.equal(parseAdminBidAuctionQuery('abc'), null);
  assert.equal(parseAdminBidAuctionQuery('-1'), null);
  assert.equal(parseAdminBidAuctionQuery('0'), null);
  assert.equal(parseAdminBidAuctionQuery('12.5'), null);
});

test('resolveAdminBidAuctionHint selects any catalog auction without ownership gate', () => {
  const auctions: Auction[] = [
    {
      id: 10,
      status: 'ACTIVE',
      current_highest_bid: 100,
      product: { id: 1, title: 'Camera', seller: 99 },
    },
    {
      id: 20,
      status: 'CLOSED',
      current_highest_bid: 200,
      product: { id: 2, title: 'Watch', seller: 7 },
    },
  ];
  const frozen = auctions.map((a) => ({ ...a, product: { ...(a.product as object) } }));

  assert.equal(resolveAdminBidAuctionHint(auctions, null).status, 'none');
  const selected = resolveAdminBidAuctionHint(auctions, 20);
  assert.equal(selected.status, 'selected');
  assert.equal(selected.auction?.id, 20);
  assert.equal(selected.auction?.product && typeof selected.auction.product === 'object'
    ? (selected.auction.product as { seller?: number }).seller
    : null, 7);

  const unknown = resolveAdminBidAuctionHint(auctions, 999);
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.auction, null);
  assert.equal(unknown.auctionId, 999);

  assert.deepEqual(
    auctions.map((a) => a.id),
    frozen.map((a) => a.id),
  );
});

test('bid history mapping preserves fields without mutation actions', () => {
  const bids: UserBid[] = [
    {
      id: 1,
      auction: 10,
      bidder_username: 'alice',
      amount: '50.00',
      timestamp: '2026-01-01T00:00:00Z',
    },
    {
      id: 2,
      auction: 10,
      bidder_username: 'bob',
      amount: '75.00',
      timestamp: '2026-01-02T00:00:00Z',
    },
  ];
  const frozen = bids.map((b) => ({ ...b }));
  const rows = mapAdminBidsVisibilityHistory(bids);
  assert.equal(rows[0]?.bidderUsername, 'alice');
  assert.equal(rows[0]?.id, 1);
  assert.match(rows[0]?.amount ?? '', /^৳/);
  assert.equal(rows[0]?.timestamp, '2026-01-01T00:00:00Z');
  assert.equal(rows[1]?.bidderUsername, 'bob');
  assert.deepEqual(bids, frozen);
  assert.deepEqual(mapAdminBidsVisibilityHistory([]), []);
  for (const row of rows) {
    assert.equal('canDelete' in row, false);
    assert.equal('actions' in row, false);
  }
  assert.match(ADMIN_BID_HISTORY_ORDER_HINT.toLowerCase(), /amount|highest/);
});

test('auction context maps product, seller, status, and deep links', () => {
  const auction: Auction = {
    id: 42,
    status: 'ACTIVE',
    current_highest_bid: '150.00',
    start_time: '2026-01-01T10:00:00Z',
    end_time: '2026-01-02T10:00:00Z',
    product: { id: 5, title: 'Vintage Lens', seller: 3 },
  };
  const context = getAdminBidAuctionContext(auction);
  assert.equal(context.auctionId, 42);
  assert.match(context.title, /Vintage Lens/);
  assert.equal(context.productId, 5);
  assert.match(context.sellerLabel, /3/);
  assert.equal(context.statusLabel, 'Active');
  assert.equal(context.auctionDetailHref, adminAuctionDetailPath(42));
  assert.equal(context.bidsHref, '/admin/bids?auction=42');
});

test('admin Bids navigation enabled; query keeps Bids active', () => {
  const admin = WORKSPACE_CONFIGS.ADMIN;
  const bids = admin.navItems.find((item) => item.id === 'bids');
  assert.equal(bids?.enabled, true);
  assert.equal(bids?.href, ADMIN_BIDS_PATH);
  assert.equal(NAV_ADMIN_BIDS_PATH, ADMIN_BIDS_PATH);

  const home = getRoleHome('ADMIN');
  assert.equal(isNavItemActive('/admin/bids', bids!, home), true);
  assert.equal(isNavItemActive('/admin/bids?auction=42', bids!, home), true);
  assert.equal(
    isNavItemActive('/admin/bids', { href: '/admin', enabled: true }, home),
    false,
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

test('auction detail can deep-link to bid visibility without mutation helpers', () => {
  assert.equal(adminBidsPath(7), '/admin/bids?auction=7');
  assert.equal(adminBidsAllowsMutationUi(), false);
  assert.equal(adminBidsAllowsInvalidate(), false);
});
