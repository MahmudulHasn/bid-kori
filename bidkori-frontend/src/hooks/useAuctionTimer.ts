'use client';

import { useEffect, useMemo, useState } from 'react';

export type AuctionTimerState = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isClosed: boolean;
};

const EMPTY: AuctionTimerState = {
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  isClosed: true,
};

function computeRemaining(endTime: string | null | undefined): AuctionTimerState {
  if (!endTime) {
    return EMPTY;
  }

  const endMs = new Date(endTime).getTime();
  if (Number.isNaN(endMs)) {
    return EMPTY;
  }

  const diff = endMs - Date.now();
  if (diff <= 0) {
    return EMPTY;
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, isClosed: false };
}

export function useAuctionTimer(endTime: string | null | undefined): AuctionTimerState {
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTick((tick) => tick + 1);
    }, 1000);

    return () => window.clearInterval(id);
  }, []);

  return useMemo(
    () => computeRemaining(endTime),
    // nowTick forces recalculation every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endTime, nowTick],
  );
}

export default useAuctionTimer;
