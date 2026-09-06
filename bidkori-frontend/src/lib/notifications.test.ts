import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUYER_NOTIFICATIONS_PATH,
  NOTIFICATIONS_API_PATH,
  SELLER_NOTIFICATIONS_PATH,
  buildNotificationReadApiPath,
  buildNotificationsListApiPath,
  buildNotificationsPageHref,
  buildNotificationsReadAllApiPath,
  canGoToNextPage,
  canGoToPreviousPage,
  getNotificationAuctionHref,
  getNotificationTypeLabel,
  getNotificationsPagePath,
  markAllNotificationsReadLocally,
  markNotificationReadLocally,
  pageHasUnread,
  parseNotificationsPageParam,
  shouldShowUnreadIndicator,
  type NotificationItem,
  type NotificationListResponse,
} from './notifications.ts';

function item(
  overrides: Partial<NotificationItem> & Pick<NotificationItem, 'id'>,
): NotificationItem {
  return {
    type: 'OUTBID',
    title: 't',
    message: 'm',
    auction_id: 1,
    is_read: false,
    created_at: '2026-09-06T12:00:00Z',
    ...overrides,
  };
}

describe('notifications API paths', () => {
  it('builds list / read / read-all endpoints', () => {
    assert.equal(buildNotificationsListApiPath(1), NOTIFICATIONS_API_PATH);
    assert.equal(buildNotificationsListApiPath(), '/notifications/');
    assert.equal(buildNotificationsListApiPath(2), '/notifications/?page=2');
    assert.equal(buildNotificationReadApiPath(9), '/notifications/9/read/');
    assert.equal(
      buildNotificationsReadAllApiPath(),
      '/notifications/read-all/',
    );
  });
});

describe('notification type labels', () => {
  it('maps MVP types and falls back for unknown', () => {
    assert.equal(getNotificationTypeLabel('OUTBID'), 'Outbid');
    assert.equal(getNotificationTypeLabel('AUCTION_WON'), 'Auction won');
    assert.equal(getNotificationTypeLabel('AUCTION_LOST'), 'Auction ended');
    assert.equal(getNotificationTypeLabel('SELLER_NEW_BID'), 'New bid');
    assert.equal(getNotificationTypeLabel('ENDING_SOON'), 'Notification');
  });
});

describe('read-state helpers', () => {
  it('marks unread read immutably', () => {
    const source = item({ id: 1, is_read: false });
    const next = markNotificationReadLocally(source);
    assert.equal(source.is_read, false);
    assert.equal(next.is_read, true);
    assert.notEqual(next, source);
  });

  it('keeps already-read stable without mutating source', () => {
    const source = item({ id: 2, is_read: true });
    const next = markNotificationReadLocally(source);
    assert.equal(next.is_read, true);
    assert.notEqual(next, source);
    assert.equal(source.is_read, true);
  });

  it('marks all read without mutating source list', () => {
    const source = [
      item({ id: 1, is_read: false }),
      item({ id: 2, is_read: true }),
    ];
    const next = markAllNotificationsReadLocally(source);
    assert.equal(source[0].is_read, false);
    assert.ok(next.every((row) => row.is_read));
    assert.notEqual(next, source);
  });
});

describe('bell routing', () => {
  it('maps buyer/seller paths and hides admin', () => {
    assert.equal(getNotificationsPagePath('BUYER'), BUYER_NOTIFICATIONS_PATH);
    assert.equal(getNotificationsPagePath('SELLER'), SELLER_NOTIFICATIONS_PATH);
    assert.equal(getNotificationsPagePath('ADMIN'), null);
  });
});

describe('auction deep links', () => {
  it('routes by role and skips null auction', () => {
    assert.equal(getNotificationAuctionHref('BUYER', 42), '/auctions/42');
    assert.equal(
      getNotificationAuctionHref('SELLER', 7),
      '/seller/auctions/7',
    );
    assert.equal(getNotificationAuctionHref('BUYER', null), null);
    assert.equal(getNotificationAuctionHref('SELLER', null), null);
    assert.equal(getNotificationAuctionHref('ADMIN', 42), null);
  });
});

describe('pagination helpers', () => {
  it('parses page and previous/next gates', () => {
    assert.equal(parseNotificationsPageParam(null), 1);
    assert.equal(parseNotificationsPageParam('2'), 2);
    assert.equal(parseNotificationsPageParam('0'), 1);
    assert.equal(canGoToPreviousPage(1), false);
    assert.equal(canGoToPreviousPage(2), true);
    assert.equal(canGoToNextPage({ next: null }), false);
    assert.equal(
      canGoToNextPage({ next: 'http://example/api/notifications/?page=2' }),
      true,
    );
    assert.equal(buildNotificationsPageHref('/buyer/notifications', 1), '/buyer/notifications');
    assert.equal(
      buildNotificationsPageHref('/buyer/notifications', 3),
      '/buyer/notifications?page=3',
    );
  });
});

describe('unread indicator (no invented totals)', () => {
  it('shows indicator only when first-page unread exists', () => {
    const withUnread: NotificationListResponse = {
      count: 40,
      next: 'x',
      previous: null,
      results: [item({ id: 1, is_read: true }), item({ id: 2, is_read: false })],
    };
    const allRead: NotificationListResponse = {
      count: 2,
      next: null,
      previous: null,
      results: [item({ id: 1, is_read: true }), item({ id: 2, is_read: true })],
    };
    assert.equal(pageHasUnread(withUnread.results), true);
    assert.equal(shouldShowUnreadIndicator(withUnread), true);
    assert.equal(shouldShowUnreadIndicator(allRead), false);
    assert.equal(shouldShowUnreadIndicator(null), false);
  });
});
