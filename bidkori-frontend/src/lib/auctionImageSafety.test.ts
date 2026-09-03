import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUCTION_IMAGE_ACCEPT,
  AUCTION_IMAGE_ALLOWED_MIME_TYPES,
  AUCTION_IMAGE_MAX_BYTES,
  AUCTION_IMAGE_MAX_PER_AUCTION,
  AUCTION_IMAGE_MAX_PER_REQUEST,
  AUCTION_IMAGE_UPLOAD_FIELD,
  AUCTION_IMAGE_UPLOAD_METHOD,
  SELLER_AUCTION_IMAGE_DELETE_BLOCK_REASON,
  SELLER_AUCTION_IMAGE_DELETE_ENABLED,
  SELLER_AUCTION_IMAGE_PRIMARY_BLOCK_REASON,
  SELLER_AUCTION_IMAGE_PRIMARY_ENABLED,
  SELLER_AUCTION_IMAGE_REORDER_BLOCK_REASON,
  SELLER_AUCTION_IMAGE_REORDER_ENABLED,
  SELLER_AUCTION_IMAGE_UPLOAD_ENABLED,
  auctionImageRemainingCapacity,
  buildAuctionImagesFormData,
  buildAuctionImagesUploadApiPath,
  canSellerDeleteAuctionImages,
  canSellerReorderAuctionImages,
  canSellerSetPrimaryAuctionImage,
  canSellerUploadAuctionImages,
  isAuctionImageFreezeError,
  validateAuctionImageSelection,
} from './auctionImageSafety.ts';
import {
  SELLER_AUCTION_DELETE_ENABLED,
  SELLER_AUCTION_EDIT_ENABLED,
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

function fakeFile(
  name: string,
  options: { size?: number; type?: string } = {},
): File {
  const size = options.size ?? 1024;
  const type = options.type ?? 'image/jpeg';
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

test('Seller auction image upload is enabled; delete/reorder/primary stay deferred', () => {
  assert.equal(SELLER_AUCTION_IMAGE_UPLOAD_ENABLED, true);
  assert.equal(SELLER_AUCTION_IMAGE_DELETE_ENABLED, false);
  assert.equal(
    SELLER_AUCTION_IMAGE_DELETE_BLOCK_REASON,
    'IMAGE DELETE DEFERRED — BACKEND GUARD REQUIRED',
  );
  assert.equal(SELLER_AUCTION_IMAGE_REORDER_ENABLED, false);
  assert.equal(
    SELLER_AUCTION_IMAGE_REORDER_BLOCK_REASON,
    'REORDER DEFERRED — BACKEND GUARD REQUIRED',
  );
  assert.equal(SELLER_AUCTION_IMAGE_PRIMARY_ENABLED, false);
  assert.equal(
    SELLER_AUCTION_IMAGE_PRIMARY_BLOCK_REASON,
    'PRIMARY IMAGE DEFERRED — BACKEND GUARD REQUIRED',
  );
  assert.equal(canSellerDeleteAuctionImages(), false);
  assert.equal(canSellerReorderAuctionImages(), false);
  assert.equal(canSellerSetPrimaryAuctionImage(), false);
  assert.equal(SELLER_AUCTION_EDIT_ENABLED, true);
  assert.equal(SELLER_AUCTION_DELETE_ENABLED, false);
});

test('upload contract path remains POST /auctions/<id>/images/', () => {
  assert.equal(AUCTION_IMAGE_UPLOAD_METHOD, 'POST');
  assert.equal(AUCTION_IMAGE_UPLOAD_FIELD, 'images');
  assert.equal(buildAuctionImagesUploadApiPath(42), '/auctions/42/images/');
  assert.equal(AUCTION_IMAGE_MAX_PER_AUCTION, 10);
  assert.equal(AUCTION_IMAGE_MAX_PER_REQUEST, 5);
  assert.equal(AUCTION_IMAGE_MAX_BYTES, 5 * 1024 * 1024);
  assert.ok(AUCTION_IMAGE_ACCEPT.includes('image/jpeg'));
  assert.ok(AUCTION_IMAGE_ACCEPT.includes('image/png'));
  assert.ok(AUCTION_IMAGE_ACCEPT.includes('image/webp'));
  assert.ok(AUCTION_IMAGE_ACCEPT.includes('image/gif'));
  assert.deepEqual([...AUCTION_IMAGE_ALLOWED_MIME_TYPES], [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ]);
});

test('upload UX eligibility mirrors pre-freeze ownership rules', () => {
  const ownedFuture = auction({
    id: 1,
    status: 'ACTIVE',
    start_time: futureStart,
    product: { title: 'Mine', seller: 7 },
    images: [],
  });
  const ownedStarted = auction({
    id: 2,
    status: 'ACTIVE',
    start_time: pastStart,
    product: { title: 'Mine', seller: 7 },
    images: [],
  });
  const closed = auction({
    id: 3,
    status: 'CLOSED',
    start_time: futureStart,
    product: { title: 'Mine', seller: 7 },
    images: [],
  });
  assert.equal(canSellerUploadAuctionImages(ownedFuture, { id: 7 }, nowMs), true);
  assert.equal(canSellerUploadAuctionImages(ownedStarted, { id: 7 }, nowMs), false);
  assert.equal(canSellerUploadAuctionImages(closed, { id: 7 }, nowMs), false);
  assert.equal(canSellerUploadAuctionImages(ownedFuture, { id: 9 }, nowMs), false);
});

test('client image validation enforces request and capacity limits', () => {
  const base = auction({
    id: 1,
    status: 'ACTIVE',
    start_time: futureStart,
    product: { title: 'Mine', seller: 7 },
    images: [
      { id: 1, image: '/a.jpg' },
      { id: 2, image: '/b.jpg' },
      { id: 3, image: '/c.jpg' },
    ],
  });
  assert.equal(auctionImageRemainingCapacity(base), 7);
  assert.equal(validateAuctionImageSelection([], base).ok, false);

  const tooMany = Array.from({ length: 6 }, (_, i) =>
    fakeFile(`f${i}.jpg`),
  );
  assert.equal(validateAuctionImageSelection(tooMany, base).ok, false);

  const nearFull = auction({
    ...base,
    images: Array.from({ length: 9 }, (_, i) => ({
      id: i,
      image: `/${i}.jpg`,
    })),
  });
  assert.equal(
    validateAuctionImageSelection(
      [fakeFile('a.jpg'), fakeFile('b.jpg')],
      nearFull,
    ).ok,
    false,
  );

  assert.equal(
    validateAuctionImageSelection(
      [fakeFile('big.jpg', { size: AUCTION_IMAGE_MAX_BYTES + 1 })],
      base,
    ).ok,
    false,
  );
  assert.equal(
    validateAuctionImageSelection(
      [fakeFile('doc.pdf', { type: 'application/pdf' })],
      base,
    ).ok,
    false,
  );
  assert.equal(
    validateAuctionImageSelection([fakeFile('ok.png', { type: 'image/png' })], base)
      .ok,
    true,
  );
});

test('FormData uses images field and does not mutate source files', () => {
  const files = [fakeFile('a.jpg'), fakeFile('b.png', { type: 'image/png' })];
  const snapshot = [...files];
  const formData = buildAuctionImagesFormData(files);
  assert.deepEqual(files, snapshot);
  assert.equal(formData.getAll(AUCTION_IMAGE_UPLOAD_FIELD).length, 2);
  assert.equal(formData.has('product'), false);
  assert.equal(formData.has('starting_bid'), false);
  assert.equal(formData.has('reserve_price'), false);
  assert.equal(formData.has('image'), false);
});

test('image freeze errors are recognized from backend message', () => {
  assert.equal(
    isAuctionImageFreezeError({
      response: {
        data: {
          error:
            'Images cannot be changed after the auction has started or received bids.',
        },
      },
    }),
    true,
  );
});
