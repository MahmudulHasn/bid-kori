/**
 * Admin platform financial summary (mock checkout ledger).
 * Exact aggregates from /api/admin/finance/summary/ — never from auction samples.
 */

export const ADMIN_FINANCE_SUMMARY_API_PATH = '/admin/finance/summary/';

export const ADMIN_FINANCE_DISCLOSURE =
  'Mock completed checkout ledger totals. Platform revenue is stored fee snapshots only — not bidding volume or bank settlement.';

export const COMPLETED_CHECKOUT_VOLUME_LABEL = 'Completed Checkout Volume';
export const PLATFORM_REVENUE_LABEL = 'Platform Revenue';
export const SELLER_NET_TOTAL_LABEL = 'Seller Net Total';
export const COMPLETED_SALES_COUNT_LABEL = 'Completed Sales';

export type AdminFinancialSummary = {
  completed_sales_count: number;
  gross_paid_volume: string;
  platform_revenue: string;
  seller_net_total: string;
  accounted_sales_count: number;
  legacy_completed_sales_count: number;
  legacy_gross_paid_volume: string;
  disclosure: string;
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

export function normalizeAdminFinancialSummary(
  raw: unknown,
): AdminFinancialSummary {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    completed_sales_count: asCount(data.completed_sales_count),
    gross_paid_volume: asMoneyString(data.gross_paid_volume),
    platform_revenue: asMoneyString(data.platform_revenue),
    seller_net_total: asMoneyString(data.seller_net_total),
    accounted_sales_count: asCount(data.accounted_sales_count),
    legacy_completed_sales_count: asCount(data.legacy_completed_sales_count),
    legacy_gross_paid_volume: asMoneyString(data.legacy_gross_paid_volume),
    disclosure:
      typeof data.disclosure === 'string' && data.disclosure.trim()
        ? data.disclosure
        : ADMIN_FINANCE_DISCLOSURE,
  };
}

export function hasLegacyAdminPayments(
  summary: Pick<AdminFinancialSummary, 'legacy_completed_sales_count'> | null,
): boolean {
  return (summary?.legacy_completed_sales_count ?? 0) > 0;
}

/** Guard: financial card labels must stay distinct from bidding volume. */
export function isPlatformRevenueLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return (
    normalized === 'platform revenue' ||
    normalized === 'revenue' ||
    normalized === 'gmv'
  );
}
