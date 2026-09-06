/**
 * Staff analytics path, types, and pure normalization (no Axios).
 * Fetchers live in adminAnalyticsApi.ts for the browser app.
 */

import { formatAuctionMoney } from './auctionDisplay.ts';

/** Staff-only platform analytics (IsAdminUser). Relative to Axios `/api` base. */
export const ADMIN_ANALYTICS_API_PATH = '/auctions/analytics/';

/** Next.js Admin Analytics page route. */
export const ADMIN_ANALYTICS_PATH = '/admin/analytics';

/** Honest label for analytics.total_bidding_volume — never "Revenue"/"GMV". */
export const BIDDING_VOLUME_LABEL = 'Total Bidding Volume';

export const BIDDING_VOLUME_HINT =
  'Sum of current highest bids across auctions. Not revenue, sales, or settled GMV.';

/** Fuller page copy for the Analytics surface. */
export const ANALYTICS_PAGE_VOLUME_HINT =
  'Sum of bid activity reported by the analytics API; this is not platform revenue.';

export const ANALYTICS_ESCALATION_SAMPLE_HINT =
  'Newest bid activity sample (up to 100 bids). This is a capped analytics sample, not the complete global bid ledger.';

export const ADMIN_ANALYTICS_READ_METHODS = ['GET'] as const;

export type AdminCategoryBreakdownRow = {
  category: string;
  avg_starting_price: string | number | null;
  avg_highest_bid: string | number | null;
  avg_price_growth: string | number | null;
  auction_count: number;
};

export type AdminBidEscalationRow = {
  bid_id: number;
  auction_id: number;
  amount: string | number;
  timestamp: string;
  bidder_username: string;
};

export type AdminTopBidderRow = {
  username: string;
  bid_count: number;
  total_bid_amount: string | number;
};

/** Exact staff analytics payload from GET /api/auctions/analytics/. */
export type AdminAnalytics = {
  total_active_auctions: number;
  total_bids_placed: number;
  total_bidding_volume: string | number;
  category_breakdown: AdminCategoryBreakdownRow[];
  bid_escalation_history: AdminBidEscalationRow[];
  top_active_bidders: AdminTopBidderRow[];
};

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asMoney(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return null;
}

function formatMoneyLike(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return formatAuctionMoney(n);
}

/**
 * Backend: Avg(current_highest_bid - starting_bid) — monetary difference, not %.
 */
export function formatAdminPriceGrowth(
  value: string | number | null | undefined,
): string {
  return formatMoneyLike(value);
}

export type AdminAnalyticsCategoryDisplayRow = {
  category: string;
  auctionCount: number;
  avgStartingPrice: string;
  avgHighestBid: string;
  avgPriceGrowth: string;
};

export function mapAdminAnalyticsCategoryRows(
  rows: readonly AdminCategoryBreakdownRow[],
): AdminAnalyticsCategoryDisplayRow[] {
  return rows.map((row) => ({
    category: row.category,
    auctionCount: row.auction_count,
    avgStartingPrice: formatMoneyLike(row.avg_starting_price),
    avgHighestBid: formatMoneyLike(row.avg_highest_bid),
    avgPriceGrowth: formatAdminPriceGrowth(row.avg_price_growth),
  }));
}

export type AdminAnalyticsTopBidderDisplayRow = {
  username: string;
  bidCount: number;
  totalBidAmount: string;
};

export function mapAdminAnalyticsTopBidders(
  rows: readonly AdminTopBidderRow[],
): AdminAnalyticsTopBidderDisplayRow[] {
  return rows.map((row) => ({
    username: row.username || 'Unknown',
    bidCount: row.bid_count,
    totalBidAmount: formatMoneyLike(row.total_bid_amount),
  }));
}

export type AdminAnalyticsEscalationDisplayRow = {
  bidId: number;
  auctionId: number;
  amount: string;
  timestamp: string;
  bidderUsername: string;
};

/**
 * Full escalation sample for Analytics page.
 * Backend order is newest-first — preserve it; do not reverse or mutate.
 */
export function mapAdminAnalyticsEscalationRows(
  rows: readonly AdminBidEscalationRow[],
): AdminAnalyticsEscalationDisplayRow[] {
  return rows.map((row) => ({
    bidId: row.bid_id,
    auctionId: row.auction_id,
    amount: formatMoneyLike(row.amount),
    timestamp: row.timestamp,
    bidderUsername: row.bidder_username || 'Unknown',
  }));
}

export type AdminAnalyticsSummary = {
  activeAuctions: number;
  totalBidsPlaced: number;
  biddingVolume: string | number;
  categoriesRepresented: number;
};

export function getAdminAnalyticsSummary(
  analytics: AdminAnalytics,
): AdminAnalyticsSummary {
  return {
    activeAuctions: analytics.total_active_auctions,
    totalBidsPlaced: analytics.total_bids_placed,
    biddingVolume: analytics.total_bidding_volume,
    categoriesRepresented: analytics.category_breakdown.length,
  };
}

/** Guard: bidding volume must never be labeled as revenue in UI copy maps. */
export function isAnalyticsRevenueLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return (
    normalized === 'revenue' ||
    normalized === 'sales' ||
    normalized === 'gmv' ||
    normalized === 'platform revenue' ||
    normalized === 'settled gmv'
  );
}

/**
 * Normalize a loose JSON payload into AdminAnalytics.
 * Unknown shapes yield empty collections rather than throwing.
 */
export function normalizeAdminAnalytics(data: unknown): AdminAnalytics {
  const raw =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {};

  const categories = Array.isArray(raw.category_breakdown)
    ? raw.category_breakdown
    : [];
  const history = Array.isArray(raw.bid_escalation_history)
    ? raw.bid_escalation_history
    : [];
  const top = Array.isArray(raw.top_active_bidders)
    ? raw.top_active_bidders
    : [];

  return {
    total_active_auctions: asNumber(raw.total_active_auctions),
    total_bids_placed: asNumber(raw.total_bids_placed),
    total_bidding_volume:
      typeof raw.total_bidding_volume === 'number' ||
      typeof raw.total_bidding_volume === 'string'
        ? raw.total_bidding_volume
        : '0.00',
    category_breakdown: categories
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      .map((row) => ({
        category: String(row.category ?? 'Uncategorized'),
        avg_starting_price: asMoney(row.avg_starting_price),
        avg_highest_bid: asMoney(row.avg_highest_bid),
        avg_price_growth: asMoney(row.avg_price_growth),
        auction_count: asNumber(row.auction_count),
      })),
    bid_escalation_history: history
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      .map((row) => ({
        bid_id: asNumber(row.bid_id),
        auction_id: asNumber(row.auction_id),
        amount:
          typeof row.amount === 'number' || typeof row.amount === 'string'
            ? row.amount
            : '0',
        timestamp: String(row.timestamp ?? ''),
        bidder_username: String(row.bidder_username ?? ''),
      })),
    top_active_bidders: top
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      .map((row) => ({
        username: String(row.username ?? ''),
        bid_count: asNumber(row.bid_count),
        total_bid_amount:
          typeof row.total_bid_amount === 'number' ||
          typeof row.total_bid_amount === 'string'
            ? row.total_bid_amount
            : '0',
      })),
  };
}
