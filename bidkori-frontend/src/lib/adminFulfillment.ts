/**
 * Admin fulfillment audit types, constants, and pure helpers (ADMIN-W01).
 * No Axios/SWR — fetchers live in adminFulfillmentApi.ts.
 */

/* ── Routes ───────────────────────────────────────────── */

/** Next.js Admin Fulfillment page route. */
export const ADMIN_FULFILLMENT_PATH = '/admin/fulfillment';

/** API base (relative to Axios `/api` base). */
export const ADMIN_FULFILLMENT_API_PATH = '/admin/fulfillment/';
export const ADMIN_FULFILLMENT_SUMMARY_API_PATH = '/admin/fulfillment/summary/';

export function adminFulfillmentDetailPath(auctionId: number | string): string {
  return `${ADMIN_FULFILLMENT_PATH}/${auctionId}`;
}

export function adminFulfillmentDetailApiPath(auctionId: number | string): string {
  return `${ADMIN_FULFILLMENT_API_PATH}${auctionId}/`;
}

/* ── Derived Fulfillment Status ───────────────────────── */

export const FULFILLMENT_STATUSES = [
  'NOT_STARTED',
  'DRAFT',
  'COMPLETED_LOCKED',
  'UNLOCKED',
] as const;

export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export type FulfillmentStatusBadge = {
  label: string;
  className: string;
};

export const FULFILLMENT_STATUS_BADGES: Record<FulfillmentStatus, FulfillmentStatusBadge> = {
  NOT_STARTED: {
    label: 'Not Started',
    className:
      'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  },
  DRAFT: {
    label: 'In Progress',
    className:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  },
  COMPLETED_LOCKED: {
    label: 'Ready to Unlock',
    className:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  },
  UNLOCKED: {
    label: 'Unlocked',
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
};

export function getFulfillmentStatusBadge(
  status: string,
): FulfillmentStatusBadge {
  return (
    FULFILLMENT_STATUS_BADGES[status as FulfillmentStatus] ?? {
      label: status,
      className: 'bg-zinc-100 text-zinc-700',
    }
  );
}

/* ── Integrity Status ─────────────────────────────────── */

export type IntegrityStatus = 'OK' | 'WARNING';

export function isIntegrityWarning(status: string): boolean {
  return status === 'WARNING';
}

/* ── Unlock Status ────────────────────────────────────── */

export type UnlockPaymentStatus = 'PAID' | 'PENDING' | 'FAILED' | null;

export function getUnlockStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  switch (status) {
    case 'PAID':
      return 'Paid';
    case 'PENDING':
      return 'Pending';
    case 'FAILED':
      return 'Failed';
    default:
      return status;
  }
}

/* ── Types ────────────────────────────────────────────── */

export type AdminFulfillmentListItem = {
  auction_id: number;
  auction_title: string;
  product_title: string;
  seller_id: number;
  seller_username: string;
  winner_id: number | null;
  winner_username: string | null;
  fulfillment_status: FulfillmentStatus;
  unlock_status: string | null;
  unlock_fee: string | null;
  currency: string | null;
  submitted_at: string | null;
  unlocked_at: string | null;
  updated_at: string | null;
  integrity_status: IntegrityStatus;
};

export type AdminFulfillmentPaginatedResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: AdminFulfillmentListItem[];
};

export type NotificationAudit = {
  details_ready_notified: boolean;
  unlock_notified: boolean;
  details_updated_count: number;
  details_updated_latest: string | null;
};

export type AdminFulfillmentDetail = {
  auction_id: number;
  auction_title: string;
  auction_status: string;
  product_title: string;
  seller_id: number;
  seller_username: string;
  winner_id: number | null;
  winner_username: string | null;
  fulfillment_id: number | null;
  fulfillment_status: FulfillmentStatus;
  completed_step: number | null;
  submitted_at: string | null;
  fulfillment_created_at: string | null;
  fulfillment_updated_at: string | null;
  unlock_id: number | null;
  unlock_status: string | null;
  fee_amount: string | null;
  currency: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  unlocked_at: string | null;
  integrity_status: IntegrityStatus;
  integrity_issues: string[];
  notification_audit: NotificationAudit | null;
};

export type AdminFulfillmentSummary = {
  total_requiring_fulfillment: number;
  not_started: number;
  draft: number;
  completed_locked: number;
  unlocked: number;
  unlock_revenue: string;
  unlock_count: number;
  recent_unlocks_7d: number;
  disclosure: string;
};

/* ── PII Safety Documentation ─────────────────────────── */

/**
 * Fields that are NEVER present in admin fulfillment API responses.
 * This is enforced server-side by dedicated Admin serializers.
 * Listed here for documentation and testing purposes.
 */
export const ADMIN_EXCLUDED_PII_FIELDS = [
  'phone',
  'email',
  'full_name',
  'address_line',
  'area',
  'district',
  'division',
  'postal_code',
  'delivery_note',
] as const;

/* ── Filter Options ───────────────────────────────────── */

export const FULFILLMENT_FILTER_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'NOT_STARTED', label: 'Not Started' },
  { value: 'DRAFT', label: 'In Progress' },
  { value: 'COMPLETED_LOCKED', label: 'Ready to Unlock' },
  { value: 'UNLOCKED', label: 'Unlocked' },
] as const;

export const UNLOCK_FILTER_OPTIONS = [
  { value: '', label: 'All Unlock States' },
  { value: 'PAID', label: 'Paid' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'FAILED', label: 'Failed' },
] as const;

/* ── Money Formatting ─────────────────────────────────── */

export function formatFulfillmentMoney(
  value: string | null | undefined,
): string {
  if (!value || value === '0.00') return `৳0.00`;
  return `৳${value}`;
}
