import api from '@/lib/api';
import { MY_BIDS_API_PATH } from '@/lib/buyer';
import { buildAuctionDetailApiPath, buildCheckoutApiPath } from '@/lib/checkoutApi';
import { ACTIVE_AUCTIONS_API_PATH, buildAuctionSearchApiPath } from '@/lib/marketplace';
import type { Auction, PaymentSummary, UserBid } from '@/lib/types';

export {
  AUCTIONS_LIST_API_PATH,
  buildAuctionDetailApiPath,
  buildCheckoutApiPath,
  isCheckoutAlreadyPaidError,
} from '@/lib/checkoutApi';

/**
 * Normalize list/search/active payloads into a flat auction array.
 * DRF may return a bare list or a paginated `{ results }` object.
 */
export function unwrapAuctionList(data: unknown): Auction[] {
  if (Array.isArray(data)) {
    return data as Auction[];
  }
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { results?: unknown }).results)
  ) {
    return (data as { results: Auction[] }).results;
  }
  return [];
}

export async function fetchActiveAuctions(): Promise<Auction[]> {
  const { data } = await api.get<unknown>(ACTIVE_AUCTIONS_API_PATH);
  return unwrapAuctionList(data);
}

export async function searchAuctions(query: string): Promise<Auction[]> {
  const path = buildAuctionSearchApiPath(query);
  if (!path) {
    return [];
  }
  const { data } = await api.get<unknown>(path);
  return unwrapAuctionList(data);
}

export async function fetchAuction(id: string | number): Promise<Auction> {
  const { data } = await api.get<Auction>(buildAuctionDetailApiPath(id));
  return data;
}

/** SWR-compatible fetcher for `/auctions/<id>/`. */
export async function auctionDetailFetcher(url: string): Promise<Auction> {
  const { data } = await api.get<Auction>(url);
  return data;
}

/** SWR-compatible fetcher that always returns Auction[]. */
export async function auctionListFetcher(url: string): Promise<Auction[]> {
  const { data } = await api.get<unknown>(url);
  return unwrapAuctionList(data);
}

export function unwrapBidList(data: unknown): UserBid[] {
  if (Array.isArray(data)) {
    return data as UserBid[];
  }
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { results?: unknown }).results)
  ) {
    return (data as { results: UserBid[] }).results;
  }
  return [];
}

export async function fetchMyBids(): Promise<UserBid[]> {
  const { data } = await api.get<unknown>(MY_BIDS_API_PATH);
  return unwrapBidList(data);
}

/** SWR-compatible fetcher for `/auctions/my-bids/`. */
export async function myBidsFetcher(url: string): Promise<UserBid[]> {
  const { data } = await api.get<unknown>(url);
  return unwrapBidList(data);
}

/**
 * Mock checkout for a CLOSED auction winner.
 * Sends no payment payload — the backend creates a completed Payment row.
 */
export async function checkoutAuction(
  auctionId: string | number,
): Promise<PaymentSummary> {
  const { data } = await api.post<PaymentSummary>(
    buildCheckoutApiPath(auctionId),
  );
  return data;
}
