/**
 * Admin Bid Visibility helpers (read-only).
 * Bid history is per-auction via GET /auctions/<id>/history/ — no global Admin bids API.
 */

import {
  ADMIN_AUCTION_STATUS_OPTIONS,
  adminAuctionDetailPath,
  buildAdminAuctionsApiPath,
  buildAuctionBidHistoryApiPath,
  formatAdminAuctionAmountDisplay,
  formatAdminAuctionStatusLabel,
  getAdminAuctionProductId,
  getAdminAuctionSellerLabel,
  getAdminAuctionTitle,
  mapAdminBidHistory,
  type AdminAuctionStatusFilter,
  type AdminBidHistoryRow,
} from './adminAuctions.ts';
import type { Auction, UserBid } from './types.ts';

/** Next.js Admin Bids visibility route. */
export const ADMIN_BIDS_PATH = '/admin/bids';

export const ADMIN_BIDS_READONLY_COPY =
  'Bid records are read-only in the Admin workspace with the current REST API.';

export const ADMIN_BIDS_PAGE_HINT =
  'BidKori currently exposes bid history per auction. Select an auction to inspect its bid activity.';

export const ADMIN_BIDS_VS_ANALYTICS_HINT =
  'Analytics shows a capped recent bid sample across the platform. This page loads the complete bid history for one selected auction.';

/** Backend AuctionBidHistoryView orders by highest amount first. */
export const ADMIN_BID_HISTORY_ORDER_HINT =
  'Ordered by bid amount (highest first), as returned by the auction history API.';

/** Documented Admin Bids HTTP surface: catalog + per-auction history only. */
export const ADMIN_BIDS_READ_METHODS = ['GET'] as const;

export const ADMIN_BIDS_AUCTION_CATALOG_API_PATH = '/auctions/';

/** There is no global Admin bids collection endpoint. */
export const ADMIN_BIDS_GLOBAL_API_PATH: null = null;

export {
  ADMIN_AUCTION_STATUS_OPTIONS,
  buildAdminAuctionsApiPath,
  buildAuctionBidHistoryApiPath,
  mapAdminBidHistory,
  type AdminAuctionStatusFilter,
  type AdminBidHistoryRow,
};

export function adminBidsPath(auctionId?: string | number | null): string {
  if (auctionId === null || auctionId === undefined || auctionId === '') {
    return ADMIN_BIDS_PATH;
  }
  return `${ADMIN_BIDS_PATH}?auction=${encodeURIComponent(String(auctionId))}`;
}

export function adminBidsAllowsMutationUi(): boolean {
  return false;
}

export function adminBidsAllowsInvalidate(): boolean {
  return false;
}

/**
 * Architecture guard: never loop catalog rows into history fetches.
 * Callers must load history only for one selected auction id.
 */
export function shouldFetchBidHistoryForAuctionCatalog(): boolean {
  return false;
}

/**
 * Parse `?auction=` query. Malformed / non-positive values → null (no crash).
 */
export function parseAdminBidAuctionQuery(
  raw: string | null | undefined,
): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const id = Number(trimmed);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export type AdminBidAuctionHintResolution =
  | { status: 'none'; auctionId: null; auction: null }
  | { status: 'selected'; auctionId: number; auction: Auction }
  | { status: 'unknown'; auctionId: number; auction: null };

/**
 * Resolve a query hint against the loaded catalog only.
 * Does not invent auctions. No ownership gate — Admin may select any catalog row.
 */
export function resolveAdminBidAuctionHint(
  auctions: readonly Auction[],
  hint: number | null,
): AdminBidAuctionHintResolution {
  if (hint == null) {
    return { status: 'none', auctionId: null, auction: null };
  }
  const auction = auctions.find((row) => row.id === hint) ?? null;
  if (!auction) {
    return { status: 'unknown', auctionId: hint, auction: null };
  }
  return { status: 'selected', auctionId: hint, auction };
}

export type AdminBidAuctionContext = {
  auctionId: number;
  title: string;
  productId: number | null;
  sellerLabel: string;
  statusLabel: string;
  amountLabel: string;
  amountFormatted: string;
  startTime: string | undefined;
  endTime: string | undefined;
  auctionDetailHref: string;
  bidsHref: string;
};

export function getAdminBidAuctionContext(
  auction: Auction,
): AdminBidAuctionContext {
  const amount = formatAdminAuctionAmountDisplay(auction);
  return {
    auctionId: auction.id,
    title: getAdminAuctionTitle(auction),
    productId: getAdminAuctionProductId(auction),
    sellerLabel: getAdminAuctionSellerLabel(auction),
    statusLabel: formatAdminAuctionStatusLabel(auction.status),
    amountLabel: amount.label,
    amountFormatted: amount.formatted,
    startTime: auction.start_time,
    endTime: auction.end_time,
    auctionDetailHref: adminAuctionDetailPath(auction.id),
    bidsHref: adminBidsPath(auction.id),
  };
}

/**
 * Map history for display without mutating the source.
 * Preserves API order (highest amount first).
 */
export function mapAdminBidsVisibilityHistory(
  bids: readonly UserBid[],
): AdminBidHistoryRow[] {
  return mapAdminBidHistory(bids);
}
