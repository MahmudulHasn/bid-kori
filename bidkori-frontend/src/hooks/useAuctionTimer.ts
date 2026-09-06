'use client';

import { useEffect, useState } from 'react';

import {
  computeAuctionRemainingMs,
  computeServerClockOffset,
  estimateServerNowMs,
  remainingMsToCountdownParts,
} from '@/lib/auctionTime';

export type AuctionTimerState = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /**
   * True when estimated remaining time is zero.
   * UX only — does not mean backend status is CLOSED.
   */
  isClosed: boolean;
};

const EMPTY: AuctionTimerState = {
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  isClosed: true,
};

export type UseAuctionTimerOptions = {
  /** When true, force expired display (backend CLOSED/CANCELLED). */
  forceExpired?: boolean;
};

/**
 * Client-side Auction countdown.
 * Uses REST `server_time` when available to estimate backend clock; falls back
 * to local `Date.now()` when offset is unavailable.
 *
 * Ticking and Date sampling stay in an effect (SSR/hydration-safe).
 */
export function useAuctionTimer(
  endTime: string | null | undefined,
  serverTime?: string | null | undefined,
  options?: UseAuctionTimerOptions,
): AuctionTimerState {
  const forceExpired = options?.forceExpired === true;
  /** null until mounted — avoids SSR/client Date.now() hydration mismatch. */
  const [clientNowMs, setClientNowMs] = useState<number | null>(null);
  const [offsetMs, setOffsetMs] = useState<number | null>(null);
  const [syncedServerTime, setSyncedServerTime] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const bump = () => {
      setClientNowMs(Date.now());
    };
    bump();
    const id = window.setInterval(bump, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Recompute offset when a new REST server_time arrives (render-time adjust).
  if (
    clientNowMs != null &&
    serverTime != null &&
    serverTime !== '' &&
    serverTime !== syncedServerTime
  ) {
    const next = computeServerClockOffset(serverTime, clientNowMs);
    setSyncedServerTime(serverTime);
    if (next !== null) {
      setOffsetMs(next);
    }
    // Invalid server_time: keep previous offset (or null → local fallback).
  }

  if (forceExpired || clientNowMs == null || !endTime) {
    return EMPTY;
  }

  const estimatedNow = estimateServerNowMs(offsetMs, clientNowMs);
  const remainingMs = computeAuctionRemainingMs(endTime, estimatedNow);
  const parts = remainingMsToCountdownParts(remainingMs);

  return {
    days: parts.days,
    hours: parts.hours,
    minutes: parts.minutes,
    seconds: parts.seconds,
    isClosed: parts.isExpired,
  };
}

export default useAuctionTimer;
