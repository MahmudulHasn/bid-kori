/**
 * Admin Product/Auction visibility + cancel moderation helpers (MOD-F01).
 * Generic catalog edit/delete remains out of scope.
 */

import type { Auction, Product } from './types.ts';

/** Matches backend `MODERATION_REASON_MAX_LENGTH`. */
export const MODERATION_REASON_MAX_LENGTH = 500;

export const PRODUCT_HIDE_CONFIRM_TITLE = 'Hide this Product?';
export const PRODUCT_HIDE_CONFIRM_POINTS = [
  'It will be removed from public marketplace visibility.',
  'Linked Auctions will also stop being publicly discoverable and cannot accept new bids while the Product remains hidden.',
  'The Product, Auctions, Bids, and history will not be deleted.',
] as const;

export const PRODUCT_RESTORE_CONFIRM_TITLE = 'Restore this Product?';
export const PRODUCT_RESTORE_CONFIRM_POINTS = [
  'It may become publicly visible again if its linked Auction is also visible and otherwise eligible for the marketplace.',
  'Restoring the Product does not automatically clear Auction hide state.',
] as const;

export const AUCTION_HIDE_CONFIRM_TITLE = 'Hide this Auction?';
export const AUCTION_HIDE_CONFIRM_POINTS = [
  'It will no longer be publicly visible and will stop accepting new bids while hidden.',
  'Its lifecycle status, existing bids, winner/payment history, and Product will remain unchanged.',
] as const;

export const AUCTION_RESTORE_CONFIRM_TITLE = 'Restore this Auction?';
export const AUCTION_RESTORE_CONFIRM_POINTS = [
  'It may become publicly visible again if its Product is also visible and its lifecycle status allows public display.',
  'Restore does not reopen CLOSED or CANCELLED auctions.',
] as const;

export const AUCTION_CANCEL_CONFIRM_TITLE = 'Cancel this Auction?';
export const AUCTION_CANCEL_CONFIRM_POINTS = [
  'This permanently changes the Auction lifecycle to CANCELLED.',
  'Existing bids will remain for history, but there will be no winner.',
  'This action does not delete the Auction or Product and cannot reopen the Auction.',
] as const;

export const PAID_AUCTION_CANCEL_BLOCKED_COPY =
  'Paid auctions cannot be cancelled through moderation.';

export const CLOSED_AUCTION_CANCEL_BLOCKED_COPY =
  'Closed auctions cannot be cancelled.';

export const CANCELLED_AUCTION_TERMINAL_COPY =
  'This auction is cancelled. Hide and Restore remain available independently.';

export type VisibilityLabel = 'Visible' | 'Hidden';

export function formatVisibilityLabel(isHidden: boolean | undefined): VisibilityLabel {
  return isHidden === true ? 'Hidden' : 'Visible';
}

export function isModerationHidden(isHidden: boolean | undefined): boolean {
  return isHidden === true;
}

export type ProductModerationAction = 'hide' | 'restore';

export function getProductModerationAction(
  product: Pick<Product, 'is_hidden'>,
): ProductModerationAction {
  return isModerationHidden(product.is_hidden) ? 'restore' : 'hide';
}

export type AuctionVisibilityAction = 'hide' | 'restore';

export function getAuctionVisibilityAction(
  auction: Pick<Auction, 'is_hidden'>,
): AuctionVisibilityAction {
  return isModerationHidden(auction.is_hidden) ? 'restore' : 'hide';
}

/**
 * Cancel eligibility from known frontend fields only.
 * Backend still enforces Payment-row / race guards.
 */
export function canOfferAdminAuctionCancel(
  auction: Pick<Auction, 'status' | 'is_paid'>,
): boolean {
  const status = String(auction.status ?? '').toUpperCase();
  if (status !== 'ACTIVE') return false;
  if (auction.is_paid === true) return false;
  return true;
}

export type AuctionCancelBlockedReason = 'closed' | 'cancelled' | 'paid' | null;

export function getAuctionCancelBlockedReason(
  auction: Pick<Auction, 'status' | 'is_paid'>,
): AuctionCancelBlockedReason {
  const status = String(auction.status ?? '').toUpperCase();
  if (status === 'CLOSED') return 'closed';
  if (status === 'CANCELLED') return 'cancelled';
  if (auction.is_paid === true) return 'paid';
  if (status !== 'ACTIVE') return 'closed';
  return null;
}

export function normalizeModerationReason(reason: string | undefined | null): string {
  return String(reason ?? '').trim().slice(0, MODERATION_REASON_MAX_LENGTH);
}

/** Body for hide/cancel — reason only when non-empty after trim. */
export function buildModerationReasonBody(
  reason: string | undefined | null,
): { reason: string } | Record<string, never> {
  const trimmed = normalizeModerationReason(reason);
  if (!trimmed) return {};
  return { reason: trimmed };
}

export type AuctionPublicVisibilityState =
  | 'hidden_by_auction'
  | 'blocked_by_product'
  | 'publicly_eligible'
  | 'unknown';

/**
 * Distinguishes Auction hide vs nested Product hide when Product state is present.
 * Does not invent Product fetches.
 */
export function getAuctionPublicVisibilityState(
  auction: Pick<Auction, 'is_hidden' | 'product' | 'status'>,
): AuctionPublicVisibilityState {
  if (isModerationHidden(auction.is_hidden)) {
    return 'hidden_by_auction';
  }
  const product = auction.product;
  if (product && typeof product === 'object' && 'is_hidden' in product) {
    if (product.is_hidden === true) {
      return 'blocked_by_product';
    }
    return 'publicly_eligible';
  }
  return 'unknown';
}

export function formatAuctionPublicVisibilityNote(
  state: AuctionPublicVisibilityState,
): string | null {
  switch (state) {
    case 'hidden_by_auction':
      return 'Auction itself is Hidden.';
    case 'blocked_by_product':
      return 'Auction visibility flag is Visible, but public eligibility is blocked by a hidden Product.';
    case 'publicly_eligible':
      return 'Auction itself is Visible (subject to lifecycle filtering).';
    case 'unknown':
      return null;
  }
}

/** Admin Product pages: no generic edit/delete; moderation is separate. */
export const ADMIN_PRODUCT_DANGEROUS_ACTIONS = [
  'Edit Product',
  'Delete Product',
  'Change Seller',
  'Change Category',
] as const;

export const ADMIN_AUCTION_DANGEROUS_ACTIONS = [
  'Edit Auction',
  'Delete Auction',
  'Change winner',
  'Edit starting bid',
  'Edit reserve',
] as const;

/** Pure Admin moderation REST path builders (safe for Node test runner). */
export function buildAdminProductHideApiPath(id: string | number): string {
  return `/admin/products/${id}/hide/`;
}

export function buildAdminProductRestoreApiPath(id: string | number): string {
  return `/admin/products/${id}/restore/`;
}

export function buildAdminAuctionHideApiPath(id: string | number): string {
  return `/admin/auctions/${id}/hide/`;
}

export function buildAdminAuctionRestoreApiPath(id: string | number): string {
  return `/admin/auctions/${id}/restore/`;
}

export function buildAdminAuctionCancelApiPath(id: string | number): string {
  return `/admin/auctions/${id}/cancel/`;
}
