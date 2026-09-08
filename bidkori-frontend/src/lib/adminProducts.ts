import { formatAuctionStatus } from './auctionDisplay.ts';
import { findLinkedAuctionForProduct, formatSellerProductCondition } from './seller.ts';
import type { Auction, Product } from './types.ts';

/** Admin Products catalog (read-only). */
export const ADMIN_PRODUCTS_PATH = '/admin/products';

export const ADMIN_PRODUCT_READONLY_COPY =
  'Product catalog fields are read-only. Visibility can be moderated with Hide/Restore on the product detail page.';

/** Client-side catalog filter label — not server search. */
export const ADMIN_PRODUCT_SEARCH_HINT =
  'Filters the loaded product catalog (client-side). The Products API has no search parameter.';

export type AdminProductSort =
  | 'newest'
  | 'oldest'
  | 'title-asc'
  | 'title-desc';

export const ADMIN_PRODUCT_SORT_OPTIONS: {
  id: AdminProductSort;
  label: string;
}[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'title-asc', label: 'Title A–Z' },
  { id: 'title-desc', label: 'Title Z–A' },
];

export function adminProductDetailPath(id: string | number): string {
  return `${ADMIN_PRODUCTS_PATH}/${id}`;
}

/** Product serializer exposes seller as user PK only. */
export function formatAdminProductSeller(
  seller: Product['seller'],
): string {
  if (seller === null || seller === undefined || seller === '') {
    return 'Unavailable';
  }
  const id = typeof seller === 'number' ? seller : Number(seller);
  if (Number.isFinite(id)) {
    return `Seller ID #${id}`;
  }
  return String(seller);
}

/**
 * Category is a FK id on ProductSerializer — not a nested name.
 * Show ID carefully; never invent category names.
 */
export function formatAdminProductCategory(
  category: Product['category'],
): string | null {
  if (category === null || category === undefined) {
    return null;
  }
  const id = typeof category === 'number' ? category : Number(category);
  if (Number.isFinite(id)) {
    return `Category ID #${id}`;
  }
  return null;
}

export function formatAdminProductCondition(
  value: string | undefined,
): string {
  return formatSellerProductCondition(value);
}

function timestampMs(value: string | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Client-side filter over an already-loaded catalog.
 * Does not mutate the source array.
 */
export function filterAdminProducts(
  products: readonly Product[],
  query: string,
): Product[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return products.slice();

  return products.filter((product) => {
    const title = product.title.toLowerCase();
    const description = (product.description ?? '').toLowerCase();
    const condition = (product.condition ?? '').toLowerCase();
    const seller = formatAdminProductSeller(product.seller).toLowerCase();
    const sellerRaw =
      product.seller === null || product.seller === undefined
        ? ''
        : String(product.seller).toLowerCase();
    return (
      title.includes(normalized) ||
      description.includes(normalized) ||
      condition.includes(normalized) ||
      seller.includes(normalized) ||
      sellerRaw.includes(normalized)
    );
  });
}

/**
 * Client-side sort. Does not mutate the source array.
 */
export function sortAdminProducts(
  products: readonly Product[],
  sort: AdminProductSort = 'newest',
): Product[] {
  return products.slice().sort((a, b) => {
    if (sort === 'title-asc' || sort === 'title-desc') {
      const nameCmp = a.title.localeCompare(b.title, undefined, {
        sensitivity: 'base',
      });
      if (nameCmp !== 0) {
        return sort === 'title-asc' ? nameCmp : -nameCmp;
      }
      return b.id - a.id;
    }

    const createdDiff = timestampMs(a.created_at) - timestampMs(b.created_at);
    if (sort === 'oldest') {
      if (createdDiff !== 0) return createdDiff;
      return a.id - b.id;
    }
    if (createdDiff !== 0) return -createdDiff;
    return b.id - a.id;
  });
}

export type AdminLinkedAuctionSummary = {
  id: number;
  statusLabel: string;
};

/**
 * Cheap linked-auction lookup from an already-fetched auction catalog.
 * Reuses seller helper for product↔auction PK resolution only — not ownership.
 */
export function getAdminLinkedAuctionSummary(
  productId: number,
  auctions: readonly Auction[],
): AdminLinkedAuctionSummary | null {
  const linked = findLinkedAuctionForProduct(productId, auctions);
  if (!linked) return null;
  return {
    id: linked.id,
    statusLabel: formatAuctionStatus(linked.status) ?? linked.status ?? '—',
  };
}

/**
 * Admin Product pages are uniformly read-only in A04.
 * Ownership must never gate visibility or invent mutation actions.
 */
export function adminProductAllowsMutationUi(): boolean {
  return false;
}

/** Documented Admin Product HTTP surface for this phase (GET only). */
export const ADMIN_PRODUCT_READ_METHODS = ['GET'] as const;
