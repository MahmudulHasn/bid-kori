import type { Auction, UserBid } from './types.ts';

export const MY_BIDS_API_PATH = '/auctions/my-bids/';
export const RECENT_BUYER_ACTIVITY_LIMIT = 4;
export const WON_AUCTION_PREVIEW_LIMIT = 4;

/** Extract the auction PK from a my-bids row (ID or nested object). */
export function getBidAuctionId(bid: UserBid): number | null {
  if (typeof bid.auction === 'number' && Number.isFinite(bid.auction)) {
    return bid.auction;
  }
  if (bid.auction && typeof bid.auction === 'object' && Number.isFinite(bid.auction.id)) {
    return bid.auction.id;
  }
  return null;
}

function bidRecencyValue(bid: UserBid): number {
  if (bid.timestamp) {
    const ms = new Date(bid.timestamp).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  return bid.id;
}

/**
 * Distinct auction IDs from a bid list, in first-seen order.
 * Repeated bids on the same auction count once.
 */
export function getDistinctBidAuctionIds(bids: readonly UserBid[]): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const bid of bids) {
    const auctionId = getBidAuctionId(bid);
    if (auctionId == null || seen.has(auctionId)) continue;
    seen.add(auctionId);
    ids.push(auctionId);
  }
  return ids;
}

export function indexAuctionsById(
  auctions: readonly Auction[],
): Map<number, Auction> {
  const map = new Map<number, Auction>();
  for (const auction of auctions) {
    map.set(auction.id, auction);
  }
  return map;
}

function winningBidderId(auction: Auction): number | null {
  if (auction.winning_bidder == null) return null;
  const id = Number(auction.winning_bidder);
  return Number.isFinite(id) ? id : null;
}

/**
 * CLOSED auctions whose winning_bidder matches the buyer.
 * Does not mutate the source array.
 */
export function getBuyerWonAuctions(
  auctions: readonly Auction[],
  userId: number,
): Auction[] {
  return auctions
    .filter(
      (auction) =>
        auction.status === 'CLOSED' && winningBidderId(auction) === userId,
    )
    .slice()
    .sort((a, b) => {
      const aMs = a.end_time ? new Date(a.end_time).getTime() : 0;
      const bMs = b.end_time ? new Date(b.end_time).getTime() : 0;
      if (aMs !== bMs) return bMs - aMs;
      return b.id - a.id;
    });
}

/**
 * Won, unpaid auctions that still need checkout.
 * `is_paid === true` is excluded; missing/false is treated as unpaid.
 */
export function getPendingCheckoutAuctions(
  auctions: readonly Auction[],
  userId: number,
): Auction[] {
  return getBuyerWonAuctions(auctions, userId).filter(
    (auction) => auction.is_paid !== true,
  );
}

/**
 * Distinct auctions the buyer has bid on, newest bid first.
 * Auctions missing from `auctionsById` are skipped (join limitation).
 */
export function getRecentBuyerAuctions(
  bids: readonly UserBid[],
  auctionsById: ReadonlyMap<number, Auction>,
  limit: number = RECENT_BUYER_ACTIVITY_LIMIT,
): Auction[] {
  const latestBidByAuction = new Map<number, UserBid>();

  for (const bid of bids) {
    const auctionId = getBidAuctionId(bid);
    if (auctionId == null) continue;
    const existing = latestBidByAuction.get(auctionId);
    if (!existing || bidRecencyValue(bid) > bidRecencyValue(existing)) {
      latestBidByAuction.set(auctionId, bid);
    }
  }

  return [...latestBidByAuction.entries()]
    .sort((a, b) => {
      const recency = bidRecencyValue(b[1]) - bidRecencyValue(a[1]);
      if (recency !== 0) return recency;
      return b[1].id - a[1].id;
    })
    .map(([auctionId]) => auctionsById.get(auctionId))
    .filter((auction): auction is Auction => Boolean(auction))
    .slice(0, Math.max(0, limit));
}

export type BuyerDashboardMetrics = {
  auctionsBidOn: number;
  wonAuctions: number;
  pendingCheckout: number;
};

export function getBuyerDashboardMetrics(
  bids: readonly UserBid[],
  auctions: readonly Auction[],
  userId: number,
): BuyerDashboardMetrics {
  return {
    auctionsBidOn: getDistinctBidAuctionIds(bids).length,
    wonAuctions: getBuyerWonAuctions(auctions, userId).length,
    pendingCheckout: getPendingCheckoutAuctions(auctions, userId).length,
  };
}
