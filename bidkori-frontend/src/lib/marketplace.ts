/**
 * Public marketplace route constants and pure URL/query helpers.
 */

export const MARKETPLACE_ROUTES = {
  home: '/',
  auctions: '/auctions',
  search: '/search',
  contact: '/contact',
  auctionDetail: (id: string | number) => `/auctions/${id}`,
  buyerWon: '/buyer/won',
  buyerWonDetails: (id: string | number) => `/buyer/won/${id}/details`,
} as const;

/** Primary public navbar marketplace links (legacy dashboard/create excluded). */
export const PUBLIC_NAV_LINKS = [
  { href: MARKETPLACE_ROUTES.home, label: 'Home' },
  { href: MARKETPLACE_ROUTES.auctions, label: 'Marketplace' },
  { href: MARKETPLACE_ROUTES.contact, label: 'Contact Us' },
] as const;

export const LEGACY_PRIMARY_NAV_HREFS = [
  '/dashboard',
  '/auctions/create',
] as const;

export function isLegacyPrimaryNavHref(href: string): boolean {
  return (LEGACY_PRIMARY_NAV_HREFS as readonly string[]).includes(href);
}

/** Trim and normalize a user search query. Empty → null. */
export function normalizeSearchQuery(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build the public search page href with a safely encoded `q` param.
 * Empty/whitespace queries fall back to the auctions browse page.
 */
export function buildSearchPageHref(
  query: string | null | undefined,
): string {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) {
    return MARKETPLACE_ROUTES.auctions;
  }
  return `${MARKETPLACE_ROUTES.search}?q=${encodeURIComponent(normalized)}`;
}

/** Backend list URL for text search (`?search=`). */
export function buildAuctionSearchApiPath(
  query: string | null | undefined,
): string | null {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return null;
  return `/auctions/?search=${encodeURIComponent(normalized)}`;
}

export const ACTIVE_AUCTIONS_API_PATH = '/auctions/active/';

/**
 * Build the active auctions API path with optional category and search query filters.
 */
export function buildActiveAuctionsApiPath(options?: {
  category?: string | null;
  search?: string | null;
}): string {
  const params = new URLSearchParams();
  const cat = options?.category?.trim();
  const search = normalizeSearchQuery(options?.search);
  if (cat) {
    params.set('category', cat);
  }
  if (search) {
    params.set('search', search);
  }
  const qs = params.toString();
  return qs ? `${ACTIVE_AUCTIONS_API_PATH}?${qs}` : ACTIVE_AUCTIONS_API_PATH;
}

/**
 * Build the URL href for the marketplace active auctions page with optional category & search query.
 */
export function buildMarketplaceAuctionsHref(options?: {
  category?: string | null;
  query?: string | null;
}): string {
  const params = new URLSearchParams();
  const cat = options?.category?.trim();
  const q = normalizeSearchQuery(options?.query);
  if (cat) {
    params.set('category', cat);
  }
  if (q) {
    params.set('q', q);
  }
  const qs = params.toString();
  return qs ? `${MARKETPLACE_ROUTES.auctions}?${qs}` : MARKETPLACE_ROUTES.auctions;
}
export const MARKETPLACE_STATS_API_PATH = '/auctions/stats/';

export interface MarketplaceStats {
  total_auctions?: number;
  active_auctions?: number;
  active_bids: number;
  total_bids?: number;
  verified_sellers: number;
  total_traded: number;
}

/** Format numeric stat counts with k/M suffixes and fallback. */
export function formatStatNumber(val: number | undefined | null, fallback: string): string {
  if (val === undefined || val === null) return fallback;
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M+`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k+`;
  return `${val}+`;
}

/** Format currency volume (BDT) into Lakh (L) or Crore (Cr) notation. */
export function formatTradedAmount(val: number | undefined | null, fallback: string): string {
  if (val === undefined || val === null) return fallback;
  if (val >= 10000000) {
    const cr = val / 10000000;
    return `৳${cr >= 10 ? Math.round(cr) : cr.toFixed(1)}Cr+`;
  }
  if (val >= 100000) {
    const lakh = val / 100000;
    return `৳${lakh >= 10 ? Math.round(lakh) : lakh.toFixed(2)}L+`;
  }
  if (val >= 1000) {
    return `৳${(val / 1000).toFixed(1)}k+`;
  }
  return `৳${Math.round(val).toLocaleString()}`;
}

/** Sort a copy of auctions by soonest end_time first (missing dates last). */
export function sortAuctionsEndingSoon<T extends { end_time?: string }>(
  auctions: readonly T[],
): T[] {
  return [...auctions].sort((a, b) => {
    const aMs = a.end_time ? new Date(a.end_time).getTime() : Number.POSITIVE_INFINITY;
    const bMs = b.end_time ? new Date(b.end_time).getTime() : Number.POSITIVE_INFINITY;
    if (Number.isNaN(aMs) && Number.isNaN(bMs)) return 0;
    if (Number.isNaN(aMs)) return 1;
    if (Number.isNaN(bMs)) return -1;
    return aMs - bMs;
  });
}

