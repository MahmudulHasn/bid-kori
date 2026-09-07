import assert from 'node:assert/strict';
import test from 'node:test';

import { getRoleHome } from './authRouting.ts';
import {
  ADMIN_AUCTIONS_PATH,
  ADMIN_AUCTION_READ_METHODS,
  ADMIN_AUCTION_READONLY_COPY,
  adminAuctionAllowsMutationUi,
  adminAuctionDetailIncludesReserve,
  adminAuctionDetailPath,
  buildAdminAuctionsApiPath,
  buildAuctionBidHistoryApiPath,
  formatAdminAuctionFeaturedState,
  formatAdminAuctionPaidState,
  getAdminAuctionProductId,
  getAdminAuctionSellerLabel,
  getAdminWinnerDisplay,
  mapAdminBidHistory,
  sortAdminAuctions,
} from './adminAuctions.ts';
import { adminProductDetailPath } from './adminProducts.ts';
import { AUCTIONS_LIST_API_PATH } from './checkoutApi.ts';
import { buildAuctionDetailApiPath } from './checkoutApi.ts';
import type { Auction, UserBid } from './types.ts';
import {
  ADMIN_AUCTIONS_PATH as NAV_ADMIN_AUCTIONS_PATH,
  WORKSPACE_CONFIGS,
  getWorkspaceAccountPaths,
  isNavItemActive,
} from './workspaceNavigation.ts';

test('admin auction API paths are GET collection/detail/history', () => {
  assert.equal(AUCTIONS_LIST_API_PATH, '/auctions/');
  assert.equal(buildAuctionDetailApiPath(7), '/auctions/7/');
  assert.equal(buildAuctionBidHistoryApiPath(7), '/auctions/7/history/');
  assert.deepEqual([...ADMIN_AUCTION_READ_METHODS], ['GET']);
});

test('admin auction A05 introduces no mutation surface', () => {
  assert.equal(adminAuctionAllowsMutationUi(), false);
  assert.match(ADMIN_AUCTION_READONLY_COPY.toLowerCase(), /read-only/);
  assert.equal(adminAuctionDetailIncludesReserve(), false);
});

test('buildAdminAuctionsApiPath composes status and search correctly', () => {
  assert.equal(buildAdminAuctionsApiPath(), '/auctions/');
  assert.equal(
    buildAdminAuctionsApiPath({ status: 'ACTIVE' }),
    '/auctions/?status=ACTIVE',
  );
  assert.equal(
    buildAdminAuctionsApiPath({ search: '  camera  ' }),
    '/auctions/?search=camera',
  );
  assert.equal(
    buildAdminAuctionsApiPath({ status: 'CLOSED', search: 'vintage' }),
    '/auctions/?status=CLOSED&search=vintage',
  );
  assert.equal(
    buildAdminAuctionsApiPath({ status: 'all', search: '   ' }),
    '/auctions/',
  );
});

test('sortAdminAuctions covers date sorts without mutating source', () => {
  const auctions: Auction[] = [
    {
      id: 2,
      current_highest_bid: 20,
      start_time: '2026-01-02T00:00:00Z',
      end_time: '2026-02-02T00:00:00Z',
      status: 'ACTIVE',
    },
    {
      id: 1,
      current_highest_bid: 10,
      start_time: '2026-01-01T00:00:00Z',
      end_time: '2026-02-01T00:00:00Z',
      status: 'ACTIVE',
    },
  ];
  const frozen = auctions.map((a) => ({ ...a }));
  assert.deepEqual(
    sortAdminAuctions(auctions, 'newest').map((a) => a.id),
    [2, 1],
  );
  assert.deepEqual(
    sortAdminAuctions(auctions, 'oldest').map((a) => a.id),
    [1, 2],
  );
  assert.deepEqual(
    sortAdminAuctions(auctions, 'ending-soon').map((a) => a.id),
    [1, 2],
  );
  assert.deepEqual(
    sortAdminAuctions(auctions, 'starting-soon').map((a) => a.id),
    [1, 2],
  );
  assert.deepEqual(auctions, frozen);
});

test('paid and featured mapping stay read-only labels', () => {
  assert.equal(formatAdminAuctionPaidState(true), 'Paid');
  assert.equal(formatAdminAuctionPaidState(false), 'Unpaid');
  assert.equal(formatAdminAuctionPaidState(undefined), '—');
  assert.equal(formatAdminAuctionFeaturedState(true), 'Yes');
  assert.equal(formatAdminAuctionFeaturedState(false), 'No');
});

test('cross-owner auction context and product link mapping', () => {
  const auction: Auction = {
    id: 9,
    current_highest_bid: 100,
    status: 'ACTIVE',
    product: { id: 55, title: 'Lens', seller: 404 },
  };
  assert.equal(getAdminAuctionProductId(auction), 55);
  assert.equal(getAdminAuctionSellerLabel(auction), 'Seller ID #404');
  assert.equal(adminProductDetailPath(55), '/admin/products/55');
  assert.equal(adminAuctionDetailPath(9), '/admin/auctions/9');
  assert.equal(adminAuctionAllowsMutationUi(), false);
});

test('winner display only for CLOSED; ACTIVE never final-winner', () => {
  assert.equal(
    getAdminWinnerDisplay({
      id: 1,
      current_highest_bid: 1,
      status: 'ACTIVE',
      winning_bidder: 3,
      winning_bidder_username: 'alice',
    }).kind,
    'omit',
  );
  assert.deepEqual(
    getAdminWinnerDisplay({
      id: 1,
      current_highest_bid: 1,
      status: 'CLOSED',
      winning_bidder: null,
    }),
    { kind: 'no_winner', label: 'No winner' },
  );
  const winner = getAdminWinnerDisplay({
    id: 1,
    current_highest_bid: 1,
    status: 'CLOSED',
    winning_bidder: 3,
    winning_bidder_username: 'alice',
  });
  assert.equal(winner.kind, 'winner');
  if (winner.kind === 'winner') {
    assert.equal(winner.label, 'alice');
  }
});

test('bid history mapping exposes bidder/amount without mutation actions', () => {
  const bids: UserBid[] = [
    {
      id: 1,
      auction: 9,
      bidder_username: 'bob',
      amount: '50.00',
      timestamp: '2026-01-01T00:00:00Z',
    },
  ];
  const rows = mapAdminBidHistory(bids);
  assert.equal(rows[0]?.bidderUsername, 'bob');
  assert.match(rows[0]?.amount ?? '', /^৳/);
  assert.equal(adminAuctionAllowsMutationUi(), false);
});

test('admin auctions navigation is enabled with nested active state', () => {
  const admin = WORKSPACE_CONFIGS.ADMIN;
  const auctions = admin.navItems.find((item) => item.id === 'auctions');
  assert.equal(auctions?.enabled, true);
  assert.equal(auctions?.href, '/admin/auctions');
  assert.equal(NAV_ADMIN_AUCTIONS_PATH, ADMIN_AUCTIONS_PATH);

  const home = getRoleHome('ADMIN');
  assert.equal(isNavItemActive('/admin/auctions', auctions!, home), true);
  assert.equal(isNavItemActive('/admin/auctions/12', auctions!, home), true);

  for (const id of [
    'dashboard',
    'users',
    'products',
    'auctions',
    'bids',
    'analytics',
    'profile',
    'settings',
  ]) {
    assert.equal(admin.navItems.find((item) => item.id === id)?.enabled, true);
  }
  for (const id of ['categories', 'reports']) {
    assert.equal(admin.navItems.find((item) => item.id === id)?.enabled, false);
  }
  assert.deepEqual(getWorkspaceAccountPaths('ADMIN'), {
    profile: '/admin/profile',
    settings: '/admin/settings',
  });
});
