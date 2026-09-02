import assert from 'node:assert/strict';
import test from 'node:test';

import { isAuctionOwnedByUser } from './auctionOwnership.ts';

test('isAuctionOwnedByUser requires matching seller and user ids', () => {
  const auction = {
    id: 1,
    product: { title: 'Camera', seller: 7 },
    starting_bid: '10',
    current_highest_bid: '10',
  };

  assert.equal(isAuctionOwnedByUser(auction, { id: 7 }), true);
  assert.equal(isAuctionOwnedByUser(auction, { id: 8 }), false);
});

test('isAuctionOwnedByUser fails closed when user or seller missing', () => {
  const auction = {
    id: 1,
    product: { title: 'Camera' },
    starting_bid: '10',
    current_highest_bid: '10',
  };

  assert.equal(isAuctionOwnedByUser(auction, { id: 7 }), false);
  assert.equal(isAuctionOwnedByUser(auction, null), false);
  assert.equal(isAuctionOwnedByUser(null, { id: 7 }), false);
  assert.equal(
    isAuctionOwnedByUser(
      {
        id: 1,
        product: { title: 'Camera', seller: null },
        starting_bid: '10',
        current_highest_bid: '10',
      },
      { id: 7 },
    ),
    false,
  );
});
