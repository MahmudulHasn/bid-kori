/**
 * Public marketplace route constants and pure URL/query helpers.
 */

export const MARKETPLACE_ROUTES = {
  home: '/',
  auctions: '/auctions',
  search: '/search',
  auctionDetail: (id: string | number) => `/auctions/${id}`,
} as const;

/** Primary public navbar marketplace links (legacy dashboard/create excluded). */
export const PUBLIC_NAV_LINKS = [
  { href: MARKETPLACE_ROUTES.auctions, label: 'Marketplace' },
  { href: MARKETPLACE_ROUTES.search, label: 'Search' },
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
