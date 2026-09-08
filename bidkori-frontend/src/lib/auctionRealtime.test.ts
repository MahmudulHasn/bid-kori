import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAuctionCancelledToAuction,
  applyAuctionClosedToAuction,
  applyBidAcceptedToAuction,
  buildAuctionWebSocketUrl,
  compareMoneyAmounts,
  eventMatchesAuctionId,
  isAuctionCancelledEvent,
  isAuctionClosedEvent,
  isBidAcceptedEvent,
  parseWebSocketJson,
  type AuctionCancelledEvent,
  type AuctionClosedEvent,
  type BidAcceptedEvent,
} from './auctionRealtime.ts';
import type { Auction } from './types.ts';

function validBidEvent(
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

function validClosedEvent(
  overrides: Partial<AuctionClosedEvent> = {},
): AuctionClosedEvent {
  return {
    type: 'auction.closed',
    auction_id: 42,
    status: 'CLOSED',
    current_highest_bid: '25000.00',
    winning_bidder: { id: 7, username: 'buyer1' },
    is_paid: false,
    closed_at: '2026-09-06T12:05:00Z',
    ...overrides,
  };
}

function validCancelledEvent(
  overrides: Partial<AuctionCancelledEvent> = {},
): AuctionCancelledEvent {
  return {
    type: 'auction.cancelled',
    auction_id: 42,
    status: 'CANCELLED',
    winning_bidder: null,
    server_time: '2026-09-08T12:00:00Z',
    ...overrides,
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
  assert.equal(isBidAcceptedEvent(validBidEvent()), true);
});

test('isBidAcceptedEvent: wrong type rejected', () => {
  assert.equal(
    isBidAcceptedEvent(validBidEvent({ type: 'auction.closed' as 'bid.accepted' })),
    false,
  );
  assert.equal(isBidAcceptedEvent({ ...validBidEvent(), type: 'other' }), false);
});

test('isBidAcceptedEvent: missing auction_id rejected', () => {
  const rest = { ...validBidEvent() } as Record<string, unknown>;
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
  const rest = { ...validBidEvent() } as Record<string, unknown>;
  delete rest.current_highest_bid;
  assert.equal(isBidAcceptedEvent(rest), false);
  assert.equal(
    isBidAcceptedEvent({ ...validBidEvent(), current_highest_bid: '' }),
    false,
  );
});

test('isBidAcceptedEvent: arbitrary JSON rejected', () => {
  assert.equal(isBidAcceptedEvent(null), false);
  assert.equal(isBidAcceptedEvent([]), false);
  assert.equal(isBidAcceptedEvent({ hello: 'world' }), false);
  assert.equal(isBidAcceptedEvent('bid.accepted'), false);
});

test('isAuctionClosedEvent: valid winner close', () => {
  assert.equal(isAuctionClosedEvent(validClosedEvent()), true);
});

test('isAuctionClosedEvent: null winner valid', () => {
  assert.equal(
    isAuctionClosedEvent(validClosedEvent({ winning_bidder: null })),
    true,
  );
});

test('isAuctionClosedEvent: malformed status rejected', () => {
  assert.equal(
    isAuctionClosedEvent(validClosedEvent({ status: 'ACTIVE' as 'CLOSED' })),
    false,
  );
  assert.equal(
    isAuctionClosedEvent({ ...validClosedEvent(), status: 'closed' }),
    false,
  );
});

test('isAuctionClosedEvent: missing auction_id rejected', () => {
  const rest = { ...validClosedEvent() } as Record<string, unknown>;
  delete rest.auction_id;
  assert.equal(isAuctionClosedEvent(rest), false);
});

test('isAuctionClosedEvent: malformed winner rejected', () => {
  assert.equal(
    isAuctionClosedEvent({
      ...validClosedEvent(),
      winning_bidder: { id: 'x', username: 'a' },
    }),
    false,
  );
  assert.equal(
    isAuctionClosedEvent({
      ...validClosedEvent(),
      winning_bidder: { id: 1 },
    }),
    false,
  );
  assert.equal(
    isAuctionClosedEvent({
      ...validClosedEvent(),
      winning_bidder: 'buyer1',
    }),
    false,
  );
});

test('isAuctionClosedEvent: invalid JSON shapes ignored', () => {
  assert.equal(isAuctionClosedEvent(null), false);
  assert.equal(isAuctionClosedEvent([]), false);
  assert.equal(isAuctionClosedEvent({ type: 'auction.closed' }), false);
  assert.equal(isAuctionClosedEvent(validBidEvent()), false);
});

test('parseWebSocketJson: invalid JSON does not throw', () => {
  assert.equal(parseWebSocketJson('{not-json'), null);
  assert.equal(parseWebSocketJson(''), null);
  assert.deepEqual(parseWebSocketJson('{"ok":true}'), { ok: true });
});

test('eventMatchesAuctionId: matching accepted, different ignored', () => {
  const event = validBidEvent({ auction_id: 42 });
  assert.equal(eventMatchesAuctionId(event, 42), true);
  assert.equal(eventMatchesAuctionId(event, '42'), true);
  assert.equal(eventMatchesAuctionId(event, 99), false);
  assert.equal(eventMatchesAuctionId(validClosedEvent({ auction_id: 7 }), 7), true);
  assert.equal(eventMatchesAuctionId(validClosedEvent({ auction_id: 7 }), 8), false);
});

test('applyBidAcceptedToAuction: updates current_highest_bid and preserves fields', () => {
  const auction = sampleAuction({
    current_highest_bid: '20000.00',
    status: 'ACTIVE',
    product_title: 'Keep me',
    starting_bid: '1000.00',
  });
  const frozen = structuredClone(auction);
  const event = validBidEvent({ current_highest_bid: '25000.00' });
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
  const result = applyBidAcceptedToAuction(undefined, validBidEvent(), 42);
  assert.equal(result.auction, undefined);
  assert.equal(result.applied, false);
  assert.equal(result.revalidate, false);
});

test('applyBidAcceptedToAuction: wrong auction id ignored', () => {
  const auction = sampleAuction();
  const result = applyBidAcceptedToAuction(
    auction,
    validBidEvent({ auction_id: 99, current_highest_bid: '99999.00' }),
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
    validBidEvent({ current_highest_bid: '25000.00' }),
    42,
  );
  assert.equal(result.applied, false);
  assert.equal(result.auction, auction);
});

test('applyBidAcceptedToAuction: stale lower price does not regress', () => {
  const auction = sampleAuction({ current_highest_bid: '30000.00' });
  const result = applyBidAcceptedToAuction(
    auction,
    validBidEvent({ current_highest_bid: '25000.00' }),
    42,
  );
  assert.equal(result.applied, false);
  assert.equal(result.auction?.current_highest_bid, '30000.00');
});

test('applyAuctionClosedToAuction: ACTIVE → CLOSED with final price and winner', () => {
  const auction = sampleAuction({
    status: 'ACTIVE',
    current_highest_bid: '20000.00',
    product_title: 'Keep me',
    starting_bid: '1000.00',
    is_featured: true,
  });
  const frozen = structuredClone(auction);
  const result = applyAuctionClosedToAuction(
    auction,
    validClosedEvent({
      current_highest_bid: '25000.00',
      winning_bidder: { id: 7, username: 'buyer1' },
    }),
    42,
  );

  assert.equal(result.applied, true);
  assert.equal(result.revalidate, true);
  assert.equal(result.auction?.status, 'CLOSED');
  assert.equal(result.auction?.current_highest_bid, '25000.00');
  assert.equal(result.auction?.winning_bidder, 7);
  assert.equal(result.auction?.winning_bidder_username, 'buyer1');
  assert.equal(result.auction?.product_title, 'Keep me');
  assert.equal(result.auction?.starting_bid, '1000.00');
  assert.equal(result.auction?.is_featured, true);
  assert.deepEqual(auction, frozen);
});

test('applyAuctionClosedToAuction: null winner does not crash', () => {
  const auction = sampleAuction({ winning_bidder: 3, winning_bidder_username: 'old' });
  const result = applyAuctionClosedToAuction(
    auction,
    validClosedEvent({ winning_bidder: null, current_highest_bid: '150.00' }),
    42,
  );
  assert.equal(result.applied, true);
  assert.equal(result.auction?.status, 'CLOSED');
  assert.equal(result.auction?.winning_bidder, null);
  assert.equal(result.auction?.winning_bidder_username, null);
  assert.equal(result.auction?.current_highest_bid, '150.00');
});

test('applyAuctionClosedToAuction: wrong auction ignored', () => {
  const auction = sampleAuction();
  const result = applyAuctionClosedToAuction(
    auction,
    validClosedEvent({ auction_id: 99 }),
    42,
  );
  assert.equal(result.applied, false);
  assert.equal(result.revalidate, false);
  assert.equal(result.auction?.status, 'ACTIVE');
});

test('applyAuctionClosedToAuction: undefined cache requests revalidate', () => {
  const result = applyAuctionClosedToAuction(undefined, validClosedEvent(), 42);
  assert.equal(result.auction, undefined);
  assert.equal(result.applied, false);
  assert.equal(result.revalidate, true);
});

test('applyAuctionClosedToAuction: duplicate close remains CLOSED (idempotent)', () => {
  const auction = sampleAuction({
    status: 'CLOSED',
    current_highest_bid: '25000.00',
    winning_bidder: 7,
    winning_bidder_username: 'buyer1',
  });
  const result = applyAuctionClosedToAuction(auction, validClosedEvent(), 42);
  assert.equal(result.applied, true);
  assert.equal(result.revalidate, true);
  assert.equal(result.auction?.status, 'CLOSED');
  assert.equal(result.auction?.winning_bidder, 7);
  assert.equal(result.auction?.current_highest_bid, '25000.00');
});

test('sequence: bid.accepted then auction.closed', () => {
  let auction: Auction | undefined = sampleAuction({
    current_highest_bid: '20000.00',
    status: 'ACTIVE',
  });
  const afterBid = applyBidAcceptedToAuction(
    auction,
    validBidEvent({ current_highest_bid: '25000.00' }),
    42,
  );
  assert.equal(afterBid.applied, true);
  auction = afterBid.auction;
  assert.equal(auction?.current_highest_bid, '25000.00');
  assert.equal(auction?.status, 'ACTIVE');

  const afterClose = applyAuctionClosedToAuction(
    auction,
    validClosedEvent({
      current_highest_bid: '25000.00',
      winning_bidder: { id: 7, username: 'buyer1' },
    }),
    42,
  );
  assert.equal(afterClose.applied, true);
  assert.equal(afterClose.revalidate, true);
  assert.equal(afterClose.auction?.status, 'CLOSED');
  assert.equal(afterClose.auction?.current_highest_bid, '25000.00');
  assert.equal(afterClose.auction?.winning_bidder, 7);
});

test('stale bid.accepted after CLOSED does not reopen or regress price', () => {
  const closed = sampleAuction({
    status: 'CLOSED',
    current_highest_bid: '30000.00',
    winning_bidder: 7,
    winning_bidder_username: 'buyer1',
  });
  const result = applyBidAcceptedToAuction(
    closed,
    validBidEvent({ current_highest_bid: '99999.00' }),
    42,
  );
  assert.equal(result.applied, false);
  assert.equal(result.revalidate, true);
  assert.equal(result.auction?.status, 'CLOSED');
  assert.equal(result.auction?.current_highest_bid, '30000.00');
  assert.equal(result.auction?.winning_bidder, 7);
});

test('compareMoneyAmounts: decimal-safe ordering', () => {
  assert.equal(compareMoneyAmounts('10.00', '9.99'), 1);
  assert.equal(compareMoneyAmounts('10.00', '10.00'), 0);
  assert.equal(compareMoneyAmounts('9.50', '10.00'), -1);
  assert.equal(compareMoneyAmounts('25000.00', '25000'), 0);
});

test('isAuctionCancelledEvent: valid payload accepted', () => {
  assert.equal(isAuctionCancelledEvent(validCancelledEvent()), true);
});

test('isAuctionCancelledEvent: malformed payloads rejected', () => {
  assert.equal(
    isAuctionCancelledEvent(validCancelledEvent({ status: 'CLOSED' as 'CANCELLED' })),
    false,
  );
  assert.equal(
    isAuctionCancelledEvent({
      ...validCancelledEvent(),
      winning_bidder: { id: 1, username: 'x' },
    }),
    false,
  );
  const missingId = { ...validCancelledEvent() };
  delete (missingId as { auction_id?: number }).auction_id;
  assert.equal(isAuctionCancelledEvent(missingId), false);
  assert.equal(
    isAuctionCancelledEvent(validCancelledEvent({ server_time: '' })),
    false,
  );
  assert.equal(isAuctionCancelledEvent(validBidEvent()), false);
  assert.equal(isAuctionCancelledEvent(validClosedEvent()), false);
  assert.equal(isAuctionCancelledEvent({ type: 'auction.future' }), false);
});

test('applyAuctionCancelledToAuction: status CANCELLED and winner cleared', () => {
  const auction = sampleAuction({
    status: 'ACTIVE',
    winning_bidder: 7,
    winning_bidder_username: 'buyer1',
  });
  const frozen = structuredClone(auction);
  const result = applyAuctionCancelledToAuction(
    auction,
    validCancelledEvent(),
    42,
  );
  assert.equal(result.applied, true);
  assert.equal(result.revalidate, true);
  assert.equal(result.auction?.status, 'CANCELLED');
  assert.equal(result.auction?.winning_bidder, null);
  assert.equal(result.auction?.winning_bidder_username, null);
  assert.equal(result.auction?.server_time, '2026-09-08T12:00:00Z');
  assert.deepEqual(auction, frozen);
});

test('applyAuctionCancelledToAuction: duplicate remains CANCELLED', () => {
  const auction = sampleAuction({
    status: 'CANCELLED',
    winning_bidder: null,
    winning_bidder_username: null,
  });
  const result = applyAuctionCancelledToAuction(
    auction,
    validCancelledEvent(),
    42,
  );
  assert.equal(result.applied, true);
  assert.equal(result.auction?.status, 'CANCELLED');
  assert.equal(result.auction?.winning_bidder, null);
});

test('unknown realtime event shapes are ignored by validators', () => {
  const unknown = { type: 'auction.future', auction_id: 1 };
  assert.equal(isBidAcceptedEvent(unknown), false);
  assert.equal(isAuctionClosedEvent(unknown), false);
  assert.equal(isAuctionCancelledEvent(unknown), false);
});

test('RT-F02 helpers are receive-only (no send/place-bid helpers exported)', async () => {
  const mod = await import('./auctionRealtime.ts');
  const names = Object.keys(mod);
  assert.ok(!names.some((n) => /send|placeBid|place_bid/i.test(n)));
});
