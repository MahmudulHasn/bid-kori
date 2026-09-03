import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUCTIONS_LIST_API_PATH,
  buildAuctionDetailApiPath,
  buildCheckoutApiPath,
  isCheckoutAlreadyPaidError,
} from './checkoutApi.ts';

test('checkout helper posts to /auctions/<id>/checkout/', () => {
  assert.equal(buildCheckoutApiPath(42), '/auctions/42/checkout/');
  assert.equal(AUCTIONS_LIST_API_PATH, '/auctions/');
});

test('auction detail retrieve path is /auctions/<id>/', () => {
  assert.equal(buildAuctionDetailApiPath(42), '/auctions/42/');
});

test('auction collection path is used for existing-product create', () => {
  assert.equal(AUCTIONS_LIST_API_PATH, '/auctions/');
});

test('already-paid checkout errors are recognized from Django 400 payloads', () => {
  assert.equal(
    isCheckoutAlreadyPaidError({
      response: {
        status: 400,
        data: { error: 'Payment already completed for this auction.' },
      },
    }),
    true,
  );
  assert.equal(
    isCheckoutAlreadyPaidError({
      response: {
        status: 403,
        data: { error: 'Only the winning bidder can complete checkout.' },
      },
    }),
    false,
  );
});
