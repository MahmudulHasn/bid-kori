import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAuthenticateMessage,
  buildNotificationWebSocketUrl,
  getNotificationToastTone,
  isNotificationAuthCloseCode,
  isNotificationAuthenticatedEvent,
  isNotificationCreatedEvent,
  isNotificationItem,
  mergeNotificationIntoFirstPage,
  nextNotificationReconnectDelayMs,
  notificationWebSocketUrlHasTokenLeak,
} from './notificationRealtime.ts';
import {
  shouldShowUnreadIndicator,
  type NotificationItem,
  type NotificationListResponse,
} from './notifications.ts';

function item(
  overrides: Partial<NotificationItem> & Pick<NotificationItem, 'id'>,
): NotificationItem {
  return {
    type: 'OUTBID',
    title: 'Outbid',
    message: 'Higher bid placed.',
    auction_id: 1,
    is_read: false,
    created_at: '2026-09-06T12:00:00.000Z',
    ...overrides,
  };
}

describe('buildNotificationWebSocketUrl', () => {
  it('maps http API base to ws notifications path', () => {
    assert.equal(
      buildNotificationWebSocketUrl('http://127.0.0.1:8000/api'),
      'ws://127.0.0.1:8000/ws/notifications/',
    );
  });

  it('maps https API base to wss', () => {
    assert.equal(
      buildNotificationWebSocketUrl('https://api.example.com/api'),
      'wss://api.example.com/ws/notifications/',
    );
  });

  it('strips trailing slash and /api', () => {
    assert.equal(
      buildNotificationWebSocketUrl('http://localhost:8000/api/'),
      'ws://localhost:8000/ws/notifications/',
    );
  });

  it('never includes token query params', () => {
    const url = buildNotificationWebSocketUrl('http://127.0.0.1:8000/api');
    assert.equal(notificationWebSocketUrlHasTokenLeak(url), false);
    assert.equal(url.includes('?'), false);
    assert.ok(url.endsWith('/ws/notifications/'));
  });
});

describe('authenticate message', () => {
  it('builds handshake without extra fields', () => {
    assert.deepEqual(buildAuthenticateMessage('abc'), {
      type: 'authenticate',
      token: 'abc',
    });
  });
});

describe('runtime guards', () => {
  it('accepts valid notification.created', () => {
    const event = {
      type: 'notification.created',
      notification: item({ id: 9, auction_id: null }),
    };
    assert.equal(isNotificationCreatedEvent(event), true);
    assert.equal(isNotificationItem(event.notification), true);
  });

  it('rejects malformed outer type and notification', () => {
    assert.equal(isNotificationCreatedEvent({ type: 'bid.accepted' }), false);
    assert.equal(
      isNotificationCreatedEvent({
        type: 'notification.created',
        notification: { id: 'x' },
      }),
      false,
    );
  });

  it('rejects invalid notification enum', () => {
    assert.equal(
      isNotificationItem(item({ id: 1, type: 'ENDING_SOON' })),
      false,
    );
    assert.equal(
      isNotificationCreatedEvent({
        type: 'notification.created',
        notification: item({ id: 1, type: 'PAYMENT_DUE' }),
      }),
      false,
    );
  });

  it('allows null auction_id and rejects bad created_at', () => {
    assert.equal(
      isNotificationItem(item({ id: 1, auction_id: null })),
      true,
    );
    assert.equal(
      isNotificationItem(item({ id: 1, created_at: 'not-a-date' })),
      false,
    );
  });

  it('accepts authenticated event', () => {
    assert.equal(
      isNotificationAuthenticatedEvent({ type: 'authenticated', user_id: 3 }),
      true,
    );
    assert.equal(
      isNotificationAuthenticatedEvent({ type: 'authenticated' }),
      true,
    );
  });
});

describe('mergeNotificationIntoFirstPage', () => {
  it('prepends newest-first without mutating source', () => {
    const current: NotificationListResponse = {
      count: 1,
      next: null,
      previous: null,
      results: [item({ id: 1, title: 'Old' })],
    };
    const incoming = item({ id: 2, title: 'New' });
    const next = mergeNotificationIntoFirstPage(current, incoming)!;
    assert.equal(next.results[0].id, 2);
    assert.equal(next.results[1].id, 1);
    assert.equal(current.results.length, 1);
    assert.equal(current.results[0].title, 'Old');
  });

  it('dedupes by id and does not regress read→unread', () => {
    const current: NotificationListResponse = {
      count: 1,
      next: null,
      previous: null,
      results: [item({ id: 5, is_read: true })],
    };
    const stale = item({ id: 5, is_read: false, title: 'Stale' });
    const next = mergeNotificationIntoFirstPage(current, stale)!;
    assert.equal(next.results.length, 1);
    assert.equal(next.results[0].is_read, true);
    assert.equal(next.results[0].title, 'Outbid');
  });

  it('trims to 20 rows', () => {
    const results = Array.from({ length: 20 }, (_, i) =>
      item({ id: i + 1, title: `N${i}` }),
    );
    const current: NotificationListResponse = {
      count: 20,
      next: 'x',
      previous: null,
      results,
    };
    const next = mergeNotificationIntoFirstPage(
      current,
      item({ id: 99, title: 'Live' }),
    )!;
    assert.equal(next.results.length, 20);
    assert.equal(next.results[0].id, 99);
    assert.equal(next.count, 21);
  });
});

describe('unread indicator with live merge', () => {
  it('live unread causes indicator; already-read does not', () => {
    const empty: NotificationListResponse = {
      count: 0,
      next: null,
      previous: null,
      results: [],
    };
    const withUnread = mergeNotificationIntoFirstPage(
      empty,
      item({ id: 1, is_read: false }),
    );
    const withRead = mergeNotificationIntoFirstPage(
      empty,
      item({ id: 2, is_read: true }),
    );
    assert.equal(shouldShowUnreadIndicator(withUnread), true);
    assert.equal(shouldShowUnreadIndicator(withRead), false);
  });
});

describe('toast tone mapping', () => {
  it('maps MVP types and unknown fallback', () => {
    assert.equal(getNotificationToastTone('OUTBID'), 'warning');
    assert.equal(getNotificationToastTone('AUCTION_WON'), 'success');
    assert.equal(getNotificationToastTone('AUCTION_LOST'), 'neutral');
    assert.equal(getNotificationToastTone('SELLER_NEW_BID'), 'info');
    assert.equal(getNotificationToastTone('ENDING_SOON'), 'neutral');
  });
});

describe('reconnect helpers', () => {
  it('caps backoff and recognizes auth close codes', () => {
    assert.equal(nextNotificationReconnectDelayMs(0), 1000);
    assert.equal(nextNotificationReconnectDelayMs(1), 2000);
    assert.equal(nextNotificationReconnectDelayMs(10), 30_000);
    assert.equal(isNotificationAuthCloseCode(4401), true);
    assert.equal(isNotificationAuthCloseCode(4408), true);
    assert.equal(isNotificationAuthCloseCode(1000), false);
  });
});
