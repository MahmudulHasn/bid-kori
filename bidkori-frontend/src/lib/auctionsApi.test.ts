import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUCTIONS_LIST_API_PATH,
  buildAuctionDetailApiPath,
  buildCheckoutApiPath,
  isCheckoutAlreadyPaidError,
} from './checkoutApi.ts';
import {
  AUCTION_DELETE_METHOD,
  AUCTION_UPDATE_METHOD,
  buildAuctionDeleteApiPath,
} from './auctionManagementSafety.ts';
import {
  AUCTION_IMAGE_UPLOAD_FIELD,
  AUCTION_IMAGE_UPLOAD_METHOD,
  buildAuctionImagesUploadApiPath,
} from './auctionImageSafety.ts';

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

test('auction delete uses DELETE on /auctions/<id>/', () => {
  assert.equal(AUCTION_DELETE_METHOD, 'DELETE');
  assert.equal(buildAuctionDeleteApiPath(7), '/auctions/7/');
  assert.equal(buildAuctionDetailApiPath(7), '/auctions/7/');
});

test('auction image upload uses POST /auctions/<id>/images/ and returns image list', () => {
  assert.equal(AUCTION_IMAGE_UPLOAD_METHOD, 'POST');
  assert.equal(buildAuctionImagesUploadApiPath(7), '/auctions/7/images/');
  assert.equal(AUCTION_IMAGE_UPLOAD_FIELD, 'images');
  // uploadAuctionImages is typed as Promise<AuctionImage[]>, not Auction.
  type UploadReturn = Awaited<
    ReturnType<typeof import('./auctionsApi.ts').uploadAuctionImages>
  >;
  type AssertImageList = UploadReturn extends import('./types.ts').AuctionImage[]
    ? true
    : false;
  type AssertNotAuction = UploadReturn extends import('./types.ts').Auction
    ? UploadReturn extends import('./types.ts').AuctionImage[]
      ? true
      : false
    : true;
  const ok: AssertImageList = true;
  const notAuction: AssertNotAuction = true;
  assert.equal(ok, true);
  assert.equal(notAuction, true);
  // Canonical AuctionImage shape (uploaded_at optional in type for serializer variance).
  const sample: import('./types.ts').AuctionImage = {
    id: 1,
    image: '/media/a.jpg',
    uploaded_at: '2026-01-01T00:00:00Z',
  };
  assert.equal(typeof sample.id, 'number');
  assert.equal(typeof sample.image, 'string');
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
