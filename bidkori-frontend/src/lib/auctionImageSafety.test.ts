import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUCTION_IMAGE_ACCEPT,
  AUCTION_IMAGE_MAX_BYTES,
  AUCTION_IMAGE_MAX_PER_AUCTION,
  AUCTION_IMAGE_MAX_PER_REQUEST,
  AUCTION_IMAGE_UPLOAD_FIELD,
  AUCTION_IMAGE_UPLOAD_METHOD,
  SELLER_AUCTION_IMAGE_DELETE_BLOCK_REASON,
  SELLER_AUCTION_IMAGE_DELETE_ENABLED,
  SELLER_AUCTION_IMAGE_PRIMARY_ENABLED,
  SELLER_AUCTION_IMAGE_REORDER_ENABLED,
  SELLER_AUCTION_IMAGE_UPLOAD_BLOCK_REASON,
  SELLER_AUCTION_IMAGE_UPLOAD_ENABLED,
  buildAuctionImagesUploadApiPath,
  canSellerDeleteAuctionImages,
  canSellerReorderAuctionImages,
  canSellerSetPrimaryAuctionImage,
  canSellerUploadAuctionImages,
} from './auctionImageSafety.ts';
import {
  SELLER_AUCTION_DELETE_ENABLED,
  SELLER_AUCTION_EDIT_ENABLED,
} from './auctionManagementSafety.ts';

test('Seller auction image safety decisions match backend audit', () => {
  assert.equal(SELLER_AUCTION_IMAGE_UPLOAD_ENABLED, false);
  assert.equal(
    SELLER_AUCTION_IMAGE_UPLOAD_BLOCK_REASON,
    'UPLOAD DEFERRED — BACKEND GUARD REQUIRED',
  );
  assert.equal(SELLER_AUCTION_IMAGE_DELETE_ENABLED, false);
  assert.equal(
    SELLER_AUCTION_IMAGE_DELETE_BLOCK_REASON,
    'IMAGE DELETE DEFERRED — BACKEND GUARD REQUIRED',
  );
  assert.equal(SELLER_AUCTION_IMAGE_REORDER_ENABLED, false);
  assert.equal(SELLER_AUCTION_IMAGE_PRIMARY_ENABLED, false);
  assert.equal(canSellerUploadAuctionImages(), false);
  assert.equal(canSellerDeleteAuctionImages(), false);
  assert.equal(canSellerReorderAuctionImages(), false);
  assert.equal(canSellerSetPrimaryAuctionImage(), false);
});

test('documented upload contract path remains POST /auctions/<id>/images/', () => {
  assert.equal(AUCTION_IMAGE_UPLOAD_METHOD, 'POST');
  assert.equal(AUCTION_IMAGE_UPLOAD_FIELD, 'images');
  assert.equal(buildAuctionImagesUploadApiPath(42), '/auctions/42/images/');
  assert.equal(AUCTION_IMAGE_MAX_PER_AUCTION, 10);
  assert.equal(AUCTION_IMAGE_MAX_PER_REQUEST, 5);
  assert.equal(AUCTION_IMAGE_MAX_BYTES, 5 * 1024 * 1024);
  assert.ok(AUCTION_IMAGE_ACCEPT.includes('image/jpeg'));
  assert.ok(AUCTION_IMAGE_ACCEPT.includes('image/png'));
});

test('image management deferral does not reopen auction edit/delete', () => {
  assert.equal(SELLER_AUCTION_EDIT_ENABLED, false);
  assert.equal(SELLER_AUCTION_DELETE_ENABLED, false);
});
