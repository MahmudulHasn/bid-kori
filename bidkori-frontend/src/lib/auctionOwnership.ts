import type { AuthUser } from '@/context/AuthContext';
import type { Auction } from '@/lib/types';

/**
 * UX ownership check only — backend object permissions remain authoritative.
 * Returns false when user or seller id is unavailable (fail closed for controls).
 */
export function isAuctionOwnedByUser(
  auction: Auction | null | undefined,
  user: Pick<AuthUser, 'id'> | null | undefined,
): boolean {
  if (!auction || !user) return false;
  const sellerId = auction.product?.seller;
  if (sellerId == null || sellerId === '') return false;
  return Number(sellerId) === Number(user.id);
}
