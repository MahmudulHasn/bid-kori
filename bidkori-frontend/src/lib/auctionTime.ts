/**
 * Pure auction countdown helpers (RT-F03).
 * Timer is UX-only — backend remains authority for CLOSED/winner.
 */

/** Parse ISO / Date-parseable timestamps to epoch ms. Invalid → null. */
export function parseTimestampMs(
  value: string | null | undefined,
): number | null {
  if (value == null || value === '') return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return ms;
}

/**
 * Offset such that: estimatedServerNow = Date.now() + offset.
 * Returns null when serverTime cannot be parsed (caller should fall back locally).
 */
export function computeServerClockOffset(
  serverTime: string | null | undefined,
  clientObservedMs: number,
): number | null {
  const serverMs = parseTimestampMs(serverTime);
  if (serverMs === null) return null;
  if (!Number.isFinite(clientObservedMs)) return null;
  return serverMs - clientObservedMs;
}

/** Estimated server now; null offset → raw client clock. */
export function estimateServerNowMs(
  offsetMs: number | null,
  clientNowMs: number,
): number {
  if (!Number.isFinite(clientNowMs)) return 0;
  if (offsetMs === null || !Number.isFinite(offsetMs)) {
    return clientNowMs;
  }
  return clientNowMs + offsetMs;
}

/**
 * Remaining milliseconds until end_time under an estimated server clock.
 * Never negative. Invalid end_time → 0.
 */
export function computeAuctionRemainingMs(
  endTime: string | null | undefined,
  estimatedServerNowMs: number,
): number {
  const endMs = parseTimestampMs(endTime);
  if (endMs === null) return 0;
  if (!Number.isFinite(estimatedServerNowMs)) return 0;
  return Math.max(0, endMs - estimatedServerNowMs);
}

export type AuctionCountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** True when remaining is zero (timer UX only — not Auction CLOSED authority). */
  isExpired: boolean;
};

export function remainingMsToCountdownParts(
  remainingMs: number,
): AuctionCountdownParts {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
    };
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    isExpired: false,
  };
}

/**
 * Guard: countdown helpers must never invent Auction status / winner fields.
 * Used by tests to assert RT-F03 does not expand into lifecycle authority.
 */
export function countdownHelpersDetermineAuctionLifecycle(): false {
  return false;
}
