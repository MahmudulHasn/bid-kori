/**
 * Seller completed-sales / earnings helpers (mock checkout ledger).
 * Totals come from backend aggregates — never sum paginated rows in the UI.
 */

export const SELLER_SALES_PATH = '/seller/sales';
export const SELLER_EARNINGS_API_PATH = '/seller/earnings/';
export const SELLER_SALES_API_PATH = '/seller/sales/';
export const SELLER_SALES_PAGE_SIZE = 20;

export const SELLER_FINANCE_DISCLOSURE =
  'Based on completed BidKori mock checkout records. Not a withdrawable balance or bank settlement.';

export const SELLER_LEGACY_FEE_NOTE =
  'Some older completed sales predate fee tracking, so fee/net totals exclude those records.';

export const LEGACY_SALE_FEE_UNAVAILABLE =
  'Fee tracking unavailable for this legacy payment.';

export type SellerEarnings = {
  completed_sales_count: number;
  gross_sales: string;
  platform_fees: string;
  net_earnings: string;
  accounted_sales_count: number;
  legacy_completed_sales_count: number;
  legacy_gross_sales: string;
  disclosure: string;
};

export type SellerSaleRow = {
  payment_id: number;
  auction_id: number;
  auction_title: string;
  buyer_username: string;
  amount: string;
  fee_rate: string | null;
  platform_fee: string | null;
  seller_net_amount: string | null;
  status: string;
  created_at: string;
  has_fee_snapshot: boolean;
};

export type SellerSalesListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: SellerSaleRow[];
};

function asMoneyString(value: unknown, fallback = '0.00'): string {
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  return fallback;
}

function asCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function normalizeSellerEarnings(raw: unknown): SellerEarnings {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    completed_sales_count: asCount(data.completed_sales_count),
    gross_sales: asMoneyString(data.gross_sales),
    platform_fees: asMoneyString(data.platform_fees),
    net_earnings: asMoneyString(data.net_earnings),
    accounted_sales_count: asCount(data.accounted_sales_count),
    legacy_completed_sales_count: asCount(data.legacy_completed_sales_count),
    legacy_gross_sales: asMoneyString(data.legacy_gross_sales),
    disclosure:
      typeof data.disclosure === 'string' && data.disclosure.trim()
        ? data.disclosure
        : SELLER_FINANCE_DISCLOSURE,
  };
}

export function normalizeSellerSaleRow(raw: unknown): SellerSaleRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const paymentId = asCount(data.payment_id);
  const auctionId = asCount(data.auction_id);
  if (paymentId < 1 || auctionId < 1) return null;
  const hasSnapshot = data.has_fee_snapshot === true;
  return {
    payment_id: paymentId,
    auction_id: auctionId,
    auction_title:
      typeof data.auction_title === 'string' && data.auction_title.trim()
        ? data.auction_title
        : 'Untitled listing',
    buyer_username:
      typeof data.buyer_username === 'string' ? data.buyer_username : '—',
    amount: asMoneyString(data.amount),
    fee_rate:
      data.fee_rate === null || data.fee_rate === undefined
        ? null
        : asMoneyString(data.fee_rate),
    platform_fee:
      data.platform_fee === null || data.platform_fee === undefined
        ? null
        : asMoneyString(data.platform_fee),
    seller_net_amount:
      data.seller_net_amount === null || data.seller_net_amount === undefined
        ? null
        : asMoneyString(data.seller_net_amount),
    status: typeof data.status === 'string' ? data.status : 'COMPLETED',
    created_at: typeof data.created_at === 'string' ? data.created_at : '',
    has_fee_snapshot: hasSnapshot,
  };
}

export function normalizeSellerSalesList(raw: unknown): SellerSalesListResponse {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const resultsRaw = Array.isArray(data.results) ? data.results : [];
  return {
    count: asCount(data.count),
    next: typeof data.next === 'string' ? data.next : null,
    previous: typeof data.previous === 'string' ? data.previous : null,
    results: resultsRaw
      .map(normalizeSellerSaleRow)
      .filter((row): row is SellerSaleRow => row != null),
  };
}

export function buildSellerSalesApiPath(page = 1): string {
  const safePage = Number.isFinite(page) && page > 1 ? Math.floor(page) : 1;
  if (safePage <= 1) return SELLER_SALES_API_PATH;
  return `${SELLER_SALES_API_PATH}?page=${safePage}`;
}

export function parseSellerSalesPageParam(
  raw: string | null | undefined,
): number {
  if (raw == null || raw === '') return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

export function sellerSalesHasNextPage(
  response: Pick<SellerSalesListResponse, 'next'> | null | undefined,
): boolean {
  return Boolean(response?.next);
}

export function sellerSalesHasPreviousPage(
  response: Pick<SellerSalesListResponse, 'previous'> | null | undefined,
): boolean {
  return Boolean(response?.previous);
}

export function formatFeeRateDisplay(rate: string | null): string {
  if (rate == null) return '—';
  return `${rate}%`;
}

export function isLegacySaleRow(
  row: Pick<SellerSaleRow, 'has_fee_snapshot'>,
): boolean {
  return row.has_fee_snapshot !== true;
}

export function hasLegacySellerSales(
  earnings: Pick<SellerEarnings, 'legacy_completed_sales_count'> | null,
): boolean {
  return (earnings?.legacy_completed_sales_count ?? 0) > 0;
}

/** Labels must not imply payout / withdraw controls. */
export function isPayoutControlLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return (
    normalized.includes('withdraw') ||
    normalized.includes('payout') ||
    normalized.includes('available balance') ||
    normalized.includes('paid out')
  );
}
