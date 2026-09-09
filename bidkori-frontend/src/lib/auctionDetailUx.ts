/**
 * Pure Auction detail presentation helpers (AUC-F11).
 * Display-only — never invent CLOSED/winner or replace BidService authority.
 */

import { formatAuctionMoney } from './auctionDisplay.ts';
import { parseTimestampMs } from './auctionTime.ts';
import type { Auction, UserBid } from './types.ts';

export type AuctionDisplayState =
  | 'UPCOMING'
  | 'LIVE'
  | 'FINALIZING'
  | 'CLOSED'
  | 'CANCELLED';

export type AuctionViewerBidState =
  | 'anonymous'
  | 'owner'
  | 'not_bid_yet'
  | 'highest'
  | 'outbid'
  | 'won'
  | 'did_not_win'
  | 'cancelled'
  | 'ended_no_personal'
  | 'finalizing';

export type AuctionReservePresentation =
  | { kind: 'none' }
  | { kind: 'met'; label: string }
  | { kind: 'unmet'; label: string }
  | { kind: 'closed_unmet'; label: string };

export function getAuctionDisplayState(input: {
  status?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  nowMs: number;
}): AuctionDisplayState {
  const status = (input.status ?? '').toUpperCase();
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status === 'CLOSED') return 'CLOSED';

  const startMs = parseTimestampMs(input.startTime);
  const endMs = parseTimestampMs(input.endTime);
  const now = Number.isFinite(input.nowMs) ? input.nowMs : 0;

  if (status === 'ACTIVE' || !status) {
    if (endMs != null && now >= endMs) return 'FINALIZING';
    if (startMs != null && now < startMs) return 'UPCOMING';
    return 'LIVE';
  }

  // Unknown backend status — fail closed toward non-live presentation.
  if (endMs != null && now >= endMs) return 'FINALIZING';
  return 'LIVE';
}

export function getAuctionDisplayStateLabel(state: AuctionDisplayState): string {
  switch (state) {
    case 'UPCOMING':
      return 'Upcoming';
    case 'LIVE':
      return 'Live';
    case 'FINALIZING':
      return 'Finalizing';
    case 'CLOSED':
      return 'Closed';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

export function auctionHasBids(
  auction: Pick<Auction, 'bid_count' | 'recent_bids'>,
): boolean {
  if (typeof auction.bid_count === 'number' && Number.isFinite(auction.bid_count)) {
    return auction.bid_count > 0;
  }
  if (Array.isArray(auction.recent_bids)) {
    return auction.recent_bids.length > 0;
  }
  return false;
}

export function getAuctionStartingBidAmount(
  auction: Pick<Auction, 'starting_bid'>,
): number | null {
  const starting = Number(auction.starting_bid);
  return Number.isFinite(starting) ? starting : null;
}

export function getAuctionCurrentBidAmount(
  auction: Pick<
    Auction,
    'current_highest_bid' | 'starting_bid' | 'bid_count' | 'recent_bids'
  >,
): number | null {
  if (!auctionHasBids(auction)) return null;
  const current = Number(auction.current_highest_bid);
  if (Number.isFinite(current) && current > 0) return current;
  return getAuctionStartingBidAmount(auction);
}

/**
 * Next amount a new bid must reach (informational). Backend remains authority.
 * Mirrors BidService: beat current high (or starting when no bids) by min_increment.
 */
export function getNextValidBidAmount(
  auction: Pick<
    Auction,
    | 'starting_bid'
    | 'current_highest_bid'
    | 'min_increment'
    | 'bid_count'
    | 'recent_bids'
  >,
): number | null {
  const increment = Number(auction.min_increment);
  if (!Number.isFinite(increment) || increment <= 0) return null;

  const starting = getAuctionStartingBidAmount(auction);
  if (starting == null) return null;

  if (!auctionHasBids(auction)) {
    return starting + increment;
  }

  const current = Number(auction.current_highest_bid);
  const toBeat = Number.isFinite(current) && current > 0 ? current : starting;
  return toBeat + increment;
}

export function getAuctionReservePresentation(
  auction: Pick<Auction, 'has_reserve' | 'reserve_met' | 'status'>,
): AuctionReservePresentation {
  if (auction.has_reserve !== true) {
    return { kind: 'none' };
  }

  const status = (auction.status ?? '').toUpperCase();
  const met = auction.reserve_met === true;

  if (status === 'CLOSED' && !met) {
    return {
      kind: 'closed_unmet',
      label:
        'Auction ended without a winner because the reserve was not met.',
    };
  }

  if (met) {
    return { kind: 'met', label: 'Reserve met' };
  }

  return { kind: 'unmet', label: 'Reserve not yet met' };
}

export function getClosedNoWinnerLabel(
  auction: Pick<Auction, 'has_reserve' | 'reserve_met' | 'winning_bidder'>,
): string {
  if (auction.winning_bidder != null) return '';
  if (auction.has_reserve === true && auction.reserve_met === false) {
    return 'Auction ended without a winner because the reserve was not met.';
  }
  return 'Auction ended with no winner.';
}

export function getAuctionViewerBidState(input: {
  auction: Auction;
  isAuthenticated: boolean;
  isOwner: boolean;
  userId?: number | null;
  myHighestBidAmount?: number | null;
  displayState: AuctionDisplayState;
}): AuctionViewerBidState {
  const { auction, isAuthenticated, isOwner, userId, displayState } = input;

  if (!isAuthenticated) return 'anonymous';
  if (isOwner) return 'owner';

  if (displayState === 'CANCELLED') return 'cancelled';

  const myAmount =
    typeof input.myHighestBidAmount === 'number' &&
    Number.isFinite(input.myHighestBidAmount)
      ? input.myHighestBidAmount
      : null;
  const hasPersonalBid = myAmount != null && myAmount > 0;

  if (displayState === 'CLOSED') {
    if (userId != null && auction.winning_bidder === userId) return 'won';
    if (hasPersonalBid) return 'did_not_win';
    return 'ended_no_personal';
  }

  if (displayState === 'FINALIZING') {
    return 'finalizing';
  }

  if (!hasPersonalBid) return 'not_bid_yet';

  const current = getAuctionCurrentBidAmount(auction);
  if (current == null) return 'not_bid_yet';
  if (myAmount! >= current) return 'highest';
  return 'outbid';
}

export function getAuctionViewerBidStateLabel(
  state: AuctionViewerBidState,
): string | null {
  switch (state) {
    case 'anonymous':
      return null;
    case 'owner':
      return 'This is your listing';
    case 'not_bid_yet':
      return 'You have not bid yet';
    case 'highest':
      return 'You are currently the highest bidder';
    case 'outbid':
      return 'You have been outbid';
    case 'won':
      return 'You won this auction';
    case 'did_not_win':
      return 'Auction ended — you did not win';
    case 'cancelled':
      return 'This auction was cancelled';
    case 'ended_no_personal':
      return 'Auction ended';
    case 'finalizing':
      return 'Finalizing auction…';
  }
}

export function getPlaceBidErrorMessage(
  error: unknown,
  fallback = 'Could not place bid. Please try again.',
): string {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  const data = (error as { response?: { data?: Record<string, unknown> } })
    ?.response?.data;
  let apiMessage = '';
  if (data) {
    if (typeof data.error === 'string') apiMessage = data.error;
    else if (typeof data.detail === 'string') apiMessage = data.detail;
    else if (data.error && typeof data.error === 'object') {
      for (const value of Object.values(
        data.error as Record<string, unknown>,
      )) {
        if (typeof value === 'string' && value.trim()) {
          apiMessage = value;
          break;
        }
        if (Array.isArray(value) && typeof value[0] === 'string') {
          apiMessage = value[0];
          break;
        }
      }
    }
  }
  const lower = apiMessage.toLowerCase();

  if (status === 401) return 'Please log in to place a bid.';
  if (status === 429) {
    return 'Too many bids. Please wait a minute and try again.';
  }
  if (status === 403) {
    return apiMessage || 'You are not allowed to bid on this auction.';
  }
  if (status === 404) {
    return 'Auction not found or unavailable.';
  }
  if (status === 400) {
    if (lower.includes('own')) {
      return 'You cannot bid on your own auction.';
    }
    if (lower.includes('not available') || lower.includes('hidden')) {
      return 'This auction is not available for bidding.';
    }
    if (lower.includes('cancelled')) {
      return 'This auction was cancelled.';
    }
    if (
      lower.includes('closed') ||
      lower.includes('ended') ||
      lower.includes('expir')
    ) {
      return 'This auction has ended.';
    }
    if (lower.includes('not started') || lower.includes('before start')) {
      return 'This auction has not started yet.';
    }
    if (
      lower.includes('increment') ||
      lower.includes('higher') ||
      lower.includes('at least')
    ) {
      return (
        apiMessage ||
        'Bid too low. Your amount must beat the current highest bid plus the minimum increment.'
      );
    }
    return (
      apiMessage ||
      'Bid too low. Your amount must beat the current highest bid plus the minimum increment.'
    );
  }

  return apiMessage || fallback;
}

export function formatBidHistoryEmptyLabel(): string {
  return 'No bids yet.';
}

/** Newest-first for display when API returns highest-first by amount. */
export function sortBidsNewestFirst(bids: readonly UserBid[]): UserBid[] {
  return bids.slice().sort((a, b) => {
    const ta = parseTimestampMs(a.timestamp) ?? 0;
    const tb = parseTimestampMs(b.timestamp) ?? 0;
    if (tb !== ta) return tb - ta;
    return Number(b.id) - Number(a.id);
  });
}

export function prependRealtimeBidToHistory(
  history: readonly UserBid[] | undefined,
  bid: {
    id: number;
    amount: string | number;
    bidder_username?: string;
    timestamp?: string;
  },
  auctionId: number | string,
): UserBid[] {
  const existing = history ?? [];
  if (existing.some((row) => row.id === bid.id)) {
    return [...existing];
  }
  const row: UserBid = {
    id: bid.id,
    auction: Number(auctionId),
    amount: bid.amount,
    bidder_username: bid.bidder_username,
    timestamp: bid.timestamp,
  };
  return sortBidsNewestFirst([row, ...existing]);
}

export function formatAuctionDetailMoney(
  amount: number | null | undefined,
): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return formatAuctionMoney(amount);
}

export function myHighestBidAmountForAuction(
  bids: readonly UserBid[] | undefined,
  auctionId: number | string,
): number | null {
  if (!bids?.length) return null;
  let max: number | null = null;
  for (const bid of bids) {
    const aid =
      typeof bid.auction === 'object' && bid.auction
        ? bid.auction.id
        : bid.auction;
    if (Number(aid) !== Number(auctionId)) continue;
    const amount = Number(bid.amount);
    if (!Number.isFinite(amount)) continue;
    if (max == null || amount > max) max = amount;
  }
  return max;
}
