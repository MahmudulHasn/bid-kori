import assert from 'node:assert/strict';
import test from 'node:test';

import { getRoleHome } from './authRouting.ts';
import {
  ACTIVE_AUCTIONS_API_PATH,
  LEGACY_PRIMARY_NAV_HREFS,
  MARKETPLACE_ROUTES,
  PUBLIC_NAV_LINKS,
  buildAuctionSearchApiPath,
  buildSearchPageHref,
  isLegacyPrimaryNavHref,
  normalizeSearchQuery,
  sortAuctionsEndingSoon,
} from './marketplace.ts';
import { getAuctionPriceLabel, getAuctionTitle } from './auctionDisplay.ts';
import type { Auction } from './types.ts';

test('marketplace route constants match public IA', () => {
  assert.equal(MARKETPLACE_ROUTES.home, '/');
  assert.equal(MARKETPLACE_ROUTES.auctions, '/auctions');
  assert.equal(MARKETPLACE_ROUTES.search, '/search');
  assert.equal(MARKETPLACE_ROUTES.auctionDetail(42), '/auctions/42');
  assert.equal(ACTIVE_AUCTIONS_API_PATH, '/auctions/active/');
});

test('public navbar marketplace links exclude legacy dashboard/create', () => {
  const hrefs = PUBLIC_NAV_LINKS.map((link) => link.href);
  assert.deepEqual(hrefs, ['/auctions', '/search']);
  assert.equal(
    PUBLIC_NAV_LINKS.some((link) => link.label === 'Marketplace'),
    true,
  );
  for (const legacy of LEGACY_PRIMARY_NAV_HREFS) {
    assert.equal(hrefs.includes(legacy), false);
    assert.equal(isLegacyPrimaryNavHref(legacy), true);
  }
  assert.equal(isLegacyPrimaryNavHref('/auctions'), false);
});

test('role workspace homes remain canonical', () => {
  assert.equal(getRoleHome('BUYER'), '/buyer');
  assert.equal(getRoleHome('SELLER'), '/seller');
  assert.equal(getRoleHome('ADMIN'), '/admin');
});

test('normalizeSearchQuery trims and rejects empty input', () => {
  assert.equal(normalizeSearchQuery('  laptop  '), 'laptop');
  assert.equal(normalizeSearchQuery(''), null);
  assert.equal(normalizeSearchQuery('   '), null);
  assert.equal(normalizeSearchQuery(null), null);
  assert.equal(normalizeSearchQuery(undefined), null);
});

test('buildSearchPageHref encodes query and falls back on empty', () => {
  assert.equal(buildSearchPageHref(''), '/auctions');
  assert.equal(buildSearchPageHref('   '), '/auctions');
  assert.equal(buildSearchPageHref('laptop'), '/search?q=laptop');
  assert.equal(
    buildSearchPageHref('noise & signal'),
    '/search?q=noise%20%26%20signal',
  );
  assert.equal(
    buildSearchPageHref('a/b?c=1'),
    '/search?q=a%2Fb%3Fc%3D1',
  );
});

test('buildAuctionSearchApiPath uses backend search param safely', () => {
  assert.equal(buildAuctionSearchApiPath(''), null);
  assert.equal(buildAuctionSearchApiPath('laptop'), '/auctions/?search=laptop');
  assert.equal(
    buildAuctionSearchApiPath('c++ & rust'),
    '/auctions/?search=c%2B%2B%20%26%20rust',
  );
});

test('sortAuctionsEndingSoon orders by end_time ascending', () => {
  const sorted = sortAuctionsEndingSoon([
    { id: 1, end_time: '2026-09-10T12:00:00Z' },
    { id: 2, end_time: '2026-09-05T12:00:00Z' },
    { id: 3 },
  ]);
  assert.deepEqual(
    sorted.map((item) => item.id),
    [2, 1, 3],
  );
});

test('auction display helpers handle nested and active-list shapes', () => {
  const nested: Auction = {
    id: 1,
    product: { title: 'Nested Phone', seller: 9 },
    starting_bid: '100.00',
    current_highest_bid: '100.00',
    status: 'ACTIVE',
  };
  const activeShape: Auction = {
    id: 2,
    product: 55,
    product_title: 'Active Camera',
    current_highest_bid: '250.00',
    status: 'ACTIVE',
    recent_bids: [],
  };
  const withBids: Auction = {
    id: 3,
    product_title: 'Bid Watch',
    starting_bid: '50.00',
    current_highest_bid: '75.00',
    status: 'ACTIVE',
    recent_bids: [
      {
        id: 10,
        auction: 3,
        amount: '75.00',
      },
    ],
  };

  assert.equal(getAuctionTitle(nested), 'Nested Phone');
  assert.equal(getAuctionTitle(activeShape), 'Active Camera');
  assert.equal(getAuctionPriceLabel(nested).label, 'Starting price');
  assert.equal(getAuctionPriceLabel(activeShape).label, 'Starting price');
  assert.equal(getAuctionPriceLabel(withBids).label, 'Current bid');
  assert.equal(getAuctionPriceLabel({ ...nested, status: 'CANCELLED' }).label, 'Cancelled');
  assert.equal(getAuctionPriceLabel({ ...nested, status: 'CLOSED' }).label, 'Final bid');
});
