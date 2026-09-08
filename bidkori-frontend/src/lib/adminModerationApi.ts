/**
 * Admin moderation REST helpers (MOD-F01).
 * Uses shared Axios client (token attached by interceptor).
 */

import api from '@/lib/api';
import { buildModerationReasonBody } from '@/lib/adminModeration';
import type { Auction, ModerationState } from '@/lib/types';

export function buildAdminProductHideApiPath(id: string | number): string {
  return `/admin/products/${id}/hide/`;
}

export function buildAdminProductRestoreApiPath(id: string | number): string {
  return `/admin/products/${id}/restore/`;
}

export function buildAdminAuctionHideApiPath(id: string | number): string {
  return `/admin/auctions/${id}/hide/`;
}

export function buildAdminAuctionRestoreApiPath(id: string | number): string {
  return `/admin/auctions/${id}/restore/`;
}

export function buildAdminAuctionCancelApiPath(id: string | number): string {
  return `/admin/auctions/${id}/cancel/`;
}

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
