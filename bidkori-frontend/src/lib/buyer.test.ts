import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getBidAuctionId,
  getBuyerDashboardMetrics,
  getBuyerWonAuctions,
  getDistinctBidAuctionIds,
  getPendingCheckoutAuctions,
  getRecentBuyerAuctions,
  indexAuctionsById,
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
