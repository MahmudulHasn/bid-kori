/**
 * Seller Auction management safety gates (S06).
 *
 * Decisions are derived from CURRENT backend behavior (read-only audit):
 *
 * EDIT — AuctionSerializer PATCH allows starting_bid / min_increment /
 * reserve_price / start_time / end_time with NO freeze after start or bids.
 * Product rebinding is create-only, but economic mutation remains unsafe.
 *
 * CANCEL — POST /auctions/<id>/transition/ { status: CANCELLED } goes through
 * AuctionLifecycleService.cancel_auction (ACTIVE only; clears winner).
 *
 * DELETE — ModelViewSet.destroy allowed for product seller; Bid/Image/Payment
 * cascade. No history integrity guard.
 */

import { isAuctionOwnedByUser } from './auctionOwnership.ts';
import type { AuthUser, Auction } from './types.ts';

/** Backend does not freeze live economics — do not ship Seller Edit UI. */
export const SELLER_AUCTION_EDIT_ENABLED = false;

/**
 * Cancel is lifecycle-backed and status-gated (ACTIVE → CANCELLED only).
 * Ownership: IsAuctionSellerOrReadOnly (product.seller).
 */
export const SELLER_AUCTION_CANCEL_ENABLED = true;

/** DELETE cascades bid/payment history — never expose from Seller UI. */
export const SELLER_AUCTION_DELETE_ENABLED = false;

/**
 * Reserve is write-only on read payloads and Edit is deferred entirely.
 * Do not invent a reserve overwrite control without a visible current value.
 */
export const SELLER_AUCTION_RESERVE_EDIT_ENABLED = false;

/** Product binding is create-only; Edit must never rebind product. */
export const SELLER_AUCTION_PRODUCT_REBIND_ENABLED = false;

export const SELLER_AUCTION_EDIT_BLOCK_REASON =
  'EDIT DEFERRED — BACKEND FREEZE/GUARD REQUIRED';

export const SELLER_AUCTION_DELETE_BLOCK_REASON =
  'DELETE DEFERRED — BACKEND INTEGRITY GUARD REQUIRED';

export const SELLER_AUCTION_CANCEL_ENDPOINT_METHOD = 'POST';
export const SELLER_AUCTION_CANCEL_STATUS = 'CANCELLED';

/** UX hint only — backend still rejects non-ACTIVE / non-owner cancels. */
export function canSellerCancelAuction(
  auction: Auction | null | undefined,
  user: Pick<AuthUser, 'id'> | null | undefined,
): boolean {
  if (!SELLER_AUCTION_CANCEL_ENABLED) return false;
  if (!isAuctionOwnedByUser(auction, user)) return false;
  return (auction?.status ?? '').toUpperCase() === 'ACTIVE';
}

export function canSellerEditAuction(
  _auction: Auction | null | undefined,
  _user: Pick<AuthUser, 'id'> | null | undefined,
): boolean {
  void _auction;
  void _user;
  return SELLER_AUCTION_EDIT_ENABLED;
}

export function canSellerDeleteAuction(
  _auction: Auction | null | undefined,
  _user: Pick<AuthUser, 'id'> | null | undefined,
): boolean {
  void _auction;
  void _user;
  return SELLER_AUCTION_DELETE_ENABLED;
}

export function buildAuctionTransitionApiPath(id: string | number): string {
  return `/auctions/${id}/transition/`;
}

/** Cancel body for the lifecycle transition endpoint — never PATCH status. */
export function buildAuctionCancelTransitionPayload(): {
  status: typeof SELLER_AUCTION_CANCEL_STATUS;
} {
  return { status: SELLER_AUCTION_CANCEL_STATUS };
}
