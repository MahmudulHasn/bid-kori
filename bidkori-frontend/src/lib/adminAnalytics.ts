/**
 * Staff analytics path, types, and pure normalization (no Axios).
 * Fetchers live in adminAnalyticsApi.ts for the browser app.
 */

/** Staff-only platform analytics (IsAdminUser). Relative to Axios `/api` base. */
export const ADMIN_ANALYTICS_API_PATH = '/auctions/analytics/';

/** Honest label for analytics.total_bidding_volume — never "Revenue"/"GMV". */
export const BIDDING_VOLUME_LABEL = 'Total Bidding Volume';

export const BIDDING_VOLUME_HINT =
  'Sum of current highest bids across auctions. Not revenue, sales, or settled GMV.';

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
