/**
 * Admin moderation REST helpers (MOD-F01).
 * Uses shared Axios client (token attached by interceptor).
 *
 * Path builders live in adminModeration.ts so Node tests can import them
 * without resolving the `@/` Axios graph.
 */

import api from '@/lib/api';
import {
  buildAdminAuctionCancelApiPath,
  buildAdminAuctionHideApiPath,
  buildAdminAuctionRestoreApiPath,
  buildAdminProductHideApiPath,
  buildAdminProductRestoreApiPath,
  buildModerationReasonBody,
} from '@/lib/adminModeration';
import type { Auction, ModerationState } from '@/lib/types';

export {
  buildAdminAuctionCancelApiPath,
  buildAdminAuctionHideApiPath,
  buildAdminAuctionRestoreApiPath,
  buildAdminProductHideApiPath,
  buildAdminProductRestoreApiPath,
} from '@/lib/adminModeration';

export async function hideAdminProduct(
  id: string | number,
  reason?: string,
): Promise<ModerationState> {
  const { data } = await api.post<ModerationState>(
    buildAdminProductHideApiPath(id),
    buildModerationReasonBody(reason),
  );
  return data;
}

export async function restoreAdminProduct(
  id: string | number,
): Promise<ModerationState> {
  const { data } = await api.post<ModerationState>(
    buildAdminProductRestoreApiPath(id),
    {},
  );
  return data;
}

export async function hideAdminAuction(
  id: string | number,
  reason?: string,
): Promise<ModerationState> {
  const { data } = await api.post<ModerationState>(
    buildAdminAuctionHideApiPath(id),
    buildModerationReasonBody(reason),
  );
  return data;
}

export async function restoreAdminAuction(
  id: string | number,
): Promise<ModerationState> {
  const { data } = await api.post<ModerationState>(
    buildAdminAuctionRestoreApiPath(id),
    {},
  );
  return data;
}

export async function cancelAdminAuction(
  id: string | number,
  reason?: string,
): Promise<Auction> {
  const { data } = await api.post<Auction>(
    buildAdminAuctionCancelApiPath(id),
    buildModerationReasonBody(reason),
  );
  return data;
}
