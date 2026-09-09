import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  auctionHasBids,
  formatBidHistoryEmptyLabel,
  getAuctionDisplayState,
  getAuctionDisplayStateLabel,
  getAuctionReservePresentation,
  getAuctionViewerBidState,
  getAuctionViewerBidStateLabel,
  getClosedNoWinnerLabel,
  getNextValidBidAmount,
  getPlaceBidErrorMessage,
  myHighestBidAmountForAuction,
  prependRealtimeBidToHistory,
} from './auctionDetailUx.ts';
import type { Auction } from './types.ts';

function baseAuction(overrides: Partial<Auction> = {}): Auction {
  return {
    id: 1,
    starting_bid: '1000.00',
    current_highest_bid: '1000.00',
    min_increment: '100.00',
    status: 'ACTIVE',
    start_time: '2026-09-09T10:00:00.000Z',
    end_time: '2026-09-09T12:00:00.000Z',
    bid_count: 0,
    has_reserve: false,
    reserve_met: null,
    winning_bidder: null,
    ...overrides,
  };
}

describe('getAuctionDisplayState', () => {
  const start = '2026-09-09T10:00:00.000Z';
  const end = '2026-09-09T12:00:00.000Z';

  it('maps before start ACTIVE → Upcoming', () => {
    assert.equal(
      getAuctionDisplayState({
        status: 'ACTIVE',
        startTime: start,
        endTime: end,
        nowMs: Date.parse('2026-09-09T09:59:00.000Z'),
      }),
      'UPCOMING',
    );
    assert.equal(getAuctionDisplayStateLabel('UPCOMING'), 'Upcoming');
  });

  it('maps within window ACTIVE → Live', () => {
    assert.equal(
      getAuctionDisplayState({
        status: 'ACTIVE',
        startTime: start,
        endTime: end,
        nowMs: Date.parse('2026-09-09T11:00:00.000Z'),
      }),
      'LIVE',
    );
  });

  it('maps past end ACTIVE → Finalizing', () => {
    assert.equal(
      getAuctionDisplayState({
        status: 'ACTIVE',
        startTime: start,
        endTime: end,
        nowMs: Date.parse('2026-09-09T12:00:00.000Z'),
      }),
      'FINALIZING',
    );
  });

  it('maps CLOSED / CANCELLED regardless of clock', () => {
    assert.equal(
      getAuctionDisplayState({
        status: 'CLOSED',
        startTime: start,
        endTime: end,
        nowMs: Date.parse('2026-09-09T11:00:00.000Z'),
      }),
      'CLOSED',
    );
    assert.equal(
      getAuctionDisplayState({
        status: 'CANCELLED',
        startTime: start,
        endTime: end,
        nowMs: Date.parse('2026-09-09T11:00:00.000Z'),
      }),
      'CANCELLED',
    );
  });
});

describe('reserve presentation', () => {
  it('hides reserve UI when no reserve', () => {
    assert.equal(
      getAuctionReservePresentation(baseAuction({ has_reserve: false })).kind,
      'none',
    );
  });

  it('shows unmet / met during live auction', () => {
    assert.equal(
      getAuctionReservePresentation(
        baseAuction({ has_reserve: true, reserve_met: false }),
      ).kind,
      'unmet',
    );
    assert.equal(
      getAuctionReservePresentation(
        baseAuction({ has_reserve: true, reserve_met: true }),
      ).kind,
      'met',
    );
  });

  it('closed no-winner reserve messaging without exposing amount', () => {
    const closed = baseAuction({
      status: 'CLOSED',
      has_reserve: true,
      reserve_met: false,
      winning_bidder: null,
    });
    const presentation = getAuctionReservePresentation(closed);
    assert.equal(presentation.kind, 'closed_unmet');
    assert.match(presentation.label, /reserve was not met/i);
    assert.ok(!presentation.label.includes('500'));
    assert.match(getClosedNoWinnerLabel(closed), /reserve was not met/i);
  });
});

describe('next valid bid + has bids', () => {
  it('uses starting + increment when no bids', () => {
    assert.equal(auctionHasBids(baseAuction({ bid_count: 0 })), false);
    assert.equal(getNextValidBidAmount(baseAuction({ bid_count: 0 })), 1100);
  });

  it('uses current + increment when bids exist', () => {
    assert.equal(
      getNextValidBidAmount(
        baseAuction({
          bid_count: 2,
          current_highest_bid: '2000.00',
          min_increment: '100.00',
        }),
      ),
      2100,
    );
  });
});

describe('viewer bid state', () => {
  it('covers highest / outbid / won / lost / cancelled', () => {
    const live = baseAuction({
      bid_count: 2,
      current_highest_bid: '2000.00',
    });
    assert.equal(
      getAuctionViewerBidState({
        auction: live,
        isAuthenticated: true,
        isOwner: false,
        userId: 9,
        myHighestBidAmount: 2000,
        displayState: 'LIVE',
      }),
      'highest',
    );
    assert.equal(
      getAuctionViewerBidState({
        auction: live,
        isAuthenticated: true,
        isOwner: false,
        userId: 9,
        myHighestBidAmount: 1500,
        displayState: 'LIVE',
      }),
      'outbid',
    );
    assert.match(
      getAuctionViewerBidStateLabel('won') ?? '',
      /you won/i,
    );
    assert.equal(
      getAuctionViewerBidState({
        auction: baseAuction({
          status: 'CLOSED',
          winning_bidder: 9,
          bid_count: 1,
        }),
        isAuthenticated: true,
        isOwner: false,
        userId: 9,
        myHighestBidAmount: 2000,
        displayState: 'CLOSED',
      }),
      'won',
    );
    assert.equal(
      getAuctionViewerBidState({
        auction: baseAuction({
          status: 'CLOSED',
          winning_bidder: 3,
          bid_count: 1,
        }),
        isAuthenticated: true,
        isOwner: false,
        userId: 9,
        myHighestBidAmount: 1500,
        displayState: 'CLOSED',
      }),
      'did_not_win',
    );
    assert.equal(
      getAuctionViewerBidState({
        auction: baseAuction({ status: 'CANCELLED' }),
        isAuthenticated: true,
        isOwner: false,
        userId: 9,
        myHighestBidAmount: 1500,
        displayState: 'CANCELLED',
      }),
      'cancelled',
    );
  });
});

describe('bid UX helpers', () => {
  it('empty history label', () => {
    assert.equal(formatBidHistoryEmptyLabel(), 'No bids yet.');
  });

  it('normalizes place-bid errors without dumping objects', () => {
    assert.match(
      getPlaceBidErrorMessage({
        response: {
          status: 400,
          data: {
            error: 'Bid amount must be at least 2100.00 (current highest bid plus minimum increment).',
          },
        },
      }),
      /at least|increment|too low/i,
    );
    assert.equal(
      getPlaceBidErrorMessage({ response: { status: 401, data: {} } }),
      'Please log in to place a bid.',
    );
  });

  it('prepends realtime bid and tracks personal high', () => {
    const next = prependRealtimeBidToHistory(
      [],
      {
        id: 5,
        amount: '1500.00',
        bidder_username: 'alice',
        timestamp: '2026-09-09T11:01:00.000Z',
      },
      1,
    );
    assert.equal(next.length, 1);
    assert.equal(next[0]?.bidder_username, 'alice');
    assert.equal(
      myHighestBidAmountForAuction(
        [
          { id: 1, auction: 1, amount: '1000' },
          { id: 2, auction: 1, amount: '1500' },
          { id: 3, auction: 9, amount: '9000' },
        ],
        1,
      ),
      1500,
    );
  });
});
