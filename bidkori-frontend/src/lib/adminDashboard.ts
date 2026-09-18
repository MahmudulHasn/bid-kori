import type {
  AdminAnalytics,
  AdminBidEscalationRow,
  AdminCategoryBreakdownRow,
  AdminTopBidderRow,
} from './adminAnalytics.ts';
import { formatAuctionMoney } from './auctionDisplay.ts';
import type { Auction, Product } from './types.ts';

export type AdminCatalogMetrics = {
  totalProducts: number;
  totalAuctions: number;
  closedAuctions: number;
  cancelledAuctions: number;
  paidAuctions: number;
};

export type AdminDashboardMetrics = {
  /** Authoritative from analytics.total_active_auctions when present. */
  activeAuctions: number | null;
  totalBids: number | null;
  biddingVolume: string | number | null;
  totalProducts: number | null;
  totalAuctions: number | null;
  closedAuctions: number | null;
  cancelledAuctions: number | null;
  paidAuctions: number | null;
};

function statusOf(auction: Auction): string {
  return String(auction.status ?? '').toUpperCase();
}

/**
 * Derive MVP catalog counts from full (unpaginated) product/auction lists.
 * Does not mutate inputs. Does not locally finalize stale ACTIVE auctions.
 */
export function getAdminCatalogMetrics(
  products: readonly Product[],
  auctions: readonly Auction[],
): AdminCatalogMetrics {
  let closedAuctions = 0;
  let cancelledAuctions = 0;
  let paidAuctions = 0;

  for (const auction of auctions) {
    const status = statusOf(auction);
    if (status === 'CLOSED') closedAuctions += 1;
    if (status === 'CANCELLED') cancelledAuctions += 1;
    if (auction.is_paid === true) paidAuctions += 1;
  }

  return {
    totalProducts: products.length,
    totalAuctions: auctions.length,
    closedAuctions,
    cancelledAuctions,
    paidAuctions,
  };
}

/**
 * Merge analytics + catalog into dashboard metrics.
 * Active auctions and total bids come only from analytics (canonical).
 * Catalog fields are null when the catalog fetch failed (products/auctions undefined).
 */
export function buildAdminDashboardMetrics(options: {
  analytics: AdminAnalytics | null | undefined;
  products: readonly Product[] | null | undefined;
  auctions: readonly Auction[] | null | undefined;
}): AdminDashboardMetrics {
  const { analytics, products, auctions } = options;
  const catalogReady = products != null && auctions != null;
  const catalog = catalogReady
    ? getAdminCatalogMetrics(products, auctions)
    : null;

  return {
    activeAuctions:
      analytics != null ? analytics.total_active_auctions : null,
    totalBids: analytics != null ? analytics.total_bids_placed : null,
    biddingVolume: analytics != null ? analytics.total_bidding_volume : null,
    totalProducts: catalog?.totalProducts ?? null,
    totalAuctions: catalog?.totalAuctions ?? null,
    closedAuctions: catalog?.closedAuctions ?? null,
    cancelledAuctions: catalog?.cancelledAuctions ?? null,
    paidAuctions: catalog?.paidAuctions ?? null,
  };
}

/** Parse money-like values without inventing a second currency style. */
export function formatAdminMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return String(value);
  }
  return formatAuctionMoney(n);
}

export type CategorySnapshotRow = {
  category: string;
  auctionCount: number;
  avgStartingPrice: string;
  avgHighestBid: string;
};

export function mapCategorySnapshot(
  rows: readonly AdminCategoryBreakdownRow[],
): CategorySnapshotRow[] {
  return rows.map((row) => ({
    category: row.category,
    auctionCount: row.auction_count,
    avgStartingPrice: formatAdminMoney(row.avg_starting_price),
    avgHighestBid: formatAdminMoney(row.avg_highest_bid),
  }));
}

export type TopBidderDisplayRow = {
  username: string;
  bidCount: number;
  totalBidAmount: string;
};

export function mapTopActiveBidders(
  rows: readonly AdminTopBidderRow[],
): TopBidderDisplayRow[] {
  return rows.map((row) => ({
    username: row.username || 'Unknown',
    bidCount: row.bid_count,
    totalBidAmount: formatAdminMoney(row.total_bid_amount),
  }));
}

export type RecentBidDisplayRow = {
  bidId: number;
  auctionId: number;
  amount: string;
  timestamp: string;
  bidderUsername: string;
};

/**
 * Dashboard "Recent Bid Activity": newest first, at most `limit` rows.
 * Backend `bid_escalation_history` is already newest-first — preserve order.
 * Does not mutate the source array.
 */
export function mapRecentBidActivity(
  rows: readonly AdminBidEscalationRow[],
  limit = 12,
): RecentBidDisplayRow[] {
  return rows.slice(0, limit).map((row) => ({
    bidId: row.bid_id,
    auctionId: row.auction_id,
    amount: formatAdminMoney(row.amount),
    timestamp: row.timestamp,
    bidderUsername: row.bidder_username || 'Unknown',
  }));
}

/** Guard: bidding volume must never be labeled as revenue in UI copy maps. */
export function isRevenueLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return (
    normalized === 'revenue' ||
    normalized === 'sales' ||
    normalized === 'gmv' ||
    normalized === 'platform revenue' ||
    normalized === 'settled gmv'
  );
}

// ---------------------------------------------------------------------------
// ADMIN COMMAND CENTER (ADMIN-X01) UNIFIED SUMMARY SCHEMA & HELPERS
// ---------------------------------------------------------------------------

export type AdminDashboardUserStats = {
  total: number;
  buyers: number;
  sellers: number;
  admins: number;
  active: number;
  suspended: number;
};

export type AdminDashboardAuctionStats = {
  total: number;
  upcoming: number;
  live: number;
  closed: number;
  cancelled: number;
  hidden: number;
};

export type AdminDashboardProductStats = {
  total: number;
  hidden: number;
};

export type AdminDashboardBidStats = {
  total: number;
};

export type AdminDashboardFinanceStats = {
  completed_sales_count: number;
  gross_paid_volume: string;
  platform_revenue: string;
  seller_net_total: string;
  accounted_sales_count: number;
  legacy_completed_sales_count: number;
  legacy_gross_paid_volume: string;
  disclosure: string;
};

export type AdminDashboardModerationStats = {
  hidden_products_count: number;
  hidden_auctions_count: number;
  cancelled_auctions_count: number;
  suspended_users_count: number;
  total_attention_required: number;
};

export type AdminRecentUser = {
  id: number;
  username: string;
  email: string;
  role: 'BUYER' | 'SELLER' | 'ADMIN';
  is_active: boolean;
  date_joined: string | null;
};

export type AdminRecentProduct = {
  id: number;
  title: string;
  seller_username: string;
  category_name: string;
  is_hidden: boolean;
  created_at: string | null;
};

export type AdminRecentAuction = {
  id: number;
  title: string;
  seller_username: string;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  current_price: string;
  is_hidden: boolean;
  created_at: string | null;
};

export type AdminRecentBid = {
  id: number;
  auction_id: number;
  auction_title: string;
  amount: string;
  bidder_username: string;
  timestamp: string | null;
};

export type AdminRecentPayment = {
  id: number;
  auction_id: number;
  auction_title: string;
  amount: string;
  platform_fee: string | null;
  buyer_username: string;
  created_at: string | null;
};

export type AdminDashboardRecentActivity = {
  users: readonly AdminRecentUser[];
  products: readonly AdminRecentProduct[];
  auctions: readonly AdminRecentAuction[];
  bids: readonly AdminRecentBid[];
  payments: readonly AdminRecentPayment[];
};

export type AdminDashboardSystemHealth = {
  database: string;
  redis: string;
  celery_broker: string;
  api: string;
};

export type AdminDashboardSummary = {
  users: AdminDashboardUserStats;
  auctions: AdminDashboardAuctionStats;
  products: AdminDashboardProductStats;
  bids: AdminDashboardBidStats;
  finance: AdminDashboardFinanceStats;
  moderation: AdminDashboardModerationStats;
  recent_activity: AdminDashboardRecentActivity;
  system_health: AdminDashboardSystemHealth;
};

export function formatHealthStatus(status: string | undefined): {
  label: string;
  isHealthy: boolean;
} {
  const norm = (status ?? '').trim().toLowerCase();
  if (norm === 'healthy' || norm === 'online') {
    return { label: 'Operational', isHealthy: true };
  }
  if (norm === 'degraded' || norm === 'unreachable') {
    return { label: 'Unreachable', isHealthy: false };
  }
  return { label: status || 'Unknown', isHealthy: false };
}

