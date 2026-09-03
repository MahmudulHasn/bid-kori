import type { AuthUser, Auction, AuctionProduct } from '@/lib/types';

/**
 * UX ownership check only — backend object permissions remain authoritative.
 * Returns false when user or seller id is unavailable (fail closed for controls).
 */
export function isAuctionOwnedByUser(
  auction: Auction | null | undefined,
  user: Pick<AuthUser, 'id'> | null | undefined,
): boolean {
  if (!auction || !user) return false;
  if (!auction.product || typeof auction.product !== 'object') return false;
  const sellerId = (auction.product as AuctionProduct).seller;
  if (sellerId == null || sellerId === '') return false;
  return Number(sellerId) === Number(user.id);
}
