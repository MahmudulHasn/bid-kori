import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUCTIONS_LIST_API_PATH,
  buildAuctionDetailApiPath,
  buildCheckoutApiPath,
  isCheckoutAlreadyPaidError,
} from './checkoutApi.ts';
import {
  AUCTION_IMAGE_UPLOAD_FIELD,
  AUCTION_IMAGE_UPLOAD_METHOD,
  buildAuctionImagesUploadApiPath,
} from './auctionImageSafety.ts';
import { AUCTION_UPDATE_METHOD } from './auctionManagementSafety.ts';

test('checkout helper posts to /auctions/<id>/checkout/', () => {
  assert.equal(buildCheckoutApiPath(42), '/auctions/42/checkout/');
  assert.equal(AUCTIONS_LIST_API_PATH, '/auctions/');
});

test('auction detail retrieve path is /auctions/<id>/', () => {
  assert.equal(buildAuctionDetailApiPath(42), '/auctions/42/');
});

test('auction update uses PATCH on /auctions/<id>/ — not PUT', () => {
  assert.equal(AUCTION_UPDATE_METHOD, 'PATCH');
  assert.equal(buildAuctionDetailApiPath(7), '/auctions/7/');
  assert.notEqual(AUCTION_UPDATE_METHOD, 'PUT');
});

test('auction image upload uses POST /auctions/<id>/images/', () => {
  assert.equal(AUCTION_IMAGE_UPLOAD_METHOD, 'POST');
  assert.equal(buildAuctionImagesUploadApiPath(7), '/auctions/7/images/');
  assert.equal(AUCTION_IMAGE_UPLOAD_FIELD, 'images');
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
