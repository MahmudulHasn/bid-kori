/**
 * Pure helpers for Auction detail live updates (Channels).
 * Supported receive events: `bid.accepted`, `auction.closed`, `auction.cancelled`.
 * WebSocket is receive-only — bids remain REST POST /place-bid/.
 */

import { getApiBaseUrl } from './config.ts';
import type { Auction } from './types.ts';

export const BID_ACCEPTED_EVENT_TYPE = 'bid.accepted' as const;
export const AUCTION_CLOSED_EVENT_TYPE = 'auction.closed' as const;
export const AUCTION_CANCELLED_EVENT_TYPE = 'auction.cancelled' as const;

export type BidAcceptedBidPayload = {
  id: number;
  amount: string;
  bidder_username: string;
  timestamp: string;
};

export type BidAcceptedEvent = {
  type: typeof BID_ACCEPTED_EVENT_TYPE;
  auction_id: number;
  bid: BidAcceptedBidPayload;
  current_highest_bid: string;
};

/** Public winner object from backend `build_auction_closed_payload`. */
export type AuctionClosedWinningBidder = {
  id: number;
  username: string;
};

/**
 * Exact public `auction.closed` payload from `auctions.realtime`.
 * `winning_bidder` is null when there were no bids or reserve was not met.
 */
export type AuctionClosedEvent = {
  type: typeof AUCTION_CLOSED_EVENT_TYPE;
  auction_id: number;
  status: 'CLOSED';
  current_highest_bid: string;
  winning_bidder: AuctionClosedWinningBidder | null;
  is_paid: boolean;
  closed_at: string;
};

/**
 * Exact public `auction.cancelled` payload from `auctions.realtime`.
 * No moderation_reason / actor identity on the wire.
 */
export type AuctionCancelledEvent = {
  type: typeof AUCTION_CANCELLED_EVENT_TYPE;
  auction_id: number;
  status: 'CANCELLED';
  winning_bidder: null;
  server_time: string;
};

export type AuctionRealtimeEvent =
  | BidAcceptedEvent
  | AuctionClosedEvent
  | AuctionCancelledEvent;

export type ApplyBidAcceptedResult = {
  auction: Auction | undefined;
  /** True when the event could not be applied safely — trigger REST revalidate. */
  revalidate: boolean;
  applied: boolean;
};

export type ApplyAuctionClosedResult = {
  auction: Auction | undefined;
  /** Always true after a matching close so REST can reconcile compact WS state. */
  revalidate: boolean;
  applied: boolean;
};

export type ApplyAuctionCancelledResult = {
  auction: Auction | undefined;
  revalidate: boolean;
  applied: boolean;
};

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Build `ws(s)://…/ws/auctions/<id>/` from the configured API base
 * (`NEXT_PUBLIC_API_BASE_URL`, typically `…/api`).
 */
export function buildAuctionWebSocketUrl(
  auctionId: number | string,
  apiBaseUrl: string = getApiBaseUrl(),
): string {
  const base = stripTrailingSlashes(apiBaseUrl.trim());
  const httpOrigin = base.replace(/\/api$/i, '');
  const origin =
    httpOrigin && httpOrigin !== base
      ? httpOrigin
      : stripTrailingSlashes(base);

  let wsOrigin = origin;
  if (/^https:/i.test(origin)) {
    wsOrigin = origin.replace(/^https:/i, 'wss:');
  } else if (/^http:/i.test(origin)) {
    wsOrigin = origin.replace(/^http:/i, 'ws:');
  }

  const id = encodeURIComponent(String(auctionId));
  return `${wsOrigin}/ws/auctions/${id}/`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isAuctionTerminalStatus(status: string | undefined): boolean {
  const normalized = String(status ?? '').toUpperCase();
  return normalized === 'CLOSED' || normalized === 'CANCELLED';
}

/** Runtime guard for backend `bid.accepted` WebSocket payloads. */
export function isBidAcceptedEvent(value: unknown): value is BidAcceptedEvent {
  if (!isRecord(value)) return false;
  if (value.type !== BID_ACCEPTED_EVENT_TYPE) return false;
  if (!isFiniteNumber(value.auction_id)) return false;
  if (!isNonEmptyString(value.current_highest_bid)) return false;
  if (!isRecord(value.bid)) return false;
  if (!isFiniteNumber(value.bid.id)) return false;
  if (!isNonEmptyString(value.bid.amount)) return false;
  if (typeof value.bid.bidder_username !== 'string') return false;
  if (typeof value.bid.timestamp !== 'string') return false;
  return true;
}

function isAuctionClosedWinningBidder(
  value: unknown,
): value is AuctionClosedWinningBidder {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.id)) return false;
  if (typeof value.username !== 'string') return false;
  return true;
}

/** Runtime guard for backend `auction.closed` WebSocket payloads. */
export function isAuctionClosedEvent(
  value: unknown,
): value is AuctionClosedEvent {
  if (!isRecord(value)) return false;
  if (value.type !== AUCTION_CLOSED_EVENT_TYPE) return false;
  if (!isFiniteNumber(value.auction_id)) return false;
  if (value.status !== 'CLOSED') return false;
  if (!isNonEmptyString(value.current_highest_bid)) return false;
  if (
    value.winning_bidder !== null &&
    !isAuctionClosedWinningBidder(value.winning_bidder)
  ) {
    return false;
  }
  if (typeof value.is_paid !== 'boolean') return false;
  if (typeof value.closed_at !== 'string') return false;
  return true;
}

/** Runtime guard for backend `auction.cancelled` WebSocket payloads. */
export function isAuctionCancelledEvent(
  value: unknown,
): value is AuctionCancelledEvent {
  if (!isRecord(value)) return false;
  if (value.type !== AUCTION_CANCELLED_EVENT_TYPE) return false;
  if (!isFiniteNumber(value.auction_id)) return false;
  if (value.status !== 'CANCELLED') return false;
  if (value.winning_bidder !== null) return false;
  if (typeof value.server_time !== 'string' || value.server_time.length === 0) {
    return false;
  }
  return true;
}

export function eventMatchesAuctionId(
  event: Pick<AuctionRealtimeEvent, 'auction_id'>,
  auctionId: number | string,
): boolean {
  return Number(event.auction_id) === Number(auctionId);
}

/**
 * Decimal-safe money comparison without floating point.
 * Returns null when either value is not a plain decimal number string/number.
 */
export function compareMoneyAmounts(
  left: string | number,
  right: string | number,
): number | null {
  const a = moneyToScaledInteger(left);
  const b = moneyToScaledInteger(right);
  if (a === null || b === null) return null;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function moneyToScaledInteger(value: string | number): bigint | null {
  const raw = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    return null;
  }
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholePart, fractionPart = ''] = unsigned.split('.');
  const whole = wholePart === '' ? '0' : wholePart;
  // Normalize to 4 fractional digits for stable ordering of money-like values.
  const frac = `${fractionPart}0000`.slice(0, 4);
  const scaled = BigInt(whole) * BigInt(10000) + BigInt(frac);
  return negative ? -scaled : scaled;
}

/**
 * Apply a validated `bid.accepted` event to Auction SWR cache data.
 * Does not mutate `auction`. Ignores wrong auction IDs and stale lower prices.
 * Once CLOSED/CANCELLED, bid events never reopen the auction.
 */
export function applyBidAcceptedToAuction(
  auction: Auction | undefined,
  event: BidAcceptedEvent,
  auctionId: number | string,
): ApplyBidAcceptedResult {
  if (!auction) {
    return { auction, revalidate: false, applied: false };
  }
  if (!eventMatchesAuctionId(event, auctionId)) {
    return { auction, revalidate: false, applied: false };
  }
  if (Number(auction.id) !== Number(auctionId)) {
    return { auction, revalidate: false, applied: false };
  }

  if (isAuctionTerminalStatus(auction.status)) {
    // Stale bid after close — do not regress final state; reconcile via REST.
    return { auction, revalidate: true, applied: false };
  }

  const current = auction.current_highest_bid;
  const cmp = compareMoneyAmounts(event.current_highest_bid, current ?? 0);
  if (cmp === null) {
    return { auction, revalidate: true, applied: false };
  }
  if (cmp < 0) {
    // Stale / out-of-order lower price — do not regress UI.
    return { auction, revalidate: false, applied: false };
  }
  if (cmp === 0) {
    // Idempotent same amount (local bidder may see REST mutate + WS echo).
    return { auction, revalidate: false, applied: false };
  }

  return {
    auction: {
      ...auction,
      current_highest_bid: event.current_highest_bid,
    },
    revalidate: false,
    applied: true,
  };
}

/**
 * Apply a validated `auction.closed` event to Auction SWR cache data.
 * Maps WS winner `{ id, username }` into REST Auction fields without inventing
 * reserve or private contact data. Does not mutate `auction`.
 */
export function applyAuctionClosedToAuction(
  auction: Auction | undefined,
  event: AuctionClosedEvent,
  auctionId: number | string,
): ApplyAuctionClosedResult {
  if (!auction) {
    return { auction, revalidate: true, applied: false };
  }
  if (!eventMatchesAuctionId(event, auctionId)) {
    return { auction, revalidate: false, applied: false };
  }
  if (Number(auction.id) !== Number(auctionId)) {
    return { auction, revalidate: false, applied: false };
  }

  // CANCELLED is terminal — never rewrite to CLOSED / invent a winner.
  if (String(auction.status ?? '').toUpperCase() === 'CANCELLED') {
    return { auction, revalidate: true, applied: false };
  }

  const winner = event.winning_bidder;
  const next: Auction = {
    ...auction,
    status: 'CLOSED',
    current_highest_bid: event.current_highest_bid,
    winning_bidder: winner ? winner.id : null,
    winning_bidder_username: winner
      ? winner.username.trim() || null
      : null,
    is_paid: event.is_paid,
  };

  return {
    auction: next,
    revalidate: true,
    applied: true,
  };
}

/**
 * Apply a validated `auction.cancelled` event to Auction SWR cache data.
 * Clears winner; never invents moderation reason. Does not mutate `auction`.
 */
export function applyAuctionCancelledToAuction(
  auction: Auction | undefined,
  event: AuctionCancelledEvent,
  auctionId: number | string,
): ApplyAuctionCancelledResult {
  if (!auction) {
    return { auction, revalidate: true, applied: false };
  }
  if (!eventMatchesAuctionId(event, auctionId)) {
    return { auction, revalidate: false, applied: false };
  }
  if (Number(auction.id) !== Number(auctionId)) {
    return { auction, revalidate: false, applied: false };
  }

  const next: Auction = {
    ...auction,
    status: 'CANCELLED',
    winning_bidder: null,
    winning_bidder_username: null,
    server_time: event.server_time,
  };

  return {
    auction: next,
    revalidate: true,
    applied: true,
  };
}

/** Parse WebSocket text safely; returns null on invalid JSON. */
export function parseWebSocketJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
