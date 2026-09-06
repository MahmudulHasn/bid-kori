/**
 * Pure helpers for private notification WebSocket (NT-F02).
 * Receive-only after authenticate; REST remains source of truth.
 */

import { getApiBaseUrl } from './config.ts';
import {
  NOTIFICATIONS_PAGE_SIZE,
  type NotificationItem,
  type NotificationListResponse,
  type NotificationType,
} from './notifications.ts';

export const NOTIFICATION_CREATED_EVENT_TYPE = 'notification.created' as const;
export const NOTIFICATION_AUTHENTICATED_EVENT_TYPE = 'authenticated' as const;

export const KNOWN_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'OUTBID',
  'AUCTION_WON',
  'AUCTION_LOST',
  'SELLER_NEW_BID',
] as const;

export type NotificationCreatedEvent = {
  type: typeof NOTIFICATION_CREATED_EVENT_TYPE;
  notification: NotificationItem;
};

export type NotificationAuthenticatedEvent = {
  type: typeof NOTIFICATION_AUTHENTICATED_EVENT_TYPE;
  user_id?: number;
};

export type NotificationToastTone = 'warning' | 'success' | 'info' | 'neutral';

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Build `ws(s)://…/ws/notifications/` from the configured API base.
 * Never appends a token query parameter.
 */
export function buildNotificationWebSocketUrl(
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

  return `${wsOrigin}/ws/notifications/`;
}

export function buildAuthenticateMessage(token: string): {
  type: 'authenticate';
  token: string;
} {
  return { type: 'authenticate', token };
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

function isParseableTimestamp(value: string): boolean {
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

export function isKnownNotificationType(
  value: unknown,
): value is NotificationType {
  return (
    typeof value === 'string' &&
    (KNOWN_NOTIFICATION_TYPES as readonly string[]).includes(value)
  );
}

/** Runtime guard for nested notification objects. */
export function isNotificationItem(value: unknown): value is NotificationItem {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.id)) return false;
  if (!isKnownNotificationType(value.type)) return false;
  if (!isNonEmptyString(value.title)) return false;
  if (typeof value.message !== 'string') return false;
  if (!(value.auction_id === null || isFiniteNumber(value.auction_id))) {
    return false;
  }
  if (typeof value.is_read !== 'boolean') return false;
  if (!isNonEmptyString(value.created_at)) return false;
  if (!isParseableTimestamp(value.created_at)) return false;
  return true;
}

export function isNotificationCreatedEvent(
  value: unknown,
): value is NotificationCreatedEvent {
  if (!isRecord(value)) return false;
  if (value.type !== NOTIFICATION_CREATED_EVENT_TYPE) return false;
  return isNotificationItem(value.notification);
}

export function isNotificationAuthenticatedEvent(
  value: unknown,
): value is NotificationAuthenticatedEvent {
  if (!isRecord(value)) return false;
  if (value.type !== NOTIFICATION_AUTHENTICATED_EVENT_TYPE) return false;
  if (
    value.user_id !== undefined &&
    !isFiniteNumber(value.user_id)
  ) {
    return false;
  }
  return true;
}

export function isNotificationAuthFailureEvent(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type !== 'error') return false;
  const code = value.code;
  return (
    code === 'authentication_failed' ||
    code === 'auth_timeout' ||
    code === 'already_authenticated'
  );
}

/**
 * Merge a live notification into the first-page list (newest first).
 * Dedupes by id; does not regress an existing read row to unread.
 * Trims to page size. Does not mutate the source.
 */
export function mergeNotificationIntoFirstPage(
  current: NotificationListResponse | null | undefined,
  incoming: NotificationItem,
): NotificationListResponse | undefined {
  if (!current) {
    return {
      count: 1,
      next: null,
      previous: null,
      results: [incoming],
    };
  }

  const existingIndex = current.results.findIndex(
    (row) => row.id === incoming.id,
  );
  let results: NotificationItem[];

  if (existingIndex >= 0) {
    const existing = current.results[existingIndex];
    const merged: NotificationItem =
      existing.is_read && !incoming.is_read
        ? { ...existing }
        : { ...incoming };
    results = current.results.map((row, index) =>
      index === existingIndex ? merged : row,
    );
    return {
      ...current,
      results: [...results],
    };
  }

  results = [incoming, ...current.results].slice(0, NOTIFICATIONS_PAGE_SIZE);
  const count =
    typeof current.count === 'number' && Number.isFinite(current.count)
      ? current.count + 1
      : current.count;

  return {
    ...current,
    count,
    results,
  };
}

export function getNotificationToastTone(
  type: string,
): NotificationToastTone {
  switch (type) {
    case 'OUTBID':
      return 'warning';
    case 'AUCTION_WON':
      return 'success';
    case 'AUCTION_LOST':
      return 'neutral';
    case 'SELLER_NEW_BID':
      return 'info';
    default:
      return 'neutral';
  }
}

export function notificationWebSocketUrlHasTokenLeak(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('?token=') ||
    lower.includes('&token=') ||
    lower.includes('authorization=')
  );
}

export function nextNotificationReconnectDelayMs(attempt: number): number {
  const max = 30_000;
  return Math.min(max, 1000 * 2 ** Math.max(0, attempt));
}

/** Auth-related close codes from NotificationConsumer. */
export function isNotificationAuthCloseCode(code: number): boolean {
  return code === 4401 || code === 4408;
}
