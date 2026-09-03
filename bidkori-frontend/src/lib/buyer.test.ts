import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBuyerBidActivity,
  getBidAuctionId,
  getBuyerAuctionBidStatus,
  getBuyerDashboardMetrics,
  getBuyerHighestBid,
  getBuyerLatestBid,
  BUYER_WON_PATH,
  getAuctionPaymentState,
  getBuyerWonAuctions,
  getDistinctBidAuctionIds,
  getPendingCheckoutAuctions,
  getRecentBuyerAuctions,
  getUnpaidWonAuctions,
  groupBuyerBidsByAuction,
  indexAuctionsById,
  matchesBuyerMyBidsFilter,
  matchesBuyerWonFilter,
  sortWonAuctions,
  withAuctionMarkedPaid,
} from './buyer.ts';
import type { Auction, UserBid } from './types.ts';

function auction(partial: Partial<Auction> & Pick<Auction, 'id'>): Auction {
  return {
    current_highest_bid: '100',
    ...partial,
  };
}

test('distinct auctions from repeated bids are counted once', () => {
  const bids: UserBid[] = [
    { id: 1, auction: 10, amount: '110' },
    { id: 2, auction: 10, amount: '120' },
    { id: 3, auction: { id: 11, current_highest_bid: '50' }, amount: '50' },
    { id: 4, auction: 11, amount: '60' },
  ];
  assert.deepEqual(getDistinctBidAuctionIds(bids), [10, 11]);
  assert.equal(getBuyerDashboardMetrics(bids, [], 1).auctionsBidOn, 2);
});

test('CLOSED + current user winner is included in won auctions', () => {
  const auctions = [
    auction({ id: 1, status: 'CLOSED', winning_bidder: 7 }),
    auction({ id: 2, status: 'CLOSED', winning_bidder: 8 }),
    auction({ id: 3, status: 'CLOSED', winning_bidder: 7 }),
  ];
  const won = getBuyerWonAuctions(auctions, 7);
  assert.deepEqual(
    won.map((item) => item.id),
    [3, 1],
  );
});

test('CLOSED + different winner is excluded from won auctions', () => {
  const auctions = [
    auction({ id: 1, status: 'CLOSED', winning_bidder: 99 }),
  ];
  assert.equal(getBuyerWonAuctions(auctions, 7).length, 0);
});

test('CLOSED + winning_bidder null is excluded from won auctions', () => {
  const auctions = [
    auction({ id: 1, status: 'CLOSED', winning_bidder: null, current_highest_bid: '500' }),
  ];
  assert.equal(getBuyerWonAuctions(auctions, 7).length, 0);
});

test('ACTIVE highest bid is not treated as a win', () => {
  const auctions = [
    auction({
      id: 1,
      status: 'ACTIVE',
      winning_bidder: 7,
      current_highest_bid: '250',
    }),
  ];
  assert.equal(getBuyerWonAuctions(auctions, 7).length, 0);
});

test('CANCELLED auction is excluded from won auctions', () => {
  const auctions = [
    auction({ id: 1, status: 'CANCELLED', winning_bidder: 7 }),
  ];
  assert.equal(getBuyerWonAuctions(auctions, 7).length, 0);
});

test('explicit is_paid true is paid, false is unpaid, missing is unknown', () => {
  assert.equal(getAuctionPaymentState({ is_paid: true }), 'paid');
  assert.equal(getAuctionPaymentState({ is_paid: false }), 'unpaid');
  assert.equal(getAuctionPaymentState({}), 'unknown');
  assert.equal(matchesBuyerWonFilter({ is_paid: true }, 'paid'), true);
  assert.equal(matchesBuyerWonFilter({ is_paid: false }, 'awaiting_checkout'), true);
  assert.equal(matchesBuyerWonFilter({}, 'awaiting_checkout'), false);
  assert.equal(matchesBuyerWonFilter({}, 'paid'), false);
});

test('pending checkout only includes explicit unpaid won auctions', () => {
  const auctions = [
    auction({ id: 1, status: 'CLOSED', winning_bidder: 7, is_paid: false }),
    auction({ id: 2, status: 'CLOSED', winning_bidder: 7, is_paid: true }),
    auction({ id: 3, status: 'CLOSED', winning_bidder: 7 }),
  ];
  const pending = getPendingCheckoutAuctions(auctions, 7);
  const unpaid = getUnpaidWonAuctions(auctions, 7);
  assert.deepEqual(
    pending.map((item) => item.id),
    [1],
  );
  assert.deepEqual(
    unpaid.map((item) => item.id),
    [1],
  );
  assert.equal(pending.some((item) => item.id === 2), false);
  assert.equal(pending.some((item) => item.id === 3), false);
});

test('won auctions sort by end_time descending with id tie-break', () => {
  const auctions = [
    auction({
      id: 1,
      status: 'CLOSED',
      winning_bidder: 7,
      end_time: '2026-01-01T00:00:00Z',
    }),
    auction({
      id: 2,
      status: 'CLOSED',
      winning_bidder: 7,
      end_time: '2026-03-01T00:00:00Z',
    }),
    auction({
      id: 3,
      status: 'CLOSED',
      winning_bidder: 7,
      end_time: '2026-03-01T00:00:00Z',
    }),
  ];
  const won = getBuyerWonAuctions(auctions, 7);
  assert.deepEqual(
    won.map((item) => item.id),
    [3, 2, 1],
  );
  const resorted = sortWonAuctions(auctions);
  assert.deepEqual(
    resorted.map((item) => item.id),
    [3, 2, 1],
  );
});

test('withAuctionMarkedPaid copies the list and does not mutate source', () => {
  const auctions = [
    auction({ id: 1, status: 'CLOSED', winning_bidder: 7, is_paid: false }),
  ];
  const next = withAuctionMarkedPaid(auctions, 1);
  assert.equal(auctions[0].is_paid, false);
  assert.equal(next[0].is_paid, true);
  assert.equal(next[0] === auctions[0], false);
});

test('buyer won path is the dashboard preview destination', () => {
  assert.equal(BUYER_WON_PATH, '/buyer/won');
});

test('empty bid list produces zero activity', () => {
  const bids: UserBid[] = [];
  const auctions = [
    auction({ id: 1, status: 'CLOSED', winning_bidder: 7 }),
  ];
  assert.deepEqual(getDistinctBidAuctionIds(bids), []);
  assert.deepEqual(getRecentBuyerAuctions(bids, indexAuctionsById(auctions)), []);
  assert.deepEqual(getBuyerDashboardMetrics(bids, auctions, 7), {
    auctionsBidOn: 0,
    wonAuctions: 1,
    pendingCheckout: 0,
  });
});

test('recent activity ordering is deterministic', () => {
  const bids: UserBid[] = [
    { id: 1, auction: 10, amount: '10', timestamp: '2026-01-01T10:00:00Z' },
    { id: 2, auction: 11, amount: '20', timestamp: '2026-01-03T10:00:00Z' },
    { id: 3, auction: 10, amount: '30', timestamp: '2026-01-02T10:00:00Z' },
    { id: 4, auction: 12, amount: '40', timestamp: '2026-01-03T10:00:00Z' },
  ];
  const auctions = [
    auction({ id: 10 }),
    auction({ id: 11 }),
    auction({ id: 12 }),
  ];
  const recent = getRecentBuyerAuctions(bids, indexAuctionsById(auctions), 3);
  assert.deepEqual(
    recent.map((item) => item.id),
    [12, 11, 10],
  );
});

test('buyer helpers do not mutate source arrays', () => {
  const bids: UserBid[] = [
    { id: 2, auction: 11, amount: '20', timestamp: '2026-01-03T10:00:00Z' },
    { id: 1, auction: 10, amount: '10', timestamp: '2026-01-01T10:00:00Z' },
  ];
  const auctions = [
    auction({ id: 11, status: 'CLOSED', winning_bidder: 7, end_time: '2026-01-01T00:00:00Z' }),
    auction({ id: 10, status: 'CLOSED', winning_bidder: 7, end_time: '2026-01-02T00:00:00Z' }),
  ];
  const bidSnapshot = bids.map((bid) => ({ ...bid }));
  const auctionIds = auctions.map((item) => item.id);

  getDistinctBidAuctionIds(bids);
  getBuyerWonAuctions(auctions, 7);
  getPendingCheckoutAuctions(auctions, 7);
  sortWonAuctions(auctions);
  getRecentBuyerAuctions(bids, indexAuctionsById(auctions));

  assert.deepEqual(bids, bidSnapshot);
  assert.deepEqual(
    auctions.map((item) => item.id),
    auctionIds,
  );
});

test('getBidAuctionId supports numeric and nested auction values', () => {
  assert.equal(getBidAuctionId({ id: 1, auction: 42, amount: '1' }), 42);
  assert.equal(
    getBidAuctionId({
      id: 2,
      auction: { id: 9, current_highest_bid: '1' },
      amount: '1',
    }),
    9,
  );
});

test('multiple bids on the same auction produce one grouped activity entry', () => {
  const bids: UserBid[] = [
    { id: 1, auction: 10, amount: '100', timestamp: '2026-01-01T10:00:00Z' },
    { id: 2, auction: 10, amount: '150', timestamp: '2026-01-01T11:00:00Z' },
    { id: 3, auction: 10, amount: '120', timestamp: '2026-01-01T10:30:00Z' },
  ];
  const groups = groupBuyerBidsByAuction(bids);
  assert.equal(groups.size, 1);
  assert.equal(groups.get(10)?.length, 3);

  const rows = buildBuyerBidActivity(
    bids,
    indexAuctionsById([auction({ id: 10, status: 'ACTIVE', current_highest_bid: '200' })]),
    7,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bidCount, 3);
});

test('highest Buyer bid is calculated correctly', () => {
  const bids: UserBid[] = [
    { id: 1, auction: 10, amount: '100' },
    { id: 2, auction: 10, amount: '175' },
    { id: 3, auction: 10, amount: '150' },
  ];
  const highest = getBuyerHighestBid(bids);
  assert.equal(highest?.id, 2);
  assert.equal(highest?.amount, '175');
});

test('latest Buyer bid is calculated correctly', () => {
  const bids: UserBid[] = [
    { id: 1, auction: 10, amount: '100', timestamp: '2026-01-01T10:00:00Z' },
    { id: 2, auction: 10, amount: '175', timestamp: '2026-01-01T09:00:00Z' },
    { id: 3, auction: 10, amount: '150', timestamp: '2026-01-01T12:00:00Z' },
  ];
  const latest = getBuyerLatestBid(bids);
  assert.equal(latest?.id, 3);
});

test('ACTIVE + user highest < current highest → Outbid', () => {
  assert.equal(
    getBuyerAuctionBidStatus(
      auction({ id: 1, status: 'ACTIVE', current_highest_bid: '200' }),
      150,
      7,
    ),
    'outbid',
  );
});

test('ACTIVE + user highest == current highest → Currently Highest', () => {
  assert.equal(
    getBuyerAuctionBidStatus(
      auction({ id: 1, status: 'ACTIVE', current_highest_bid: '200' }),
      200,
      7,
    ),
    'currently_highest',
  );
});

test('CLOSED + winning_bidder == user → Won', () => {
  assert.equal(
    getBuyerAuctionBidStatus(
      auction({ id: 1, status: 'CLOSED', winning_bidder: 7, current_highest_bid: '200' }),
      200,
      7,
    ),
    'won',
  );
});

test('CLOSED + different winner → Lost', () => {
  assert.equal(
    getBuyerAuctionBidStatus(
      auction({ id: 1, status: 'CLOSED', winning_bidder: 9, current_highest_bid: '200' }),
      180,
      7,
    ),
    'lost',
  );
});

test('CLOSED + winning_bidder null → not Won', () => {
  assert.equal(
    getBuyerAuctionBidStatus(
      auction({ id: 1, status: 'CLOSED', winning_bidder: null, current_highest_bid: '200' }),
      200,
      7,
    ),
    'lost',
  );
});

test('CANCELLED → Cancelled', () => {
  assert.equal(
    getBuyerAuctionBidStatus(
      auction({ id: 1, status: 'CANCELLED', current_highest_bid: '200' }),
      200,
      7,
    ),
    'cancelled',
  );
  assert.equal(
    matchesBuyerMyBidsFilter({ status: 'cancelled' }, 'ended'),
    true,
  );
  assert.equal(
    matchesBuyerMyBidsFilter({ status: 'cancelled' }, 'won'),
    false,
  );
});

test('repeated bids are counted correctly', () => {
  const rows = buildBuyerBidActivity(
    [
      { id: 1, auction: 10, amount: '10', timestamp: '2026-01-01T10:00:00Z' },
      { id: 2, auction: 10, amount: '20', timestamp: '2026-01-01T11:00:00Z' },
    ],
    indexAuctionsById([auction({ id: 10, status: 'ACTIVE', current_highest_bid: '20' })]),
    7,
  );
  assert.equal(rows[0].bidCount, 2);
});

test('latest-activity sorting is deterministic', () => {
  const bids: UserBid[] = [
    { id: 1, auction: 10, amount: '10', timestamp: '2026-01-01T10:00:00Z' },
    { id: 2, auction: 11, amount: '20', timestamp: '2026-01-03T10:00:00Z' },
    { id: 3, auction: 12, amount: '40', timestamp: '2026-01-03T10:00:00Z' },
  ];
  const rows = buildBuyerBidActivity(
    bids,
    indexAuctionsById([
      auction({ id: 10, status: 'ACTIVE' }),
      auction({ id: 11, status: 'ACTIVE' }),
      auction({ id: 12, status: 'ACTIVE' }),
    ]),
    7,
  );
  assert.deepEqual(
    rows.map((row) => row.auctionId),
    [12, 11, 10],
  );
});

test('source arrays are not mutated by bid activity helpers', () => {
  const bids: UserBid[] = [
    { id: 2, auction: 11, amount: '20', timestamp: '2026-01-03T10:00:00Z' },
    { id: 1, auction: 10, amount: '10', timestamp: '2026-01-01T10:00:00Z' },
  ];
  const auctions = [
    auction({ id: 11, status: 'ACTIVE', current_highest_bid: '30' }),
    auction({ id: 10, status: 'CLOSED', winning_bidder: 7 }),
  ];
  const bidSnapshot = bids.map((bid) => ({ ...bid }));
  const auctionIds = auctions.map((item) => item.id);

  buildBuyerBidActivity(bids, indexAuctionsById(auctions), 7);
  groupBuyerBidsByAuction(bids);

  assert.deepEqual(bids, bidSnapshot);
  assert.deepEqual(
    auctions.map((item) => item.id),
    auctionIds,
  );
});

test('unresolved auction IDs are handled safely', () => {
  const rows = buildBuyerBidActivity(
    [{ id: 1, auction: 99, amount: '50', timestamp: '2026-01-01T10:00:00Z' }],
    indexAuctionsById([]),
    7,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].auction, null);
  assert.equal(rows[0].status, 'unresolved');
  assert.equal(rows[0].currentHighestAmount, null);
  assert.equal(matchesBuyerMyBidsFilter(rows[0], 'all'), true);
  assert.equal(matchesBuyerMyBidsFilter(rows[0], 'active'), false);
});

test('ACTIVE past end_time is awaiting finalization, not Won', () => {
  const now = Date.parse('2026-09-04T12:00:00Z');
  assert.equal(
    getBuyerAuctionBidStatus(
      auction({
        id: 1,
        status: 'ACTIVE',
        current_highest_bid: '200',
        end_time: '2026-09-04T11:00:00Z',
        winning_bidder: 7,
      }),
      200,
      7,
      now,
    ),
    'awaiting_finalization',
  );
});
