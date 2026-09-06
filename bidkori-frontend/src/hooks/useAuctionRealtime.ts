'use client';

import { useEffect, useRef, useState } from 'react';

import {
  buildAuctionWebSocketUrl,
  isBidAcceptedEvent,
  parseWebSocketJson,
  type BidAcceptedEvent,
} from '@/lib/auctionRealtime';

export type AuctionRealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

type UseAuctionRealtimeOptions = {
  auctionId: string | number | null | undefined;
  enabled?: boolean;
  onBidAccepted: (event: BidAcceptedEvent) => void;
  /** Called after an unexpected disconnect reconnects successfully. */
  onReconnect?: () => void;
};

const MAX_BACKOFF_MS = 30_000;

function nextBackoffMs(attempt: number): number {
  const exp = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, attempt));
  return exp;
}

/**
 * Subscribe to `/ws/auctions/<id>/` for `bid.accepted` events.
 * Receive-only — place bids via REST. Safe under Next.js (browser-only).
 */
export function useAuctionRealtime({
  auctionId,
  enabled = true,
  onBidAccepted,
  onReconnect,
}: UseAuctionRealtimeOptions): { status: AuctionRealtimeStatus } {
  const inactive =
    !enabled || auctionId == null || auctionId === '';
  const [liveStatus, setLiveStatus] =
    useState<AuctionRealtimeStatus>('connecting');
  const onBidAcceptedRef = useRef(onBidAccepted);
  const onReconnectRef = useRef(onReconnect);

  useEffect(() => {
    onBidAcceptedRef.current = onBidAccepted;
  }, [onBidAccepted]);

  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    if (inactive) {
      return;
    }
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      return;
    }

    let intentionalClose = false;
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempt = 0;
    let hasConnectedOnce = false;

    const clearReconnectTimer = () => {
      if (reconnectTimer != null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      if (cancelled || intentionalClose) {
        return;
      }

      clearReconnectTimer();
      setLiveStatus(hasConnectedOnce ? 'reconnecting' : 'connecting');

      const url = buildAuctionWebSocketUrl(auctionId);
      const ws = new WebSocket(url);
      socket = ws;

      ws.onopen = () => {
        if (cancelled || intentionalClose) {
          ws.close();
          return;
        }
        const isReconnect = hasConnectedOnce;
        hasConnectedOnce = true;
        attempt = 0;
        setLiveStatus('connected');
        if (isReconnect) {
          onReconnectRef.current?.();
        }
      };

      ws.onmessage = (message) => {
        if (cancelled) return;
        const raw =
          typeof message.data === 'string'
            ? message.data
            : String(message.data ?? '');
        const parsed = parseWebSocketJson(raw);
        if (!isBidAcceptedEvent(parsed)) {
          return;
        }
        if (Number(parsed.auction_id) !== Number(auctionId)) {
          return;
        }
        onBidAcceptedRef.current(parsed);
      };

      ws.onerror = () => {
        // `onclose` handles reconnect; avoid duplicate work here.
      };

      ws.onclose = () => {
        if (socket === ws) {
          socket = null;
        }
        if (cancelled || intentionalClose) {
          setLiveStatus('disconnected');
          return;
        }
        setLiveStatus('reconnecting');
        const delay = nextBackoffMs(attempt);
        attempt += 1;
        reconnectTimer = window.setTimeout(() => {
          connect();
        }, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      intentionalClose = true;
      clearReconnectTimer();
      if (socket) {
        socket.close();
        socket = null;
      }
    };
  }, [auctionId, enabled, inactive]);

  if (inactive) {
    return { status: 'idle' };
  }

  return { status: liveStatus };
}

export default useAuctionRealtime;
