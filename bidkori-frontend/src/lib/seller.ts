import { isAuctionOwnedByUser } from './auctionOwnership.ts';
import { formatAuctionStatus } from './auctionDisplay.ts';
import type { AuthUser, Auction, Product } from './types.ts';

export const RECENT_SELLER_PRODUCTS_LIMIT = 4;
export const RECENT_SELLER_AUCTIONS_LIMIT = 4;

function auctionStatus(auction: Auction): string {
  return (auction.status ?? '').toUpperCase();
}

function timestampMs(value: string | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Auctions whose nested product.seller matches the current user.
 * Role is not used. Does not mutate the source array.
 */
export function getSellerAuctions(
  auctions: readonly Auction[],
  userId: number,
): Auction[] {
  return auctions.filter((auction) =>
    isAuctionOwnedByUser(auction, { id: userId }),
  );
}

export function getSellerActiveAuctions(
  auctions: readonly Auction[],
  userId: number,
): Auction[] {
  return getSellerAuctions(auctions, userId).filter(
    (auction) => auctionStatus(auction) === 'ACTIVE',
  );
}

export function getSellerClosedAuctions(
  auctions: readonly Auction[],
  userId: number,
): Auction[] {
  return getSellerAuctions(auctions, userId).filter(
    (auction) => auctionStatus(auction) === 'CLOSED',
  );
}

export function getSellerCancelledAuctions(
  auctions: readonly Auction[],
  userId: number,
): Auction[] {
  return getSellerAuctions(auctions, userId).filter(
    (auction) => auctionStatus(auction) === 'CANCELLED',
  );
}

export type SellerAuctionStatusFilter = 'all' | 'ACTIVE' | 'CLOSED' | 'CANCELLED';

export function filterSellerAuctions(
  auctions: readonly Auction[],
  userId: number,
  statusFilter: SellerAuctionStatusFilter = 'all',
): Auction[] {
  const owned = getSellerAuctions(auctions, userId);
  if (statusFilter === 'all') return owned;
  return owned.filter((auction) => auctionStatus(auction) === statusFilter);
}

export function sortSellerAuctions(auctions: readonly Auction[]): Auction[] {
  return auctions.slice().sort((a, b) => {
    const startDiff = timestampMs(b.start_time) - timestampMs(a.start_time);
    if (startDiff !== 0) return startDiff;
    return b.id - a.id;
  });
}

export function getSellerAuctionDisplayStatus(
  auction: Auction,
  nowMs: number = Date.now(),
): string {
  if (isSellerAuctionAwaitingFinalization(auction, nowMs)) {
    return 'Awaiting finalization';
  }
  return formatAuctionStatus(auction.status) ?? 'Unknown';
}

export function getSellerAuctionWinnerLabel(auction: Auction): string | null {
  if (auctionStatus(auction) !== 'CLOSED') return null;
  if (auction.winning_bidder == null) return 'No winner';
  const username = auction.winning_bidder_username?.trim();
  if (username) return username;
  return `Bidder #${auction.winning_bidder}`;
}

export function getSellerAuctionPaymentLabel(auction: Auction): string | null {
  if (auctionStatus(auction) !== 'CLOSED') return null;
  if (auction.is_paid === true) return 'Paid';
  if (auction.is_paid === false) return 'Unpaid';
  return null;
}

/**
 * ACTIVE past end_time is still ACTIVE until Django closes it.
 * Display-only; does not change metric status.
 */
export function isSellerAuctionAwaitingFinalization(
  auction: Auction,
  nowMs: number = Date.now(),
): boolean {
  if (auctionStatus(auction) !== 'ACTIVE') return false;
  const endMs = timestampMs(auction.end_time);
  return endMs > 0 && endMs <= nowMs;
}

export function getRecentSellerAuctions(
  auctions: readonly Auction[],
  userId: number,
  limit: number = RECENT_SELLER_AUCTIONS_LIMIT,
): Auction[] {
  return sortSellerAuctions(getSellerAuctions(auctions, userId)).slice(
    0,
    Math.max(0, limit),
  );
}

export type SellerProductSort = 'newest' | 'oldest' | 'name';

export function sortSellerProducts(
  products: readonly Product[],
  sort: SellerProductSort = 'newest',
): Product[] {
  return products.slice().sort((a, b) => {
    if (sort === 'name') {
      const nameCmp = a.title.localeCompare(b.title, undefined, {
        sensitivity: 'base',
      });
      if (nameCmp !== 0) return nameCmp;
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

export function getRecentSellerProducts(
  products: readonly Product[],
  limit: number = RECENT_SELLER_PRODUCTS_LIMIT,
): Product[] {
  return sortSellerProducts(products, 'newest').slice(0, Math.max(0, limit));
}

export function filterSellerProducts(
  products: readonly Product[],
  query: string,
): Product[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return products.slice();
  return products.filter((product) => {
    const title = product.title.toLowerCase();
    const description = (product.description ?? '').toLowerCase();
    return title.includes(normalized) || description.includes(normalized);
  });
}

/**
 * UX ownership check only — backend remains authoritative for writes.
 * Missing seller id fails closed.
 */
export function isProductOwnedByUser(
  product: Product | null | undefined,
  user: Pick<AuthUser, 'id'> | null | undefined,
): boolean {
  if (!product || !user) return false;
  if (product.seller == null || product.seller === '') return false;
  return Number(product.seller) === Number(user.id);
}

/**
 * Product DELETE is UX-gated: only when the Product appears unused (no Auction
 * in the known catalog). Backend BE-A03 remains authoritative.
 */
export const SELLER_PRODUCT_DELETE_ENABLED = true;

export const PRODUCT_DELETE_METHOD = 'DELETE';

export function buildProductDeleteApiPath(id: string | number): string {
  return `/products/${id}/`;
}

/**
 * UX helper — show Delete only for owned Products with no known Auction link.
 * Catalog may be stale; backend still rejects linked Products.
 */
export function canSellerDeleteProduct(
  product: Product | null | undefined,
  user: Pick<AuthUser, 'id'> | null | undefined,
  auctions: readonly Auction[],
): boolean {
  if (!SELLER_PRODUCT_DELETE_ENABLED) return false;
  if (!isProductOwnedByUser(product, user) || !product) return false;
  return !getAuctionedProductIds(auctions).has(product.id);
}

export function isProductLinkedAuctionDeleteError(error: unknown): boolean {
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
  return message.toLowerCase().includes('linked to an auction');
}

export const PRODUCT_WRITE_FIELDS = ['title', 'description', 'condition'] as const;

/** POST create lives on the product collection. PATCH update uses the detail path. */
export const PRODUCT_CREATE_API_PATH = '/products/';
export const PRODUCT_CREATE_METHOD = 'POST';
export const PRODUCT_UPDATE_METHOD = 'PATCH';

export function productUpdateApiPath(id: string | number): string {
  return `/products/${id}/`;
}

export const PRODUCT_CONDITION_VALUES = [
  'NEW',
  'USED_LIKE_NEW',
  'USED_GOOD',
  'FAIR',
] as const;

export type ProductCondition = (typeof PRODUCT_CONDITION_VALUES)[number];

export type ProductFormValues = {
  title: string;
  description: string;
  condition: ProductCondition;
};

export type ProductWritePayload = {
  title: string;
  description: string;
  condition: ProductCondition;
};

export const PRODUCT_CONDITION_OPTIONS: {
  value: ProductCondition;
  label: string;
}[] = [
  { value: 'NEW', label: 'Brand New' },
  { value: 'USED_LIKE_NEW', label: 'Used - Like New' },
  { value: 'USED_GOOD', label: 'Used - Good' },
  { value: 'FAIR', label: 'Fair Condition' },
];

export const DEFAULT_PRODUCT_CONDITION: ProductCondition = 'USED_GOOD';

export function isProductCondition(value: string | undefined): value is ProductCondition {
  return PRODUCT_CONDITION_VALUES.some((item) => item === value);
}

export function emptyProductFormValues(): ProductFormValues {
  return {
    title: '',
    description: '',
    condition: DEFAULT_PRODUCT_CONDITION,
  };
}

export function productFormValuesFromProduct(product: Product): ProductFormValues {
  return {
    title: product.title ?? '',
    description: product.description ?? '',
    condition: isProductCondition(product.condition)
      ? product.condition
      : DEFAULT_PRODUCT_CONDITION,
  };
}

export function validateProductForm(
  values: ProductFormValues,
): Partial<Record<keyof ProductFormValues, string>> {
  const errors: Partial<Record<keyof ProductFormValues, string>> = {};
  if (!values.title.trim()) {
    errors.title = 'Title is required.';
  } else if (values.title.trim().length > 255) {
    errors.title = 'Title must be 255 characters or fewer.';
  }
  if (!isProductCondition(values.condition)) {
    errors.condition = 'Select a valid condition.';
  }
  return errors;
}

/**
 * Catalog write payload only. Drops seller, category, and auction pricing.
 * Does not mutate the source object.
 */
export function serializeProductWritePayload(
  values: ProductFormValues,
): ProductWritePayload {
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    condition: values.condition,
  };
}

export function productWritePayloadKeys(
  payload: ProductWritePayload,
): string[] {
  return Object.keys(payload);
}

export function formatSellerProductCondition(value: string | undefined): string {
  switch (value) {
    case 'NEW':
      return 'Brand New';
    case 'USED_LIKE_NEW':
      return 'Used - Like New';
    case 'USED_GOOD':
      return 'Used - Good';
    case 'FAIR':
      return 'Fair Condition';
    default:
      return value?.trim() ? value : '—';
  }
}

export type SellerDashboardMetrics = {
  products: number;
  auctions: number;
  activeAuctions: number;
  closedAuctions: number;
};

export function getSellerDashboardMetrics(
  products: readonly Product[],
  auctions: readonly Auction[],
  userId: number,
): SellerDashboardMetrics {
  return {
    products: products.length,
    auctions: getSellerAuctions(auctions, userId).length,
    activeAuctions: getSellerActiveAuctions(auctions, userId).length,
    closedAuctions: getSellerClosedAuctions(auctions, userId).length,
  };
}

/**
 * Resolve the Product PK linked to an auction (nested object or bare id).
 * Does not mutate the auction.
 */
export function getAuctionProductId(auction: Auction): number | null {
  const product = auction.product;
  if (typeof product === 'number' && Number.isFinite(product) && product > 0) {
    return product;
  }
  if (product && typeof product === 'object' && product.id != null) {
    const id = Number(product.id);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return null;
}

/**
 * Product IDs that already have an Auction (OneToOne).
 * Does not mutate the source array.
 */
export function getAuctionedProductIds(
  auctions: readonly Auction[],
): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const auction of auctions) {
    const productId = getAuctionProductId(auction);
    if (productId != null) ids.add(productId);
  }
  return ids;
}

/**
 * Seller catalog products that do not yet have an Auction.
 * Source products should already be my-listings (owned). Does not mutate inputs.
 */
export function getEligibleAuctionProducts(
  products: readonly Product[],
  auctions: readonly Auction[],
): Product[] {
  const auctioned = getAuctionedProductIds(auctions);
  return products.filter((product) => !auctioned.has(product.id));
}

export function isProductEligibleForAuction(
  productId: number,
  products: readonly Product[],
  auctions: readonly Auction[],
): boolean {
  return getEligibleAuctionProducts(products, auctions).some(
    (product) => product.id === productId,
  );
}

export type AuctionCreateProductHintResult = {
  productId: number | null;
  /** Safe informational message when the query hint cannot be used. */
  message?: string;
};

/**
 * Validate `?product=` against owned listings and current eligibility.
 * Unknown / ineligible hints are ignored without ownership detail leakage.
 */
export function resolveAuctionCreateProductHint(
  hint: string | null | undefined,
  eligibleProducts: readonly Product[],
): AuctionCreateProductHintResult {
  if (hint == null || !String(hint).trim()) {
    return { productId: null };
  }
  const parsed = Number(String(hint).trim());
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return {
      productId: null,
      message:
        'That product is not available for a new auction. Choose another product.',
    };
  }
  if (eligibleProducts.some((product) => product.id === parsed)) {
    return { productId: parsed };
  }
  return {
    productId: null,
    message:
      'That product is not available for a new auction. Choose another product.',
  };
}
