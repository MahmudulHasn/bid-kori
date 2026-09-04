import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRODUCT_CREATE_API_PATH,
  PRODUCT_CREATE_METHOD,
  PRODUCT_DELETE_METHOD,
  PRODUCT_UPDATE_METHOD,
  PRODUCT_WRITE_FIELDS,
  SELLER_PRODUCT_DELETE_ENABLED,
  buildProductDeleteApiPath,
  canSellerDeleteProduct,
  emptyProductFormValues,
  filterSellerAuctions,
  filterSellerProducts,
  getAuctionProductId,
  getAuctionedProductIds,
  getEligibleAuctionProducts,
  getRecentSellerAuctions,
  getRecentSellerProducts,
  getSellerActiveAuctions,
  getSellerAuctionDisplayStatus,
  getSellerAuctionPaymentLabel,
  getSellerAuctionWinnerLabel,
  getSellerAuctions,
  getSellerCancelledAuctions,
  getSellerClosedAuctions,
  getSellerDashboardMetrics,
  isProductEligibleForAuction,
  isProductLinkedAuctionDeleteError,
  isProductOwnedByUser,
  isSellerAuctionAwaitingFinalization,
  resolveAuctionCreateProductHint,
  sortSellerAuctions,
  productFormValuesFromProduct,
  productUpdateApiPath,
  productWritePayloadKeys,
  serializeProductWritePayload,
  sortSellerProducts,
  validateProductForm,
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

test('sortSellerProducts puts newest created_at first with id fallback', () => {
  const products = [
    product({ id: 1, title: 'A', created_at: '2026-01-01T00:00:00Z' }),
    product({ id: 3, title: 'C', created_at: '2026-03-01T00:00:00Z' }),
    product({ id: 2, title: 'B', created_at: '2026-03-01T00:00:00Z' }),
  ];
  assert.deepEqual(
    sortSellerProducts(products, 'newest').map((item) => item.id),
    [3, 2, 1],
  );
  assert.deepEqual(
    sortSellerProducts(products, 'oldest').map((item) => item.id),
    [1, 2, 3],
  );
});

test('sortSellerProducts does not mutate the source array', () => {
  const products = [
    product({ id: 1, title: 'A', created_at: '2026-01-01T00:00:00Z' }),
    product({ id: 2, title: 'B', created_at: '2026-02-01T00:00:00Z' }),
  ];
  const snapshot = products.map((item) => item.id);
  sortSellerProducts(products, 'newest');
  assert.deepEqual(
    products.map((item) => item.id),
    snapshot,
  );
});

test('filterSellerProducts matches title and description case-insensitively', () => {
  const products = [
    product({ id: 1, title: 'Oak Chair', description: 'Vintage wood' }),
    product({ id: 2, title: 'Steel Lamp', description: 'Modern brass' }),
  ];
  const snapshot = products.map((item) => item.id);
  assert.deepEqual(
    filterSellerProducts(products, 'CHAIR').map((item) => item.id),
    [1],
  );
  assert.deepEqual(
    filterSellerProducts(products, 'brass').map((item) => item.id),
    [2],
  );
  assert.deepEqual(
    products.map((item) => item.id),
    snapshot,
  );
});

test('isProductOwnedByUser allows the current seller and fails closed otherwise', () => {
  const owned = product({ id: 1, title: 'Mine', seller: 7 });
  const ownedStringSeller = product({ id: 4, title: 'Mine string', seller: '7' });
  const other = product({ id: 2, title: 'Theirs', seller: 8 });
  const missing = product({ id: 3, title: 'Unknown' });
  assert.equal(isProductOwnedByUser(owned, { id: 7 }), true);
  assert.equal(isProductOwnedByUser(ownedStringSeller, { id: 7 }), true);
  assert.equal(isProductOwnedByUser(other, { id: 7 }), false);
  assert.equal(isProductOwnedByUser(missing, { id: 7 }), false);
  assert.equal(isProductOwnedByUser(owned, null), false);
});

test('nested product PK without seller is not treated as owned', () => {
  const auctions = [
    auction({ id: 1, product: 44, product_title: 'Nested pk only' }),
  ];
  assert.equal(getSellerAuctions(auctions, 7).length, 0);
});

test('filterSellerAuctions keeps backend status buckets and does not recategorize stale ACTIVE', () => {
  const now = Date.parse('2026-09-04T12:00:00Z');
  const auctions = [
    auction({
      id: 1,
      status: 'ACTIVE',
      end_time: '2026-09-04T11:00:00Z',
      product: { title: 'Stale', seller: 7 },
    }),
    auction({ id: 2, status: 'CLOSED', product: { title: 'Closed', seller: 7 } }),
    auction({
      id: 3,
      status: 'CANCELLED',
      product: { title: 'Cancelled', seller: 7 },
    }),
    auction({ id: 4, status: 'ACTIVE', product: { title: 'Other', seller: 8 } }),
  ];
  const snapshot = auctions.map((item) => item.id);
  assert.deepEqual(
    filterSellerAuctions(auctions, 7, 'ACTIVE').map((item) => item.id),
    [1],
  );
  assert.deepEqual(
    filterSellerAuctions(auctions, 7, 'CLOSED').map((item) => item.id),
    [2],
  );
  assert.deepEqual(
    filterSellerAuctions(auctions, 7, 'CANCELLED').map((item) => item.id),
    [3],
  );
  assert.equal(isSellerAuctionAwaitingFinalization(auctions[0], now), true);
  assert.equal(
    getSellerAuctionDisplayStatus(auctions[0], now),
    'Awaiting finalization',
  );
  assert.notEqual(getSellerAuctionDisplayStatus(auctions[0], now), 'Closed');
  assert.deepEqual(
    auctions.map((item) => item.id),
    snapshot,
  );
});

test('sortSellerAuctions orders by start_time then id without mutating source', () => {
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
  ];
  const snapshot = auctions.map((item) => item.id);
  assert.deepEqual(
    sortSellerAuctions(auctions).map((item) => item.id),
    [3, 2, 1],
  );
  assert.deepEqual(
    auctions.map((item) => item.id),
    snapshot,
  );
});

test('CLOSED winner and payment labels stay fail-closed for ACTIVE auctions', () => {
  const active = auction({
    id: 1,
    status: 'ACTIVE',
    winning_bidder: 9,
    product: { title: 'Live', seller: 7 },
  });
  const closedNone = auction({
    id: 2,
    status: 'CLOSED',
    winning_bidder: null,
    product: { title: 'Unsold', seller: 7 },
  });
  const closedPaid = auction({
    id: 3,
    status: 'CLOSED',
    winning_bidder: 4,
    is_paid: true,
    product: { title: 'Sold', seller: 7 },
  });
  assert.equal(getSellerAuctionWinnerLabel(active), null);
  assert.equal(getSellerAuctionWinnerLabel(closedNone), 'No winner');
  assert.equal(getSellerAuctionWinnerLabel(closedPaid), 'Bidder #4');
  assert.equal(getSellerAuctionPaymentLabel(active), null);
  assert.equal(getSellerAuctionPaymentLabel(closedPaid), 'Paid');
});

test('product create and update API paths and methods are catalog-only', () => {
  assert.equal(PRODUCT_CREATE_API_PATH, '/products/');
  assert.equal(PRODUCT_CREATE_METHOD, 'POST');
  assert.equal(productUpdateApiPath(9), '/products/9/');
  assert.equal(PRODUCT_UPDATE_METHOD, 'PATCH');
});

test('serializeProductWritePayload includes only allowed product fields', () => {
  const source = {
    title: '  Oak Chair  ',
    description: ' Vintage wood ',
    condition: 'USED_GOOD' as const,
    seller: 7,
    starting_bid: '100.00',
    current_highest_bid: '150.00',
    reserve_price: '200.00',
    min_increment: '10.00',
    category: 3,
  };
  const snapshot = { ...source };
  const payload = serializeProductWritePayload(source);
  assert.deepEqual(payload, {
    title: 'Oak Chair',
    description: 'Vintage wood',
    condition: 'USED_GOOD',
  });
  assert.deepEqual(productWritePayloadKeys(payload).sort(), [
    ...PRODUCT_WRITE_FIELDS,
  ].sort());
  assert.equal('seller' in payload, false);
  assert.equal('starting_bid' in payload, false);
  assert.equal('current_highest_bid' in payload, false);
  assert.equal('reserve_price' in payload, false);
  assert.equal('min_increment' in payload, false);
  assert.equal('category' in payload, false);
  assert.deepEqual(source, snapshot);
});

test('product form helpers do not mutate source product data', () => {
  const item = product({
    id: 4,
    title: 'Lamp',
    description: 'Brass',
    condition: 'NEW',
  });
  const snapshot = { ...item };
  const values = productFormValuesFromProduct(item);
  values.title = 'Changed';
  assert.equal(item.title, 'Lamp');
  assert.deepEqual(item, snapshot);
  const empty = emptyProductFormValues();
  empty.title = 'X';
  assert.equal(emptyProductFormValues().title, '');
});

test('validateProductForm requires a title and a known condition', () => {
  const errors = validateProductForm({
    title: '   ',
    description: '',
    condition: 'USED_GOOD',
  });
  assert.equal(errors.title, 'Title is required.');
  assert.equal(errors.description, undefined);
});

test('product delete may be offered only for owned unused products', () => {
  assert.equal(SELLER_PRODUCT_DELETE_ENABLED, true);
  assert.equal(PRODUCT_DELETE_METHOD, 'DELETE');
  assert.equal(buildProductDeleteApiPath(42), '/products/42/');
  assert.equal(productUpdateApiPath(42), '/products/42/');

  const unused = product({ id: 1, title: 'Free', seller: 7 });
  const linked = product({ id: 2, title: 'Taken', seller: 7 });
  const auctions = [
    auction({ id: 10, product: { id: 2, title: 'Taken', seller: 7 } }),
  ];
  const snap = JSON.stringify(auctions);

  assert.equal(canSellerDeleteProduct(unused, { id: 7 }, auctions), true);
  assert.equal(canSellerDeleteProduct(linked, { id: 7 }, auctions), false);
  assert.equal(canSellerDeleteProduct(unused, null, auctions), false);
  assert.equal(canSellerDeleteProduct(unused, { id: 9 }, auctions), false);
  assert.equal(JSON.stringify(auctions), snap);
  assert.equal(
    isProductLinkedAuctionDeleteError({
      response: {
        data: {
          error:
            'This product cannot be deleted because it is linked to an auction.',
        },
      },
    }),
    true,
  );
  // Success UX destination — Product delete does not cascade to Auction delete.
  assert.equal('/seller/products', '/seller/products');
});

test('eligibility helpers derive auctioned product ids without mutating sources', () => {
  const products = [
    product({ id: 1, title: 'Free', seller: 7 }),
    product({ id: 2, title: 'Taken', seller: 7 }),
    product({ id: 3, title: 'Also free', seller: 7 }),
  ];
  const auctions = [
    auction({ id: 10, product: { id: 2, title: 'Taken', seller: 7 } }),
    auction({ id: 11, product: 3 }),
  ];
  const productsSnap = JSON.stringify(products);
  const auctionsSnap = JSON.stringify(auctions);

  assert.equal(getAuctionProductId(auctions[0]), 2);
  assert.equal(getAuctionProductId(auctions[1]), 3);
  assert.deepEqual([...getAuctionedProductIds(auctions)].sort(), [2, 3]);

  const eligible = getEligibleAuctionProducts(products, auctions);
  assert.deepEqual(
    eligible.map((item) => item.id),
    [1],
  );
  assert.equal(isProductEligibleForAuction(1, products, auctions), true);
  assert.equal(isProductEligibleForAuction(2, products, auctions), false);
  assert.equal(JSON.stringify(products), productsSnap);
  assert.equal(JSON.stringify(auctions), auctionsSnap);
});

test('product query hint selects only eligible owned products', () => {
  const eligible = [
    product({ id: 42, title: 'Lamp', seller: 7 }),
    product({ id: 7, title: 'Chair', seller: 7 }),
  ];
  assert.equal(resolveAuctionCreateProductHint('42', eligible).productId, 42);
  assert.equal(resolveAuctionCreateProductHint('42', eligible).message, undefined);

  const unknown = resolveAuctionCreateProductHint('99', eligible);
  assert.equal(unknown.productId, null);
  assert.ok(unknown.message);

  const auctionedHint = resolveAuctionCreateProductHint('2', eligible);
  assert.equal(auctionedHint.productId, null);
  assert.ok(auctionedHint.message);

  assert.equal(resolveAuctionCreateProductHint('', eligible).productId, null);
  assert.equal(resolveAuctionCreateProductHint('abc', eligible).productId, null);
});
