import type { Auction, UserBid } from './types.ts';

export const MY_BIDS_API_PATH = '/auctions/my-bids/';
export const BUYER_WON_PATH = '/buyer/won';
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
 * Sort won auctions by end_time descending (missing dates last among ties by id).
 * Does not mutate the source array.
 */
export function sortWonAuctions(auctions: readonly Auction[]): Auction[] {
  return auctions.slice().sort((a, b) => {
    const aMs = a.end_time ? new Date(a.end_time).getTime() : 0;
    const bMs = b.end_time ? new Date(b.end_time).getTime() : 0;
    const aValid = !Number.isNaN(aMs);
    const bValid = !Number.isNaN(bMs);
    if (aValid && bValid && aMs !== bMs) return bMs - aMs;
    if (aValid !== bValid) return aValid ? -1 : 1;
    return b.id - a.id;
  });
}

/**
 * CLOSED auctions whose winning_bidder matches the buyer.
 * Does not mutate the source array.
 */
export function getBuyerWonAuctions(
  auctions: readonly Auction[],
  userId: number,
): Auction[] {
  return sortWonAuctions(
    auctions.filter(
      (auction) =>
        auction.status === 'CLOSED' && winningBidderId(auction) === userId,
    ),
  );
}

/**
 * Auction list/detail serializers include `is_paid` as a boolean.
 * If the field is omitted, do not infer unpaid — treat as unknown.
 */
export type AuctionPaymentState = 'paid' | 'unpaid' | 'unknown';

export function getAuctionPaymentState(
  auction: Pick<Auction, 'is_paid'>,
): AuctionPaymentState {
  if (auction.is_paid === true) return 'paid';
  if (auction.is_paid === false) return 'unpaid';
  return 'unknown';
}

export type BuyerWonFilter = 'all' | 'awaiting_checkout' | 'paid';

export function matchesBuyerWonFilter(
  auction: Pick<Auction, 'is_paid'>,
  filter: BuyerWonFilter,
): boolean {
  const payment = getAuctionPaymentState(auction);
  switch (filter) {
    case 'all':
      return true;
    case 'awaiting_checkout':
      return payment === 'unpaid';
    case 'paid':
      return payment === 'paid';
  }
}

/**
 * Won auctions with explicit `is_paid === false`.
 * Omitted `is_paid` is not treated as unpaid.
 */
export function getUnpaidWonAuctions(
  auctions: readonly Auction[],
  userId: number,
): Auction[] {
  return getBuyerWonAuctions(auctions, userId).filter(
    (auction) => getAuctionPaymentState(auction) === 'unpaid',
  );
}

/**
 * Won, unpaid auctions that still need checkout.
 * Only `is_paid === false` counts; missing is unknown, not pending.
 */
export function getPendingCheckoutAuctions(
  auctions: readonly Auction[],
  userId: number,
): Auction[] {
  return getUnpaidWonAuctions(auctions, userId);
}

/** Optimistic list update after mock checkout (does not mutate source). */
export function withAuctionMarkedPaid(
  auctions: readonly Auction[],
  auctionId: number,
): Auction[] {
  return auctions.map((auction) =>
    auction.id === auctionId ? { ...auction, is_paid: true } : auction,
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

export function parseBidAmount(value: string | number | undefined): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

/** Groups the buyer's bids by auction id without mutating the source list. */
export function groupBuyerBidsByAuction(
  bids: readonly UserBid[],
): Map<number, UserBid[]> {
  const groups = new Map<number, UserBid[]>();
  for (const bid of bids) {
    const auctionId = getBidAuctionId(bid);
    if (auctionId == null) continue;
    const existing = groups.get(auctionId);
    if (existing) {
      existing.push(bid);
    } else {
      groups.set(auctionId, [bid]);
    }
  }
  return groups;
}

export function getBuyerHighestBid(bids: readonly UserBid[]): UserBid | null {
  if (bids.length === 0) return null;
  return bids.reduce((highest, bid) => {
    const highestAmount = parseBidAmount(highest.amount);
    const amount = parseBidAmount(bid.amount);
    if (amount > highestAmount) return bid;
    if (amount === highestAmount && bid.id > highest.id) return bid;
    return highest;
  });
}

export function getBuyerLatestBid(bids: readonly UserBid[]): UserBid | null {
  if (bids.length === 0) return null;
  return bids.reduce((latest, bid) => {
    const recency = bidRecencyValue(bid) - bidRecencyValue(latest);
    if (recency > 0) return bid;
    if (recency === 0 && bid.id > latest.id) return bid;
    return latest;
  });
}

export type BuyerBidActivityStatus =
  | 'currently_highest'
  | 'outbid'
  | 'awaiting_finalization'
  | 'won'
  | 'lost'
  | 'cancelled'
  | 'unresolved';

export type BuyerMyBidsFilter = 'all' | 'active' | 'won' | 'ended';

export type BuyerAuctionBidActivity = {
  auctionId: number;
  auction: Auction | null;
  bids: UserBid[];
  bidCount: number;
  highestBid: UserBid;
  latestBid: UserBid;
  myHighestAmount: number;
  currentHighestAmount: number | null;
  latestBidAt: string | null;
  status: BuyerBidActivityStatus;
  statusLabel: string;
};

export function getBuyerBidActivityStatusLabel(
  status: BuyerBidActivityStatus,
): string {
  switch (status) {
    case 'currently_highest':
      return 'Currently Highest';
    case 'outbid':
      return 'Outbid';
    case 'awaiting_finalization':
      return 'Awaiting finalization';
    case 'won':
      return 'Won';
    case 'lost':
      return 'Lost';
    case 'cancelled':
      return 'Cancelled';
    case 'unresolved':
      return 'Auction unavailable';
  }
}

function isPastEndTime(auction: Auction, nowMs: number): boolean {
  if (!auction.end_time) return false;
  const endMs = new Date(auction.end_time).getTime();
  return !Number.isNaN(endMs) && endMs <= nowMs;
}

/**
 * Display status for one auction the buyer bid on.
 * ACTIVE never uses winning_bidder. CLOSED uses winning_bidder only.
 */
export function getBuyerAuctionBidStatus(
  auction: Auction | null,
  myHighestAmount: number,
  userId: number,
  nowMs: number = Date.now(),
): BuyerBidActivityStatus {
  if (!auction) return 'unresolved';

  const status = auction.status?.toUpperCase();

  if (status === 'CANCELLED') return 'cancelled';

  if (status === 'CLOSED') {
    return winningBidderId(auction) === userId ? 'won' : 'lost';
  }

  if (status === 'ACTIVE' || !status) {
    if (isPastEndTime(auction, nowMs)) {
      return 'awaiting_finalization';
    }
    const current = parseBidAmount(auction.current_highest_bid);
    if (!Number.isFinite(Number(auction.current_highest_bid))) {
      return 'currently_highest';
    }
    if (myHighestAmount >= current) return 'currently_highest';
    if (myHighestAmount < current) return 'outbid';
  }

  return 'unresolved';
}

export function matchesBuyerMyBidsFilter(
  activity: Pick<BuyerAuctionBidActivity, 'status'>,
  filter: BuyerMyBidsFilter,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'active':
      return (
        activity.status === 'currently_highest' ||
        activity.status === 'outbid' ||
        activity.status === 'awaiting_finalization'
      );
    case 'won':
      return activity.status === 'won';
    case 'ended':
      return activity.status === 'lost' || activity.status === 'cancelled';
  }
}

/**
 * One activity row per auction the buyer bid on, newest buyer activity first.
 */
export function buildBuyerBidActivity(
  bids: readonly UserBid[],
  auctionsById: ReadonlyMap<number, Auction>,
  userId: number,
  nowMs: number = Date.now(),
): BuyerAuctionBidActivity[] {
  const groups = groupBuyerBidsByAuction(bids);
  const rows: BuyerAuctionBidActivity[] = [];

  for (const [auctionId, groupedBids] of groups) {
    const highestBid = getBuyerHighestBid(groupedBids);
    const latestBid = getBuyerLatestBid(groupedBids);
    if (!highestBid || !latestBid) continue;

    const auction = auctionsById.get(auctionId) ?? null;
    const myHighestAmount = parseBidAmount(highestBid.amount);
    const currentHighestAmount = auction
      ? parseBidAmount(auction.current_highest_bid)
      : null;
    const status = getBuyerAuctionBidStatus(
      auction,
      myHighestAmount,
      userId,
      nowMs,
    );

    rows.push({
      auctionId,
      auction,
      bids: groupedBids.slice().sort((a, b) => {
        const recency = bidRecencyValue(b) - bidRecencyValue(a);
        if (recency !== 0) return recency;
        return b.id - a.id;
      }),
      bidCount: groupedBids.length,
      highestBid,
      latestBid,
      myHighestAmount,
      currentHighestAmount,
      latestBidAt: latestBid.timestamp ?? null,
      status,
      statusLabel: getBuyerBidActivityStatusLabel(status),
    });
  }

  return rows.sort((a, b) => {
    const recency = bidRecencyValue(b.latestBid) - bidRecencyValue(a.latestBid);
    if (recency !== 0) return recency;
    if (b.latestBid.id !== a.latestBid.id) return b.latestBid.id - a.latestBid.id;
    return b.auctionId - a.auctionId;
  });
}
