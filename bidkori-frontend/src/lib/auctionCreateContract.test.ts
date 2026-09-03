import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUCTION_CREATE_API_PATH,
  SELLER_AUCTION_CREATE_BLOCK_REASON,
  SELLER_AUCTION_CREATE_FROM_EXISTING_PRODUCT_SUPPORTED,
  SELLER_AUCTION_CREATE_PATH,
  isSellerAuctionCreateRouteEnabled,
  serializeExistingProductAuctionCreate,
} from './auctionCreateContract.ts';
import { WORKSPACE_CONFIGS } from './workspaceNavigation.ts';

test('CASE B: existing Product auction create is not supported by current API contract', () => {
  assert.equal(SELLER_AUCTION_CREATE_FROM_EXISTING_PRODUCT_SUPPORTED, false);
  assert.equal(
    SELLER_AUCTION_CREATE_BLOCK_REASON,
    'AUCTION CREATE BLOCKED — BACKEND CONTRACT EXTENSION REQUIRED',
  );
  assert.equal(isSellerAuctionCreateRouteEnabled(), false);
});

test('CASE B: desired Seller create path is reserved but not navigable yet', () => {
  assert.equal(SELLER_AUCTION_CREATE_PATH, '/seller/auctions/create');
  assert.equal(AUCTION_CREATE_API_PATH, '/auctions/');
  const sellerAuctions = WORKSPACE_CONFIGS.SELLER.navItems.find(
    (item) => item.id === 'auctions',
  );
  assert.equal(sellerAuctions?.enabled, true);
  assert.equal(sellerAuctions?.href, '/seller/auctions');
  // Create is nested under list; list remains the only enabled Auctions href.
  assert.notEqual(sellerAuctions?.href, SELLER_AUCTION_CREATE_PATH);
});

test('CASE B: existing-product payload serializer refuses to invent a create body', () => {
  const input = {
    productId: 42,
    starting_bid: '100.00',
    min_increment: '10.00',
    reserve_price: '200.00',
    start_time: '2026-09-04T12:00:00.000Z',
    end_time: '2026-09-05T12:00:00.000Z',
  };
  const snapshot = { ...input };
  assert.equal(serializeExistingProductAuctionCreate(input), null);
  assert.deepEqual(input, snapshot);
});
