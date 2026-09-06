'use client';

import { useEffect, useRef, useState } from 'react';

import { parseWebSocketJson } from '@/lib/auctionRealtime';
import {
  buildAuthenticateMessage,
  buildNotificationWebSocketUrl,
  isNotificationAuthCloseCode,
  isNotificationAuthFailureEvent,
  isNotificationAuthenticatedEvent,
  isNotificationCreatedEvent,
  nextNotificationReconnectDelayMs,
  type NotificationCreatedEvent,
} from '@/lib/notificationRealtime';
import type { NotificationItem } from '@/lib/notifications';

export type NotificationRealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'auth_failed';

type UseNotificationRealtimeOptions = {
  enabled?: boolean;
  token: string | null | undefined;
  onNotificationCreated: (notification: NotificationItem) => void;
  /** After unexpected disconnect and successful re-auth. */
  onReconnect?: () => void;
};

/**
 * Private `/ws/notifications/` client with DRF-token handshake.
 * Receive-only after authenticate — no read/create over the socket.
 */
export function useNotificationRealtime({
  enabled = true,
  token,
  onNotificationCreated,
  onReconnect,
}: UseNotificationRealtimeOptions): { status: NotificationRealtimeStatus } {
  const inactive = !enabled || !token;
  const [liveStatus, setLiveStatus] =
    useState<NotificationRealtimeStatus>('connecting');
  const onCreatedRef = useRef(onNotificationCreated);
  const onReconnectRef = useRef(onReconnect);
  const tokenRef = useRef(token);

  useEffect(() => {
    onCreatedRef.current = onNotificationCreated;
  }, [onNotificationCreated]);

  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    if (inactive) {
      return;
    }
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      return;
    }

    let intentionalClose = false;
    let cancelled = false;
    let authFailed = false;
    let authenticated = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempt = 0;
    let hasAuthenticatedOnce = false;

    const clearReconnectTimer = () => {
      if (reconnectTimer != null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      if (cancelled || intentionalClose || authFailed) {
        return;
      }
      const currentToken = tokenRef.current;
      if (!currentToken) {
        return;
      }

      clearReconnectTimer();
      authenticated = false;
      setLiveStatus(hasAuthenticatedOnce ? 'reconnecting' : 'connecting');

      const url = buildNotificationWebSocketUrl();
      const ws = new WebSocket(url);
      socket = ws;

      ws.onopen = () => {
        if (cancelled || intentionalClose) {
          ws.close();
          return;
        }
        setLiveStatus('authenticating');
        try {
          ws.send(JSON.stringify(buildAuthenticateMessage(currentToken)));
        } catch {
          ws.close();
        }
      };

      ws.onmessage = (message) => {
        if (cancelled) return;
        const raw =
          typeof message.data === 'string'
            ? message.data
            : String(message.data ?? '');
        const parsed = parseWebSocketJson(raw);
        if (parsed == null) return;

        if (isNotificationAuthenticatedEvent(parsed)) {
          authenticated = true;
          const isReconnect = hasAuthenticatedOnce;
          hasAuthenticatedOnce = true;
          attempt = 0;
          setLiveStatus('connected');
          if (isReconnect) {
            onReconnectRef.current?.();
          }
          return;
        }

        if (isNotificationAuthFailureEvent(parsed)) {
          // already_authenticated after success is ignored; others stop reconnect.
          const code =
            typeof parsed === 'object' &&
            parsed &&
            'code' in parsed
              ? String((parsed as { code?: unknown }).code)
              : '';
          if (code === 'already_authenticated' && authenticated) {
            return;
          }
          authFailed = true;
          intentionalClose = true;
          setLiveStatus('auth_failed');
          clearReconnectTimer();
          ws.close();
          return;
        }

        if (!authenticated) {
          return;
        }

        if (isNotificationCreatedEvent(parsed)) {
          onCreatedRef.current(
            (parsed as NotificationCreatedEvent).notification,
          );
        }
      };

      ws.onerror = () => {
        // onclose handles reconnect.
      };

      ws.onclose = (event) => {
        if (socket === ws) {
          socket = null;
        }
        authenticated = false;

        if (cancelled || intentionalClose || authFailed) {
          if (!authFailed) {
            setLiveStatus('disconnected');
          }
          return;
        }

        if (isNotificationAuthCloseCode(event.code)) {
          authFailed = true;
          setLiveStatus('auth_failed');
          return;
        }

        setLiveStatus('reconnecting');
        const delay = nextNotificationReconnectDelayMs(attempt);
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
  }, [inactive, token]);

  if (inactive) {
    return { status: 'idle' };
  }

  return { status: liveStatus };
}

export default useNotificationRealtime;
