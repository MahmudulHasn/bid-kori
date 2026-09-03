import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getRecentSellerAuctions,
  getRecentSellerProducts,
  getSellerActiveAuctions,
  getSellerAuctions,
  getSellerCancelledAuctions,
  getSellerClosedAuctions,
  getSellerDashboardMetrics,
  isSellerAuctionAwaitingFinalization,
} from './seller.ts';
import type { Auction, Product } from './types.ts';

function auction(partial: Partial<Auction> & Pick<Auction, 'id'>): Auction {
  return {
    current_highest_bid: '100',
    ...partial,
  };
}

function product(partial: Partial<Product> & Pick<Product, 'id' | 'title'>): Product {
  return {
    ...partial,
  };
}

test('only auctions owned by the current seller are returned', () => {
  const auctions = [
    auction({ id: 1, product: { title: 'Mine', seller: 7 } }),
    auction({ id: 2, product: { title: 'Theirs', seller: 8 } }),
    auction({ id: 3, product: { title: 'Also mine', seller: '7' } }),
  ];
  const owned = getSellerAuctions(auctions, 7);
  assert.deepEqual(
    owned.map((item) => item.id),
    [1, 3],
  );
});

test('other seller auctions are excluded even if status is ACTIVE', () => {
  const auctions = [
    auction({
      id: 1,
      status: 'ACTIVE',
      product: { title: 'Other', seller: 99 },
    }),
  ];
  assert.equal(getSellerAuctions(auctions, 7).length, 0);
  assert.equal(getSellerActiveAuctions(auctions, 7).length, 0);
});

test('ACTIVE owned auctions are counted from API status', () => {
  const auctions = [
    auction({ id: 1, status: 'ACTIVE', product: { title: 'A', seller: 7 } }),
    auction({ id: 2, status: 'CLOSED', product: { title: 'B', seller: 7 } }),
    auction({ id: 3, status: 'ACTIVE', product: { title: 'C', seller: 7 } }),
  ];
  assert.deepEqual(
    getSellerActiveAuctions(auctions, 7).map((item) => item.id),
    [1, 3],
  );
});

test('CLOSED owned auctions are counted from API status', () => {
  const auctions = [
    auction({ id: 1, status: 'CLOSED', product: { title: 'A', seller: 7 } }),
    auction({ id: 2, status: 'ACTIVE', product: { title: 'B', seller: 7 } }),
    auction({ id: 3, status: 'CANCELLED', product: { title: 'C', seller: 7 } }),
  ];
  assert.deepEqual(
    getSellerClosedAuctions(auctions, 7).map((item) => item.id),
    [1],
  );
});

test('CANCELLED auctions are excluded from Closed count', () => {
  const auctions = [
    auction({ id: 1, status: 'CANCELLED', product: { title: 'A', seller: 7 } }),
    auction({ id: 2, status: 'closed', product: { title: 'B', seller: 7 } }),
  ];
  assert.equal(getSellerClosedAuctions(auctions, 7).length, 1);
  assert.equal(getSellerCancelledAuctions(auctions, 7).length, 1);
});

test('products count is based on my-listings data', () => {
  const products = [
    product({ id: 1, title: 'Lamp' }),
    product({ id: 2, title: 'Chair' }),
  ];
  const metrics = getSellerDashboardMetrics(products, [], 7);
  assert.equal(metrics.products, 2);
  assert.equal(metrics.auctions, 0);
});

test('stale ACTIVE is not converted to CLOSED for metrics', () => {
  const now = Date.parse('2026-09-04T12:00:00Z');
  const auctions = [
    auction({
      id: 1,
      status: 'ACTIVE',
      end_time: '2026-09-04T11:00:00Z',
      product: { title: 'Stale', seller: 7 },
    }),
  ];
  assert.equal(getSellerActiveAuctions(auctions, 7).length, 1);
  assert.equal(getSellerClosedAuctions(auctions, 7).length, 0);
  assert.equal(isSellerAuctionAwaitingFinalization(auctions[0], now), true);
});

test('recent seller auctions order by start_time then id, without mutating source', () => {
  const auctions = [
    auction({
      id: 1,
      start_time: '2026-01-01T00:00:00Z',
      product: { title: 'Old', seller: 7 },
    }),
    auction({
      id: 3,
      start_time: '2026-03-01T00:00:00Z',
      product: { title: 'New A', seller: 7 },
    }),
    auction({
      id: 2,
      start_time: '2026-03-01T00:00:00Z',
      product: { title: 'New B', seller: 7 },
    }),
    auction({
      id: 9,
      start_time: '2026-04-01T00:00:00Z',
      product: { title: 'Other', seller: 8 },
    }),
  ];
  const snapshot = auctions.map((item) => item.id);
  const recent = getRecentSellerAuctions(auctions, 7, 3);
  assert.deepEqual(
    recent.map((item) => item.id),
    [3, 2, 1],
  );
  assert.deepEqual(
    auctions.map((item) => item.id),
    snapshot,
  );
});

test('recent seller products order by created_at then id, without mutating source', () => {
  const products = [
    product({ id: 1, title: 'A', created_at: '2026-01-01T00:00:00Z' }),
    product({ id: 3, title: 'C', created_at: '2026-03-01T00:00:00Z' }),
    product({ id: 2, title: 'B', created_at: '2026-03-01T00:00:00Z' }),
  ];
  const snapshot = products.map((item) => item.id);
  const recent = getRecentSellerProducts(products, 2);
  assert.deepEqual(
    recent.map((item) => item.id),
    [3, 2],
  );
  assert.deepEqual(
    products.map((item) => item.id),
    snapshot,
  );
});

test('nested product PK without seller is not treated as owned', () => {
  const auctions = [
    auction({ id: 1, product: 44, product_title: 'Nested pk only' }),
  ];
  assert.equal(getSellerAuctions(auctions, 7).length, 0);
});
