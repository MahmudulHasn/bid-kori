import { getApiErrorMessage, getApiStatus } from './apiErrors.ts';

/** Shared SWR key for GET /api/auctions/ (list serializer includes is_paid). */
export const AUCTIONS_LIST_API_PATH = '/auctions/';

/** Mock checkout POST path: `/api/auctions/<id>/checkout/`. */
export function buildCheckoutApiPath(auctionId: string | number): string {
  return `/auctions/${auctionId}/checkout/`;
}

/** GET retrieve path: `/api/auctions/<id>/`. */
export function buildAuctionDetailApiPath(id: string | number): string {
  return `/auctions/${id}/`;
}

/** True when Django reports checkout was already completed (400). */
export function isCheckoutAlreadyPaidError(error: unknown): boolean {
  if (getApiStatus(error) !== 400) return false;
  const message = getApiErrorMessage(error, '').toLowerCase();
  return (
    message.includes('already completed') ||
    message.includes('already been paid') ||
    message.includes('already paid')
  );
}
