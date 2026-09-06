import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyBidAcceptedToAuction,
  buildAuctionWebSocketUrl,
  compareMoneyAmounts,
  eventMatchesAuctionId,
  isBidAcceptedEvent,
  parseWebSocketJson,
  type BidAcceptedEvent,
} from './auctionRealtime.ts';
import type { Auction } from './types.ts';

function validEvent(
  overrides: Partial<BidAcceptedEvent> & {
    bid?: Partial<BidAcceptedEvent['bid']>;
  } = {},
): BidAcceptedEvent {
  const { bid: bidOverrides, ...rest } = overrides;
  return {
    type: 'bid.accepted',
    auction_id: 42,
    current_highest_bid: '25000.00',
    bid: {
      id: 123,
      amount: '25000.00',
      bidder_username: 'buyer1',
      timestamp: '2026-09-06T12:00:00Z',
      ...bidOverrides,
    },
    ...rest,
  };
}

function sampleAuction(overrides: Partial<Auction> = {}): Auction {
  return {
    id: 42,
    status: 'ACTIVE',
    starting_bid: '1000.00',
    current_highest_bid: '20000.00',
    min_increment: '10.00',
    start_time: '2026-09-01T00:00:00Z',
    end_time: '2026-09-10T00:00:00Z',
    product_title: 'Test lot',
    ...overrides,
  };
}

test('buildAuctionWebSocketUrl: HTTP API → ws and strips /api', () => {
  assert.equal(
    buildAuctionWebSocketUrl(42, 'http://127.0.0.1:8000/api'),
    'ws://127.0.0.1:8000/ws/auctions/42/',
  );
});

test('buildAuctionWebSocketUrl: HTTPS API → wss', () => {
  assert.equal(
    buildAuctionWebSocketUrl(42, 'https://api.bidkori.com/api'),
    'wss://api.bidkori.com/ws/auctions/42/',
  );
});

test('buildAuctionWebSocketUrl: trailing slash on /api/ handled', () => {
  assert.equal(
    buildAuctionWebSocketUrl(7, 'http://localhost:8000/api/'),
    'ws://localhost:8000/ws/auctions/7/',
  );
});

test('buildAuctionWebSocketUrl: auction id included; no auth token', () => {
  const url = buildAuctionWebSocketUrl(99, 'http://127.0.0.1:8000/api');
  assert.match(url, /\/ws\/auctions\/99\/$/);
  assert.doesNotMatch(url, /[?&]token=/i);
  assert.doesNotMatch(url, /authorization/i);
});

test('isBidAcceptedEvent: valid bid.accepted', () => {
  assert.equal(isBidAcceptedEvent(validEvent()), true);
});

test('isBidAcceptedEvent: wrong type rejected', () => {
  assert.equal(isBidAcceptedEvent(validEvent({ type: 'auction.closed' as 'bid.accepted' })), false);
  assert.equal(isBidAcceptedEvent({ ...validEvent(), type: 'other' }), false);
});

test('isBidAcceptedEvent: missing auction_id rejected', () => {
  const rest = { ...validEvent() } as Record<string, unknown>;
  delete rest.auction_id;
  assert.equal(isBidAcceptedEvent(rest), false);
});

test('isBidAcceptedEvent: malformed bid rejected', () => {
  assert.equal(
    isBidAcceptedEvent({
      type: 'bid.accepted',
      auction_id: 42,
      current_highest_bid: '1.00',
      bid: { id: 'x', amount: '1.00', bidder_username: 'a', timestamp: 't' },
    }),
    false,
  );
  assert.equal(
    isBidAcceptedEvent({
      type: 'bid.accepted',
      auction_id: 42,
      current_highest_bid: '1.00',
      bid: null,
    }),
    false,
  );
});

test('isBidAcceptedEvent: missing current_highest_bid rejected', () => {
  const rest = { ...validEvent() } as Record<string, unknown>;
  delete rest.current_highest_bid;
  assert.equal(isBidAcceptedEvent(rest), false);
  assert.equal(
    isBidAcceptedEvent({ ...validEvent(), current_highest_bid: '' }),
    false,
  );
});

test('isBidAcceptedEvent: arbitrary JSON rejected', () => {
  assert.equal(isBidAcceptedEvent(null), false);
  assert.equal(isBidAcceptedEvent([]), false);
  assert.equal(isBidAcceptedEvent({ hello: 'world' }), false);
  assert.equal(isBidAcceptedEvent('bid.accepted'), false);
});

test('parseWebSocketJson: invalid JSON does not throw', () => {
  assert.equal(parseWebSocketJson('{not-json'), null);
  assert.equal(parseWebSocketJson(''), null);
  assert.deepEqual(parseWebSocketJson('{"ok":true}'), { ok: true });
});

test('eventMatchesAuctionId: matching accepted, different ignored', () => {
  const event = validEvent({ auction_id: 42 });
  assert.equal(eventMatchesAuctionId(event, 42), true);
  assert.equal(eventMatchesAuctionId(event, '42'), true);
  assert.equal(eventMatchesAuctionId(event, 99), false);
});

test('applyBidAcceptedToAuction: updates current_highest_bid and preserves fields', () => {
  const auction = sampleAuction({
    current_highest_bid: '20000.00',
    status: 'ACTIVE',
    product_title: 'Keep me',
    starting_bid: '1000.00',
  });
  const frozen = structuredClone(auction);
  const event = validEvent({ current_highest_bid: '25000.00' });
  const result = applyBidAcceptedToAuction(auction, event, 42);

  assert.equal(result.applied, true);
  assert.equal(result.revalidate, false);
  assert.equal(result.auction?.current_highest_bid, '25000.00');
  assert.equal(result.auction?.status, 'ACTIVE');
  assert.equal(result.auction?.product_title, 'Keep me');
  assert.equal(result.auction?.starting_bid, '1000.00');
  assert.deepEqual(auction, frozen);
});

test('applyBidAcceptedToAuction: undefined cache remains safe', () => {
  const result = applyBidAcceptedToAuction(undefined, validEvent(), 42);
  assert.equal(result.auction, undefined);
  assert.equal(result.applied, false);
  assert.equal(result.revalidate, false);
});

test('applyBidAcceptedToAuction: wrong auction id ignored', () => {
  const auction = sampleAuction();
  const result = applyBidAcceptedToAuction(
    auction,
    validEvent({ auction_id: 99, current_highest_bid: '99999.00' }),
    42,
  );
  assert.equal(result.applied, false);
  assert.equal(result.auction, auction);
  assert.equal(result.auction?.current_highest_bid, '20000.00');
});

test('applyBidAcceptedToAuction: duplicate same amount is idempotent', () => {
  const auction = sampleAuction({ current_highest_bid: '25000.00' });
  const result = applyBidAcceptedToAuction(
    auction,
    validEvent({ current_highest_bid: '25000.00' }),
    42,
  );
  assert.equal(result.applied, false);
  assert.equal(result.auction, auction);
});

test('applyBidAcceptedToAuction: stale lower price does not regress', () => {
  const auction = sampleAuction({ current_highest_bid: '30000.00' });
  const result = applyBidAcceptedToAuction(
    auction,
    validEvent({ current_highest_bid: '25000.00' }),
    42,
  );
  assert.equal(result.applied, false);
  assert.equal(result.auction?.current_highest_bid, '30000.00');
});

test('compareMoneyAmounts: decimal-safe ordering', () => {
  assert.equal(compareMoneyAmounts('10.00', '9.99'), 1);
  assert.equal(compareMoneyAmounts('10.00', '10.00'), 0);
  assert.equal(compareMoneyAmounts('9.50', '10.00'), -1);
  assert.equal(compareMoneyAmounts('25000.00', '25000'), 0);
});

test('RT-F01 helpers are receive-only (no send/place-bid helpers exported)', async () => {
  const mod = await import('./auctionRealtime.ts');
  const names = Object.keys(mod);
  assert.ok(!names.some((n) => /send|placeBid|place_bid/i.test(n)));
});
