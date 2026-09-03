import { isAuctionOwnedByUser } from './auctionOwnership.ts';
import type { Auction, Product } from './types.ts';

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
  return getSellerAuctions(auctions, userId)
    .slice()
    .sort((a, b) => {
      const startDiff = timestampMs(b.start_time) - timestampMs(a.start_time);
      if (startDiff !== 0) return startDiff;
      return b.id - a.id;
    })
    .slice(0, Math.max(0, limit));
}

export function getRecentSellerProducts(
  products: readonly Product[],
  limit: number = RECENT_SELLER_PRODUCTS_LIMIT,
): Product[] {
  return products
    .slice()
    .sort((a, b) => {
      const createdDiff = timestampMs(b.created_at) - timestampMs(a.created_at);
      if (createdDiff !== 0) return createdDiff;
      return b.id - a.id;
    })
    .slice(0, Math.max(0, limit));
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
