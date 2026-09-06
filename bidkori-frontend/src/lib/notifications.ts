/**
 * Pure notification helpers and types for inbox + live push UX.
 * REST remains source of truth; WebSocket delivers notification.created.
 */

import type { UserRole } from './types.ts';
import { MARKETPLACE_ROUTES } from './marketplace.ts';
import { sellerAuctionDetailPath } from './workspaceNavigation.ts';

export type NotificationType =
  | 'OUTBID'
  | 'AUCTION_WON'
  | 'AUCTION_LOST'
  | 'SELLER_NEW_BID';

export type NotificationItem = {
  id: number;
  type: NotificationType | string;
  title: string;
  message: string;
  auction_id: number | null;
  is_read: boolean;
  created_at: string;
};

export type NotificationListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: NotificationItem[];
};

export const BUYER_NOTIFICATIONS_PATH = '/buyer/notifications';
export const SELLER_NOTIFICATIONS_PATH = '/seller/notifications';
export const NOTIFICATIONS_API_PATH = '/notifications/';
export const NOTIFICATIONS_PAGE_SIZE = 20;

/** Role-aware notifications page; Admin has no NT-F01 route. */
export function getNotificationsPagePath(role: UserRole): string | null {
  if (role === 'BUYER') return BUYER_NOTIFICATIONS_PATH;
  if (role === 'SELLER') return SELLER_NOTIFICATIONS_PATH;
  return null;
}

export function buildNotificationsListApiPath(page = 1): string {
  const safePage = Number.isFinite(page) && page > 1 ? Math.floor(page) : 1;
  if (safePage <= 1) return NOTIFICATIONS_API_PATH;
  return `${NOTIFICATIONS_API_PATH}?page=${safePage}`;
}

export function buildNotificationReadApiPath(id: number): string {
  return `${NOTIFICATIONS_API_PATH}${id}/read/`;
}

export function buildNotificationsReadAllApiPath(): string {
  return `${NOTIFICATIONS_API_PATH}read-all/`;
}

export function parseNotificationsPageParam(
  raw: string | null | undefined,
): number {
  if (raw == null || raw === '') return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

export function getNotificationTypeLabel(type: string): string {
  switch (type) {
    case 'OUTBID':
      return 'Outbid';
    case 'AUCTION_WON':
      return 'Auction won';
    case 'AUCTION_LOST':
      return 'Auction ended';
    case 'SELLER_NEW_BID':
      return 'New bid';
    default:
      return 'Notification';
  }
}

/**
 * Auction deep-link for a notification.
 * Buyer → public auction detail; Seller → seller management detail.
 */
export function getNotificationAuctionHref(
  role: UserRole,
  auctionId: number | null | undefined,
): string | null {
  if (auctionId == null || !Number.isFinite(auctionId) || auctionId <= 0) {
    return null;
  }
  if (role === 'BUYER') {
    return MARKETPLACE_ROUTES.auctionDetail(auctionId);
  }
  if (role === 'SELLER') {
    return sellerAuctionDetailPath(auctionId);
  }
  return null;
}

/** True when the loaded page contains at least one unread row. */
export function pageHasUnread(items: readonly NotificationItem[]): boolean {
  return items.some((item) => item.is_read === false);
}

/**
 * Unread indicator for the bell without inventing an exact total.
 * Uses the first page only: show a dot when any unread is visible there.
 */
export function shouldShowUnreadIndicator(
  firstPage: NotificationListResponse | null | undefined,
): boolean {
  if (!firstPage?.results?.length) return false;
  return pageHasUnread(firstPage.results);
}

export function markNotificationReadLocally(
  item: NotificationItem,
): NotificationItem {
  if (item.is_read) {
    return { ...item };
  }
  return { ...item, is_read: true };
}

export function markAllNotificationsReadLocally(
  items: readonly NotificationItem[],
): NotificationItem[] {
  return items.map((item) => markNotificationReadLocally(item));
}

export function canGoToPreviousPage(page: number): boolean {
  return page > 1;
}

export function canGoToNextPage(
  response: Pick<NotificationListResponse, 'next'> | null | undefined,
): boolean {
  return Boolean(response?.next);
}

export function buildNotificationsPageHref(
  basePath: string,
  page: number,
): string {
  if (page <= 1) return basePath;
  return `${basePath}?page=${page}`;
}
