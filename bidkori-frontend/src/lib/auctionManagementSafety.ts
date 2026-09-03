/**
 * Seller Auction management safety gates.
 *
 * EDIT / IMAGE UPLOAD — backend BE-A02 freezes configuration and images unless:
 *   now < start_time AND no Bid rows AND status not CLOSED/CANCELLED.
 * Frontend mirrors status + start_time for UX. Bid existence is not on the
 * detail serializer; backend remains authoritative on submit.
 *
 * CANCEL — POST /auctions/<id>/transition/ { status: CANCELLED } (ACTIVE only).
 * DELETE — still deferred (cascade integrity).
 */

import { isAuctionOwnedByUser } from './auctionOwnership.ts';
import type { AuthUser, Auction } from './types.ts';

/** Feature is shipped; per-auction UX still uses freeze helpers. */
export const SELLER_AUCTION_EDIT_ENABLED = true;

/**
 * Cancel is lifecycle-backed and status-gated (ACTIVE → CANCELLED only).
 * Ownership: IsAuctionSellerOrReadOnly (product.seller).
 */
export const SELLER_AUCTION_CANCEL_ENABLED = true;

/** DELETE cascades bid/payment history — never expose from Seller UI. */
export const SELLER_AUCTION_DELETE_ENABLED = false;

/**
 * Reserve may be changed only via explicit "Change reserve price" intent
 * because the API keeps reserve write-only (no prefill of current value).
 */
export const SELLER_AUCTION_RESERVE_EDIT_ENABLED = true;

/** Product binding is create-only; Edit must never rebind product. */
export const SELLER_AUCTION_PRODUCT_REBIND_ENABLED = false;

export const SELLER_AUCTION_DELETE_BLOCK_REASON =
  'DELETE DEFERRED — BACKEND INTEGRITY GUARD REQUIRED';

export const SELLER_AUCTION_CANCEL_ENDPOINT_METHOD = 'POST';
export const SELLER_AUCTION_CANCEL_STATUS = 'CANCELLED';
export const AUCTION_UPDATE_METHOD = 'PATCH';

/**
 * UX mirror of backend freeze using fields available on Auction detail.
 * Does NOT know Bid existence — submit may still 400 if a bid arrived.
 */
export function isAuctionPreFreezeByClientClock(
  auction: Auction | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!auction) return false;
  const status = (auction.status ?? '').toUpperCase();
  if (status === 'CLOSED' || status === 'CANCELLED') return false;
  if (!auction.start_time) return false;
  const startMs = new Date(auction.start_time).getTime();
  if (!Number.isFinite(startMs) || startMs <= nowMs) return false;
  return true;
}

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
  auction: Auction | null | undefined,
  user: Pick<AuthUser, 'id'> | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!SELLER_AUCTION_EDIT_ENABLED) return false;
  if (!isAuctionOwnedByUser(auction, user)) return false;
  return isAuctionPreFreezeByClientClock(auction, nowMs);
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

export function isAuctionConfigurationFreezeError(error: unknown): boolean {
  const data = (error as { response?: { data?: { error?: unknown } } })?.response
    ?.data;
  const raw = data?.error;
  const message =
    typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw.join(' ')
        : typeof raw === 'object' && raw
          ? JSON.stringify(raw)
          : '';
  return message.toLowerCase().includes('no longer be edited');
}
