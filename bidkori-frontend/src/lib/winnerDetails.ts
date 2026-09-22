import api from './api';
import type { WinnerFulfillmentDetails } from './types';
import {
  buildWinnerDetailsApiPath,
  buildWinnerDetailsSubmitApiPath,
} from './winnerDetailsPure';

export * from './winnerDetailsPure';

/** Fetch existing draft or template for the winning buyer. */
export async function fetchWinnerDetails(
  auctionId: number,
): Promise<WinnerFulfillmentDetails> {
  const { data } = await api.get<WinnerFulfillmentDetails>(
    buildWinnerDetailsApiPath(auctionId),
  );
  return data;
}

/** Persist incremental step draft progress into PostgreSQL. */
export async function saveWinnerDetailsDraft(
  auctionId: number,
  payload: Partial<WinnerFulfillmentDetails>,
  completedStep?: number,
): Promise<WinnerFulfillmentDetails> {
  const body = {
    ...payload,
    ...(completedStep != null ? { completed_step: completedStep } : {}),
  };
  const { data } = await api.patch<WinnerFulfillmentDetails>(
    buildWinnerDetailsApiPath(auctionId),
    body,
  );
  return data;
}

/** Final submission marking status COMPLETED. */
export async function submitWinnerDetails(
  auctionId: number,
  payload?: Partial<WinnerFulfillmentDetails>,
): Promise<WinnerFulfillmentDetails> {
  const { data } = await api.post<WinnerFulfillmentDetails>(
    buildWinnerDetailsSubmitApiPath(auctionId),
    payload ?? {},
  );
  return data;
}
