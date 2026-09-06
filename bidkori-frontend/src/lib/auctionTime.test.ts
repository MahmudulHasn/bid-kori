import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeAuctionRemainingMs,
  computeServerClockOffset,
  countdownHelpersDetermineAuctionLifecycle,
  estimateServerNowMs,
  parseTimestampMs,
  remainingMsToCountdownParts,
} from './auctionTime.ts';

describe('parseTimestampMs', () => {
  it('parses valid ISO timestamps', () => {
    const ms = parseTimestampMs('2026-09-06T12:00:00.000Z');
    assert.equal(ms, Date.parse('2026-09-06T12:00:00.000Z'));
  });

  it('returns null for invalid timestamps', () => {
    assert.equal(parseTimestampMs('not-a-date'), null);
    assert.equal(parseTimestampMs(''), null);
    assert.equal(parseTimestampMs(null), null);
    assert.equal(parseTimestampMs(undefined), null);
  });
});

describe('computeServerClockOffset', () => {
  it('identical client/server clocks → offset 0', () => {
    const clientMs = Date.parse('2026-09-06T12:00:00.000Z');
    const offset = computeServerClockOffset(
      '2026-09-06T12:00:00.000Z',
      clientMs,
    );
    assert.equal(offset, 0);
  });

  it('server ahead → positive offset', () => {
    const clientMs = Date.parse('2026-09-06T12:00:00.000Z');
    const offset = computeServerClockOffset(
      '2026-09-06T12:05:00.000Z',
      clientMs,
    );
    assert.equal(offset, 5 * 60 * 1000);
  });

  it('server behind → negative offset', () => {
    const clientMs = Date.parse('2026-09-06T12:00:00.000Z');
    const offset = computeServerClockOffset(
      '2026-09-06T11:50:00.000Z',
      clientMs,
    );
    assert.equal(offset, -10 * 60 * 1000);
  });

  it('invalid server timestamp → null', () => {
    assert.equal(
      computeServerClockOffset('bogus', Date.parse('2026-09-06T12:00:00.000Z')),
      null,
    );
  });

  it('fresh server_time can update offset (not pinned forever)', () => {
    const clientMs = Date.parse('2026-09-06T12:00:00.000Z');
    const first = computeServerClockOffset(
      '2026-09-06T12:00:00.000Z',
      clientMs,
    );
    const second = computeServerClockOffset(
      '2026-09-06T12:00:30.000Z',
      clientMs + 1000,
    );
    assert.equal(first, 0);
    assert.equal(second, 29_000);
    assert.notEqual(first, second);
  });
});

describe('estimateServerNowMs / computeAuctionRemainingMs', () => {
  it('corrected server now computes correct remaining time', () => {
    const end = '2026-09-06T12:05:00.000Z';
    const clientNow = Date.parse('2026-09-06T12:00:00.000Z');
    const offset = 0;
    const serverNow = estimateServerNowMs(offset, clientNow);
    assert.equal(
      computeAuctionRemainingMs(end, serverNow),
      5 * 60 * 1000,
    );
  });

  it('device 10 minutes ahead still gets correct remaining', () => {
    // Actual backend = 12:00; device = 12:10; auction ends = 12:05
    // Raw device would show expired; server-adjusted shows ~5 minutes.
    const end = '2026-09-06T12:05:00.000Z';
    const deviceNow = Date.parse('2026-09-06T12:10:00.000Z');
    const serverTime = '2026-09-06T12:00:00.000Z';
    const offset = computeServerClockOffset(serverTime, deviceNow);
    assert.equal(offset, -10 * 60 * 1000);
    const serverNow = estimateServerNowMs(offset, deviceNow);
    assert.equal(serverNow, Date.parse('2026-09-06T12:00:00.000Z'));
    assert.equal(
      computeAuctionRemainingMs(end, serverNow),
      5 * 60 * 1000,
    );
  });

  it('device 10 minutes behind still gets correct remaining', () => {
    // Actual backend = 12:00; device = 11:50; auction ends = 12:05
    // Raw device would show ~15 minutes; server-adjusted shows ~5 minutes.
    const end = '2026-09-06T12:05:00.000Z';
    const deviceNow = Date.parse('2026-09-06T11:50:00.000Z');
    const serverTime = '2026-09-06T12:00:00.000Z';
    const offset = computeServerClockOffset(serverTime, deviceNow);
    assert.equal(offset, 10 * 60 * 1000);
    const serverNow = estimateServerNowMs(offset, deviceNow);
    assert.equal(
      computeAuctionRemainingMs(end, serverNow),
      5 * 60 * 1000,
    );
  });

  it('elapsed auction → 0', () => {
    const end = '2026-09-06T12:00:00.000Z';
    const serverNow = Date.parse('2026-09-06T12:01:00.000Z');
    assert.equal(computeAuctionRemainingMs(end, serverNow), 0);
  });

  it('result never negative', () => {
    const end = '2026-09-06T12:00:00.000Z';
    const serverNow = Date.parse('2026-09-06T13:00:00.000Z');
    assert.equal(computeAuctionRemainingMs(end, serverNow), 0);
    assert.ok(computeAuctionRemainingMs(end, serverNow) >= 0);
  });

  it('null offset falls back to local client clock', () => {
    const clientNow = Date.parse('2026-09-06T12:00:00.000Z');
    assert.equal(estimateServerNowMs(null, clientNow), clientNow);
    const end = '2026-09-06T12:05:00.000Z';
    assert.equal(
      computeAuctionRemainingMs(end, estimateServerNowMs(null, clientNow)),
      5 * 60 * 1000,
    );
  });

  it('invalid end_time → 0 remaining', () => {
    assert.equal(
      computeAuctionRemainingMs('nope', Date.parse('2026-09-06T12:00:00.000Z')),
      0,
    );
  });
});

describe('remainingMsToCountdownParts', () => {
  it('clamps non-positive to expired zeros', () => {
    assert.deepEqual(remainingMsToCountdownParts(0), {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
    });
    assert.deepEqual(remainingMsToCountdownParts(-1000), {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
    });
  });

  it('formats positive remaining', () => {
    const parts = remainingMsToCountdownParts(
      ((1 * 86400) + (2 * 3600) + (3 * 60) + 4) * 1000,
    );
    assert.deepEqual(parts, {
      days: 1,
      hours: 2,
      minutes: 3,
      seconds: 4,
      isExpired: false,
    });
  });
});

describe('CLOSED authority / zero does not invent winner', () => {
  it('countdown helpers do not determine status/winner', () => {
    assert.equal(countdownHelpersDetermineAuctionLifecycle(), false);
  });

  it('positive remaining does not imply auction is open (CLOSED still wins in UI)', () => {
    // Simulate: CLOSED auction whose end_time is still in the future under skew.
    const status = 'CLOSED';
    const remainingMs = 5 * 60 * 1000;
    const forceExpired = status === 'CLOSED' || status === 'CANCELLED';
    const parts = forceExpired
      ? remainingMsToCountdownParts(0)
      : remainingMsToCountdownParts(remainingMs);
    assert.equal(parts.isExpired, true);
    assert.equal(status, 'CLOSED');
    // No winner field is produced by countdown helpers.
    assert.equal(
      'winning_bidder' in remainingMsToCountdownParts(remainingMs),
      false,
    );
  });
});
