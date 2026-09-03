import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SELLER_AUCTION_CANCEL_ENABLED,
  SELLER_AUCTION_CANCEL_ENDPOINT_METHOD,
  SELLER_AUCTION_CANCEL_STATUS,
  SELLER_AUCTION_DELETE_BLOCK_REASON,
  SELLER_AUCTION_DELETE_ENABLED,
  SELLER_AUCTION_EDIT_BLOCK_REASON,
  SELLER_AUCTION_EDIT_ENABLED,
  SELLER_AUCTION_PRODUCT_REBIND_ENABLED,
  SELLER_AUCTION_RESERVE_EDIT_ENABLED,
  buildAuctionCancelTransitionPayload,
  buildAuctionTransitionApiPath,
  canSellerCancelAuction,
  canSellerDeleteAuction,
  canSellerEditAuction,
} from './auctionManagementSafety.ts';
import type { Auction } from './types.ts';

function auction(partial: Partial<Auction> & Pick<Auction, 'id'>): Auction {
  return {
    current_highest_bid: '100',
    ...partial,
  };
}

test('Seller auction management safety decisions match backend audit', () => {
  assert.equal(SELLER_AUCTION_EDIT_ENABLED, false);
  assert.equal(
    SELLER_AUCTION_EDIT_BLOCK_REASON,
    'EDIT DEFERRED — BACKEND FREEZE/GUARD REQUIRED',
  );
  assert.equal(SELLER_AUCTION_CANCEL_ENABLED, true);
  assert.equal(SELLER_AUCTION_DELETE_ENABLED, false);
  assert.equal(
    SELLER_AUCTION_DELETE_BLOCK_REASON,
    'DELETE DEFERRED — BACKEND INTEGRITY GUARD REQUIRED',
  );
  assert.equal(SELLER_AUCTION_RESERVE_EDIT_ENABLED, false);
  assert.equal(SELLER_AUCTION_PRODUCT_REBIND_ENABLED, false);
});

test('edit and delete helpers stay disabled regardless of ownership/status', () => {
  const ownedActive = auction({
    id: 1,
    status: 'ACTIVE',
    product: { title: 'Mine', seller: 7 },
  });
  assert.equal(canSellerEditAuction(ownedActive, { id: 7 }), false);
  assert.equal(canSellerDeleteAuction(ownedActive, { id: 7 }), false);
});

test('cancel UX eligibility is ownership + ACTIVE only', () => {
  const ownedActive = auction({
    id: 1,
    status: 'ACTIVE',
    product: { title: 'Mine', seller: 7 },
  });
  const ownedClosed = auction({
    id: 2,
    status: 'CLOSED',
    product: { title: 'Mine', seller: 7 },
  });
  const ownedCancelled = auction({
    id: 3,
    status: 'CANCELLED',
    product: { title: 'Mine', seller: 7 },
  });
  const otherActive = auction({
    id: 4,
    status: 'ACTIVE',
    product: { title: 'Theirs', seller: 9 },
  });

  assert.equal(canSellerCancelAuction(ownedActive, { id: 7 }), true);
  assert.equal(canSellerCancelAuction(ownedClosed, { id: 7 }), false);
  assert.equal(canSellerCancelAuction(ownedCancelled, { id: 7 }), false);
  assert.equal(canSellerCancelAuction(otherActive, { id: 7 }), false);
  assert.equal(canSellerCancelAuction(ownedActive, null), false);
  assert.equal(canSellerCancelAuction(null, { id: 7 }), false);
});

test('cancel uses lifecycle transition endpoint, not PATCH status', () => {
  assert.equal(SELLER_AUCTION_CANCEL_ENDPOINT_METHOD, 'POST');
  assert.equal(buildAuctionTransitionApiPath(42), '/auctions/42/transition/');
  assert.deepEqual(buildAuctionCancelTransitionPayload(), {
    status: 'CANCELLED',
  });
  assert.equal(SELLER_AUCTION_CANCEL_STATUS, 'CANCELLED');
});
