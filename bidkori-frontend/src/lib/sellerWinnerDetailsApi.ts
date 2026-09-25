import api from './api';
import {
  buildSellerWinnerDetailsPath,
  buildSellerWinnerDetailsStatusPath,
  buildSellerWinnerDetailsUnlockPath,
  normalizeSellerUnlockedWinnerDetails,
  normalizeSellerWinnerDetailsStatus,
} from './sellerWinnerDetails';
import type {
  SellerUnlockedWinnerDetails,
  SellerWinnerDetailsStatus,
  WinnerDetailsUnlockResponse,
} from './types';

export * from './sellerWinnerDetails';

/** Fetch high-level readiness and unlock status (Zero PII). */
export async function fetchSellerWinnerDetailsStatus(
  auctionId: number,
): Promise<SellerWinnerDetailsStatus> {
  const { data } = await api.get<unknown>(
    buildSellerWinnerDetailsStatusPath(auctionId),
  );
  const normalized = normalizeSellerWinnerDetailsStatus(data);
  if (!normalized) {
    throw new Error('Invalid winner details status received from server.');
  }
  return normalized;
}

/** SWR fetcher for seller winner-details status. */
export async function sellerWinnerDetailsStatusFetcher(
  url: string,
): Promise<SellerWinnerDetailsStatus> {
  const { data } = await api.get<unknown>(url);
  const normalized = normalizeSellerWinnerDetailsStatus(data);
  if (!normalized) {
    throw new Error('Invalid winner details status received from server.');
  }
  return normalized;
}

/**
 * Initiate payment and unlock entitlement for the winning buyer's details.
 * Supports SSLCOMMERZ gateway (default) and mock payment.
 */
export async function unlockSellerWinnerDetails(
  auctionId: number,
  gateway: 'sslcommerz' | 'mock' = 'sslcommerz',
): Promise<WinnerDetailsUnlockResponse> {
  const { data } = await api.post<WinnerDetailsUnlockResponse>(
    buildSellerWinnerDetailsUnlockPath(auctionId),
    { gateway },
  );
  return data;
}

/** Fetch unlocked winner fulfillment details (requires active paid entitlement). */
export async function fetchSellerWinnerDetails(
  auctionId: number,
): Promise<SellerUnlockedWinnerDetails> {
  const { data } = await api.get<unknown>(
    buildSellerWinnerDetailsPath(auctionId),
  );
  const normalized = normalizeSellerUnlockedWinnerDetails(data);
  if (!normalized) {
    throw new Error('Invalid unlocked details received from server.');
  }
  return normalized;
}

/** SWR fetcher for unlocked winner details. */
export async function sellerUnlockedWinnerDetailsFetcher(
  url: string,
): Promise<SellerUnlockedWinnerDetails> {
  const { data } = await api.get<unknown>(url);
  const normalized = normalizeSellerUnlockedWinnerDetails(data);
  if (!normalized) {
    throw new Error('Invalid unlocked details received from server.');
  }
  return normalized;
}
