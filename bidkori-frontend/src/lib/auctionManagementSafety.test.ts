import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUCTION_UPDATE_METHOD,
  SELLER_AUCTION_CANCEL_ENABLED,
  SELLER_AUCTION_CANCEL_ENDPOINT_METHOD,
  SELLER_AUCTION_CANCEL_STATUS,
  SELLER_AUCTION_DELETE_BLOCK_REASON,
  SELLER_AUCTION_DELETE_ENABLED,
  SELLER_AUCTION_EDIT_ENABLED,
  SELLER_AUCTION_PRODUCT_REBIND_ENABLED,
  SELLER_AUCTION_RESERVE_EDIT_ENABLED,
  buildAuctionCancelTransitionPayload,
  buildAuctionTransitionApiPath,
  canSellerCancelAuction,
  canSellerDeleteAuction,
  canSellerEditAuction,
  isAuctionConfigurationFreezeError,
  isAuctionPreFreezeByClientClock,
} from './auctionManagementSafety.ts';
import type { Auction } from './types.ts';

function auction(partial: Partial<Auction> & Pick<Auction, 'id'>): Auction {
  return {
    current_highest_bid: '100',
    ...partial,
  };
}

const futureStart = '2099-01-01T12:00:00.000Z';
const pastStart = '2020-01-01T12:00:00.000Z';
const nowMs = Date.parse('2026-09-04T06:00:00.000Z');

test('Seller auction management safety decisions after BE-A02', () => {
  assert.equal(SELLER_AUCTION_EDIT_ENABLED, true);
  assert.equal(SELLER_AUCTION_CANCEL_ENABLED, true);
  assert.equal(SELLER_AUCTION_DELETE_ENABLED, false);
  assert.equal(
    SELLER_AUCTION_DELETE_BLOCK_REASON,
    'DELETE DEFERRED — BACKEND INTEGRITY GUARD REQUIRED',
  );
  assert.equal(SELLER_AUCTION_RESERVE_EDIT_ENABLED, true);
  assert.equal(SELLER_AUCTION_PRODUCT_REBIND_ENABLED, false);
  assert.equal(AUCTION_UPDATE_METHOD, 'PATCH');
});

test('edit eligibility: future ACTIVE owned auction is UX-eligible', () => {
  const owned = auction({
    id: 1,
    status: 'ACTIVE',
    start_time: futureStart,
    product: { title: 'Mine', seller: 7 },
  });
  assert.equal(canSellerEditAuction(owned, { id: 7 }, nowMs), true);
  assert.equal(isAuctionPreFreezeByClientClock(owned, nowMs), true);
});

test('edit eligibility: started ACTIVE is not UX-eligible', () => {
  const owned = auction({
    id: 1,
    status: 'ACTIVE',
    start_time: pastStart,
    product: { title: 'Mine', seller: 7 },
  });
  assert.equal(canSellerEditAuction(owned, { id: 7 }, nowMs), false);
});

test('edit eligibility: CLOSED and CANCELLED are not eligible', () => {
  const closed = auction({
    id: 2,
    status: 'CLOSED',
    start_time: futureStart,
    product: { title: 'Mine', seller: 7 },
  });
  const cancelled = auction({
    id: 3,
    status: 'CANCELLED',
    start_time: futureStart,
    product: { title: 'Mine', seller: 7 },
  });
  assert.equal(canSellerEditAuction(closed, { id: 7 }, nowMs), false);
  assert.equal(canSellerEditAuction(cancelled, { id: 7 }, nowMs), false);
});

test('edit eligibility fails closed without ownership', () => {
  const owned = auction({
    id: 1,
    status: 'ACTIVE',
    start_time: futureStart,
    product: { title: 'Mine', seller: 7 },
  });
  assert.equal(canSellerEditAuction(owned, null, nowMs), false);
  assert.equal(canSellerEditAuction(null, { id: 7 }, nowMs), false);
  assert.equal(canSellerEditAuction(owned, { id: 9 }, nowMs), false);
});

test('delete remains disabled; cancel stays ACTIVE-only', () => {
  const ownedActive = auction({
    id: 1,
    status: 'ACTIVE',
    start_time: pastStart,
    product: { title: 'Mine', seller: 7 },
  });
  assert.equal(canSellerDeleteAuction(ownedActive, { id: 7 }), false);
  assert.equal(canSellerCancelAuction(ownedActive, { id: 7 }), true);
  assert.equal(canSellerEditAuction(ownedActive, { id: 7 }, nowMs), false);
});

test('cancel uses lifecycle transition endpoint, not PATCH status', () => {
  assert.equal(SELLER_AUCTION_CANCEL_ENDPOINT_METHOD, 'POST');
  assert.equal(buildAuctionTransitionApiPath(42), '/auctions/42/transition/');
  assert.deepEqual(buildAuctionCancelTransitionPayload(), {
    status: 'CANCELLED',
  });
  assert.equal(SELLER_AUCTION_CANCEL_STATUS, 'CANCELLED');
});

test('configuration freeze errors are recognized from backend message', () => {
  assert.equal(
    isAuctionConfigurationFreezeError({
      response: {
        data: {
          error:
            'This auction can no longer be edited after it has started or received bids.',
        },
      },
    }),
    true,
  );
  assert.equal(
    isAuctionConfigurationFreezeError({
      response: { data: { error: 'Invalid starting bid.' } },
    }),
    false,
  );
});

test('bid existence is not available on detail — backend remains final authority', () => {
  const owned = auction({
    id: 1,
    status: 'ACTIVE',
    start_time: futureStart,
    product: { title: 'Mine', seller: 7 },
  });
  // UX may still show Edit when bids exist but are unknown client-side.
  assert.equal(canSellerEditAuction(owned, { id: 7 }, nowMs), true);
  assert.equal('bid_count' in owned, false);
});
