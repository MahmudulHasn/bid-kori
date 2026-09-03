import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBuyerBidActivity,
  getBidAuctionId,
  getBuyerAuctionBidStatus,
  getBuyerDashboardMetrics,
  getBuyerHighestBid,
  getBuyerLatestBid,
  getBuyerWonAuctions,
  getDistinctBidAuctionIds,
  getPendingCheckoutAuctions,
  getRecentBuyerAuctions,
  groupBuyerBidsByAuction,
  indexAuctionsById,
  matchesBuyerMyBidsFilter,
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

test('buyer only gets auctions where winning_bidder matches user', () => {
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

test('non-winning CLOSED auction is not counted as won', () => {
  const auctions = [
    auction({ id: 1, status: 'CLOSED', winning_bidder: 99 }),
  ];
  assert.equal(getBuyerWonAuctions(auctions, 7).length, 0);
});

test('ACTIVE auction is not counted as won', () => {
  const auctions = [
    auction({ id: 1, status: 'ACTIVE', winning_bidder: 7 }),
    auction({ id: 2, status: 'CANCELLED', winning_bidder: 7 }),
  ];
  assert.equal(getBuyerWonAuctions(auctions, 7).length, 0);
});

test('pending checkout logic excludes already-paid auction', () => {
  const auctions = [
    auction({ id: 1, status: 'CLOSED', winning_bidder: 7, is_paid: false }),
    auction({ id: 2, status: 'CLOSED', winning_bidder: 7, is_paid: true }),
    auction({ id: 3, status: 'CLOSED', winning_bidder: 7 }),
  ];
  const pending = getPendingCheckoutAuctions(auctions, 7);
  assert.deepEqual(
    pending.map((item) => item.id),
    [3, 1],
  );
  assert.equal(pending.some((item) => item.id === 2), false);
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
    pendingCheckout: 1,
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
