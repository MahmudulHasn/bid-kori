import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_AUCTION_DANGEROUS_ACTIONS,
  ADMIN_PRODUCT_DANGEROUS_ACTIONS,
  AUCTION_CANCEL_CONFIRM_POINTS,
  AUCTION_HIDE_CONFIRM_POINTS,
  MODERATION_REASON_MAX_LENGTH,
  PRODUCT_HIDE_CONFIRM_POINTS,
  buildAdminAuctionCancelApiPath,
  buildAdminAuctionHideApiPath,
  buildAdminAuctionRestoreApiPath,
  buildAdminProductHideApiPath,
  buildAdminProductRestoreApiPath,
  buildModerationReasonBody,
  canOfferAdminAuctionCancel,
  formatVisibilityLabel,
  getAuctionCancelBlockedReason,
  getAuctionPublicVisibilityState,
  getAuctionVisibilityAction,
  getProductModerationAction,
  normalizeModerationReason,
} from './adminModeration.ts';

test('visibility labels stay independent of lifecycle', () => {
  assert.equal(formatVisibilityLabel(false), 'Visible');
  assert.equal(formatVisibilityLabel(undefined), 'Visible');
  assert.equal(formatVisibilityLabel(true), 'Hidden');
});

test('product action eligibility: visible → hide, hidden → restore', () => {
  assert.equal(getProductModerationAction({ is_hidden: false }), 'hide');
  assert.equal(getProductModerationAction({ is_hidden: true }), 'restore');
  assert.equal(getProductModerationAction({}), 'hide');
});

test('auction visibility action independent of lifecycle', () => {
  assert.equal(getAuctionVisibilityAction({ is_hidden: false }), 'hide');
  assert.equal(getAuctionVisibilityAction({ is_hidden: true }), 'restore');
});

test('auction cancel eligibility: ACTIVE unpaid only', () => {
  assert.equal(
    canOfferAdminAuctionCancel({ status: 'ACTIVE', is_paid: false }),
    true,
  );
  assert.equal(
    canOfferAdminAuctionCancel({ status: 'ACTIVE', is_paid: true }),
    false,
  );
  assert.equal(
    canOfferAdminAuctionCancel({ status: 'CLOSED', is_paid: false }),
    false,
  );
  assert.equal(
    canOfferAdminAuctionCancel({ status: 'CANCELLED', is_paid: false }),
    false,
  );
  assert.equal(getAuctionCancelBlockedReason({ status: 'CLOSED' }), 'closed');
  assert.equal(
    getAuctionCancelBlockedReason({ status: 'CANCELLED' }),
    'cancelled',
  );
  assert.equal(
    getAuctionCancelBlockedReason({ status: 'ACTIVE', is_paid: true }),
    'paid',
  );
});

test('reason body sends only reason when present', () => {
  assert.deepEqual(buildModerationReasonBody('  Policy  '), {
    reason: 'Policy',
  });
  assert.deepEqual(buildModerationReasonBody(''), {});
  assert.deepEqual(buildModerationReasonBody(null), {});
  assert.equal(MODERATION_REASON_MAX_LENGTH, 500);
  assert.equal(
    normalizeModerationReason('x'.repeat(600)).length,
    MODERATION_REASON_MAX_LENGTH,
  );
});

test('confirmation copy includes key safety meanings', () => {
  const productHide = PRODUCT_HIDE_CONFIRM_POINTS.join(' ').toLowerCase();
  assert.match(productHide, /public marketplace/);
  assert.match(productHide, /not be deleted/);

  const auctionHide = AUCTION_HIDE_CONFIRM_POINTS.join(' ').toLowerCase();
  assert.match(auctionHide, /new bids/);
  assert.match(auctionHide, /remain unchanged|history/);

  const auctionCancel = AUCTION_CANCEL_CONFIRM_POINTS.join(' ').toLowerCase();
  assert.match(auctionCancel, /cancelled/);
  assert.match(auctionCancel, /no winner|there will be no winner/);
  assert.match(auctionCancel, /remain for history|bids will remain/);
  assert.match(auctionCancel, /cannot reopen/);
});

test('dangerous admin controls are documented as out of scope', () => {
  assert.ok(ADMIN_PRODUCT_DANGEROUS_ACTIONS.includes('Delete Product'));
  assert.ok(ADMIN_PRODUCT_DANGEROUS_ACTIONS.includes('Edit Product'));
  assert.ok(ADMIN_AUCTION_DANGEROUS_ACTIONS.includes('Delete Auction'));
  assert.ok(ADMIN_AUCTION_DANGEROUS_ACTIONS.includes('Change winner'));
});

test('moderation API paths', () => {
  assert.equal(buildAdminProductHideApiPath(3), '/admin/products/3/hide/');
  assert.equal(
    buildAdminProductRestoreApiPath(3),
    '/admin/products/3/restore/',
  );
  assert.equal(buildAdminAuctionHideApiPath(9), '/admin/auctions/9/hide/');
  assert.equal(
    buildAdminAuctionRestoreApiPath(9),
    '/admin/auctions/9/restore/',
  );
  assert.equal(buildAdminAuctionCancelApiPath(9), '/admin/auctions/9/cancel/');
});

test('public visibility helper distinguishes auction vs product hide', () => {
  assert.equal(
    getAuctionPublicVisibilityState({
      is_hidden: true,
      product: { title: 'A', is_hidden: false },
      status: 'ACTIVE',
    }),
    'hidden_by_auction',
  );
  assert.equal(
    getAuctionPublicVisibilityState({
      is_hidden: false,
      product: { title: 'A', is_hidden: true },
      status: 'ACTIVE',
    }),
    'blocked_by_product',
  );
  assert.equal(
    getAuctionPublicVisibilityState({
      is_hidden: false,
      product: { title: 'A', is_hidden: false },
      status: 'ACTIVE',
    }),
    'publicly_eligible',
  );
  assert.equal(
    getAuctionPublicVisibilityState({
      is_hidden: false,
      product: 12,
      status: 'ACTIVE',
    }),
    'unknown',
  );
});
