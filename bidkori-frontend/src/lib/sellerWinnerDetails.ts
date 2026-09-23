import type {
  SellerUnlockedWinnerDetails,
  SellerWinnerDetailsStatus,
  WinnerFulfillmentStatus,
} from './types.ts';

export function buildSellerWinnerDetailsStatusPath(auctionId: number): string {
  return `/seller/auctions/${auctionId}/winner-details/status/`;
}

export function buildSellerWinnerDetailsUnlockPath(auctionId: number): string {
  return `/seller/auctions/${auctionId}/winner-details/unlock/`;
}

export function buildSellerWinnerDetailsPath(auctionId: number): string {
  return `/seller/auctions/${auctionId}/winner-details/`;
}

export function formatUnlockFee(
  fee: string | number | null | undefined,
  currency = 'BDT',
): string {
  if (fee == null || fee === '') return '৳0.00';
  const num = typeof fee === 'number' ? fee : Number(fee);
  if (!Number.isFinite(num)) return `৳${fee}`;
  const formatted = num.toFixed(2);
  if (currency === 'BDT') {
    return `৳${formatted}`;
  }
  return `${currency} ${formatted}`;
}

export function isWinnerDetailsWaitingForBuyer(
  status: SellerWinnerDetailsStatus | null | undefined,
): boolean {
  if (!status || !status.winner_exists) return false;
  return status.details_status === 'NOT_STARTED';
}

export function isWinnerDetailsInProgress(
  status: SellerWinnerDetailsStatus | null | undefined,
): boolean {
  if (!status || !status.winner_exists) return false;
  return status.details_status === 'DRAFT';
}

export function canUnlockWinnerDetails(
  status: SellerWinnerDetailsStatus | null | undefined,
): boolean {
  if (!status) return false;
  return status.can_unlock && !status.is_unlocked;
}

export function isWinnerDetailsUnlocked(
  status: SellerWinnerDetailsStatus | null | undefined,
): boolean {
  if (!status) return false;
  return status.is_unlocked;
}

export function normalizeSellerWinnerDetailsStatus(
  raw: unknown,
): SellerWinnerDetailsStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const auctionId = Number(d.auction_id);
  if (!Number.isFinite(auctionId) || auctionId < 1) return null;

  return {
    auction_id: auctionId,
    winner_exists: Boolean(d.winner_exists),
    details_status: (typeof d.details_status === 'string'
      ? d.details_status
      : 'NOT_STARTED') as WinnerFulfillmentStatus,
    can_unlock: Boolean(d.can_unlock),
    is_unlocked: Boolean(d.is_unlocked),
    unlock_fee:
      typeof d.unlock_fee === 'string'
        ? d.unlock_fee
        : d.unlock_fee != null
          ? String(d.unlock_fee)
          : '0.00',
    unlock_fee_percent:
      typeof d.unlock_fee_percent === 'string'
        ? d.unlock_fee_percent
        : d.unlock_fee_percent != null
          ? String(d.unlock_fee_percent)
          : '2.00',
    total_amount:
      typeof d.total_amount === 'string'
        ? d.total_amount
        : d.total_amount != null
          ? String(d.total_amount)
          : undefined,
    currency: typeof d.currency === 'string' ? d.currency : 'BDT',
  };
}

export function normalizeSellerUnlockedWinnerDetails(
  raw: unknown,
): SellerUnlockedWinnerDetails | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const auctionId = Number(d.auction_id);
  if (!Number.isFinite(auctionId) || auctionId < 1) return null;

  return {
    auction_id: auctionId,
    buyer_username: typeof d.buyer_username === 'string' ? d.buyer_username : '—',
    full_name: typeof d.full_name === 'string' ? d.full_name : '',
    phone: typeof d.phone === 'string' ? d.phone : '',
    email:
      typeof d.email === 'string' && d.email.trim() !== ''
        ? d.email.trim()
        : undefined,
    address_line: typeof d.address_line === 'string' ? d.address_line : '',
    area: typeof d.area === 'string' ? d.area : '',
    district: typeof d.district === 'string' ? d.district : '',
    division: typeof d.division === 'string' ? d.division : '',
    postal_code:
      typeof d.postal_code === 'string' && d.postal_code.trim() !== ''
        ? d.postal_code.trim()
        : undefined,
    preferred_contact_method:
      d.preferred_contact_method === 'EMAIL' ? 'EMAIL' : 'PHONE',
    delivery_note:
      typeof d.delivery_note === 'string' && d.delivery_note.trim() !== ''
        ? d.delivery_note.trim()
        : undefined,
    status: (typeof d.status === 'string' ? d.status : 'COMPLETED') as WinnerFulfillmentStatus,
    submitted_at: typeof d.submitted_at === 'string' ? d.submitted_at : null,
    created_at: typeof d.created_at === 'string' ? d.created_at : null,
    updated_at: typeof d.updated_at === 'string' ? d.updated_at : null,
  };
}
