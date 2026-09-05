import {
  formatAuctionMoney,
  formatAuctionStatus,
  getAuctionPriceLabel,
  getAuctionTitle,
} from './auctionDisplay.ts';
import { formatAdminProductSeller } from './adminProducts.ts';
import { getAuctionProductId } from './seller.ts';
import { normalizeSearchQuery } from './marketplace.ts';
import type { Auction, UserBid } from './types.ts';

/** Admin Auctions catalog (read-only). */
export const ADMIN_AUCTIONS_PATH = '/admin/auctions';

export const ADMIN_AUCTION_READONLY_COPY =
  'Auction records are read-only in the Admin workspace with the current REST API.';

export const ADMIN_AUCTION_SEARCH_HINT =
  'Uses backend ?search= on product title and description.';

export type AdminAuctionStatusFilter =
  | 'all'
  | 'ACTIVE'
  | 'CLOSED'
  | 'CANCELLED';

export const ADMIN_AUCTION_STATUS_OPTIONS: {
  id: AdminAuctionStatusFilter;
  label: string;
}[] = [
  { id: 'all', label: 'All' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'CLOSED', label: 'Closed' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

export type AdminAuctionSort =
  | 'newest'
  | 'oldest'
  | 'ending-soon'
  | 'starting-soon';

export const ADMIN_AUCTION_SORT_OPTIONS: {
  id: AdminAuctionSort;
  label: string;
}[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'ending-soon', label: 'Ending Soon' },
  { id: 'starting-soon', label: 'Starting Soon' },
];

/** Documented Admin Auction HTTP surface for A05 (GET only). */
export const ADMIN_AUCTION_READ_METHODS = ['GET'] as const;

export function adminAuctionDetailPath(id: string | number): string {
  return `${ADMIN_AUCTIONS_PATH}/${id}`;
}

export function buildAuctionBidHistoryApiPath(id: string | number): string {
  return `/auctions/${id}/history/`;
}

/**
 * Build GET /auctions/ with optional server-side status + search.
 * Does not invent unsupported query params.
 */
export function buildAdminAuctionsApiPath(options: {
  status?: AdminAuctionStatusFilter;
  search?: string | null;
} = {}): string {
  const params = new URLSearchParams();
  const status = options.status ?? 'all';
  if (status !== 'all') {
    params.set('status', status);
  }
  const search = normalizeSearchQuery(options.search);
  if (search) {
    params.set('search', search);
  }
  const qs = params.toString();
  return qs ? `/auctions/?${qs}` : '/auctions/';
}

export function adminAuctionAllowsMutationUi(): boolean {
  return false;
}

function timestampMs(value: string | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Client-side sort over an already-fetched auction list.
 * Does not mutate the source. Does not convert stale ACTIVE → CLOSED.
 */
export function sortAdminAuctions(
  auctions: readonly Auction[],
  sort: AdminAuctionSort = 'newest',
): Auction[] {
  return auctions.slice().sort((a, b) => {
    if (sort === 'ending-soon') {
      const aMs = a.end_time
        ? new Date(a.end_time).getTime()
        : Number.POSITIVE_INFINITY;
      const bMs = b.end_time
        ? new Date(b.end_time).getTime()
        : Number.POSITIVE_INFINITY;
      if (Number.isNaN(aMs) && Number.isNaN(bMs)) return b.id - a.id;
      if (Number.isNaN(aMs)) return 1;
      if (Number.isNaN(bMs)) return -1;
      if (aMs !== bMs) return aMs - bMs;
      return b.id - a.id;
    }
    if (sort === 'starting-soon') {
      const aMs = a.start_time
        ? new Date(a.start_time).getTime()
        : Number.POSITIVE_INFINITY;
      const bMs = b.start_time
        ? new Date(b.start_time).getTime()
        : Number.POSITIVE_INFINITY;
      if (Number.isNaN(aMs) && Number.isNaN(bMs)) return b.id - a.id;
      if (Number.isNaN(aMs)) return 1;
      if (Number.isNaN(bMs)) return -1;
      if (aMs !== bMs) return aMs - bMs;
      return b.id - a.id;
    }

    const startDiff = timestampMs(a.start_time) - timestampMs(b.start_time);
    if (sort === 'oldest') {
      if (startDiff !== 0) return startDiff;
      return a.id - b.id;
    }
    if (startDiff !== 0) return -startDiff;
    return b.id - a.id;
  });
}

export function getAdminAuctionProductId(auction: Auction): number | null {
  return getAuctionProductId(auction);
}

export function getAdminAuctionSellerLabel(auction: Auction): string {
  const product = auction.product;
  if (product && typeof product === 'object') {
    return formatAdminProductSeller(product.seller);
  }
  return 'Unavailable';
}

export function formatAdminAuctionPaidState(
  isPaid: boolean | undefined,
): string {
  if (isPaid === true) return 'Paid';
  if (isPaid === false) return 'Unpaid';
  return '—';
}

export function formatAdminAuctionFeaturedState(
  isFeatured: boolean | undefined,
): string {
  if (isFeatured === true) return 'Yes';
  if (isFeatured === false) return 'No';
  return '—';
}

export function formatAdminAuctionStatusLabel(
  status: string | undefined,
): string {
  return formatAuctionStatus(status) ?? 'Unknown';
}

export function formatAdminAuctionAmountDisplay(auction: Auction): {
  label: string;
  formatted: string;
} {
  const { label, amount } = getAuctionPriceLabel(auction);
  return {
    label,
    formatted: formatAuctionMoney(amount),
  };
}

export type AdminWinnerDisplay =
  | { kind: 'omit' }
  | { kind: 'no_winner'; label: 'No winner' }
  | { kind: 'winner'; label: string; bidderId: number | null };

/**
 * Winner copy only for CLOSED auctions. ACTIVE never labeled as final winner.
 */
export function getAdminWinnerDisplay(auction: Auction): AdminWinnerDisplay {
  const status = String(auction.status ?? '').toUpperCase();
  if (status !== 'CLOSED') {
    return { kind: 'omit' };
  }
  const id =
    auction.winning_bidder == null ? null : Number(auction.winning_bidder);
  const hasId = id != null && Number.isFinite(id);
  const username = auction.winning_bidder_username?.trim();
  if (!hasId && !username) {
    return { kind: 'no_winner', label: 'No winner' };
  }
  if (username) {
    return {
      kind: 'winner',
      label: username,
      bidderId: hasId ? id : null,
    };
  }
  return {
    kind: 'winner',
    label: `Bidder ID #${id}`,
    bidderId: id,
  };
}

/**
 * Keys safe to surface on Admin Auction detail.
 * Explicitly excludes reserve_price (write-only / never returned).
 */
export const ADMIN_AUCTION_DETAIL_DISPLAY_KEYS = [
  'id',
  'product',
  'starting_bid',
  'current_highest_bid',
  'min_increment',
  'start_time',
  'end_time',
  'status',
  'is_featured',
  'is_paid',
  'winning_bidder',
  'winning_bidder_username',
  'images',
] as const;

export function adminAuctionDetailIncludesReserve(): boolean {
  return (ADMIN_AUCTION_DETAIL_DISPLAY_KEYS as readonly string[]).includes(
    'reserve_price',
  );
}

export type AdminBidHistoryRow = {
  id: number;
  bidderUsername: string;
  amount: string;
  timestamp: string;
};

export function mapAdminBidHistory(
  bids: readonly UserBid[],
): AdminBidHistoryRow[] {
  return bids.map((bid) => ({
    id: bid.id,
    bidderUsername: bid.bidder_username?.trim() || 'Unknown',
    amount: formatAuctionMoney(Number(bid.amount)),
    timestamp: bid.timestamp ?? '',
  }));
}

export function getAdminAuctionTitle(auction: Auction): string {
  return getAuctionTitle(auction);
}
