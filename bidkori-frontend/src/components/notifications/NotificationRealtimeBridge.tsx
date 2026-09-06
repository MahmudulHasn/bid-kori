'use client';

import { useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useSWRConfig } from 'swr';

import { useAuth } from '@/context/AuthContext';
import { useNotificationRealtime } from '@/hooks/useNotificationRealtime';
import {
  getNotificationToastTone,
  mergeNotificationIntoFirstPage,
} from '@/lib/notificationRealtime';
import {
  buildNotificationsListApiPath,
  getNotificationAuctionHref,
  type NotificationItem,
  type NotificationListResponse,
} from '@/lib/notifications';
import type { UserRole } from '@/lib/types';

type NotificationRealtimeBridgeProps = {
  role: Extract<UserRole, 'BUYER' | 'SELLER'>;
};

const FIRST_PAGE_KEY = buildNotificationsListApiPath(1);
const SEEN_CAP = 200;

function showLiveNotificationToast(
  notification: NotificationItem,
  role: Extract<UserRole, 'BUYER' | 'SELLER'>,
): void {
  const tone = getNotificationToastTone(notification.type);
  const text = notification.title || notification.message;
  const href = getNotificationAuctionHref(role, notification.auction_id);
  const content = href ? `${text} — View auction` : text;
  const options = {
    id: `notification-${notification.id}`,
    duration: 5000,
  };

  if (tone === 'warning') {
    toast.error(content, options);
    return;
  }
  if (tone === 'success') {
    toast.success(content, options);
    return;
  }
  toast(content, options);
}

/**
 * One notification socket per Buyer/Seller workspace session.
 * Updates first-page SWR cache + unread bell; toasts only on live WS events.
 */
export default function NotificationRealtimeBridge({
  role,
}: NotificationRealtimeBridgeProps) {
  const { user, token, isAuthenticated, isLoading } = useAuth();
  const { mutate } = useSWRConfig();
  const seenIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    seenIdsRef.current = new Set();
  }, [token, user?.id]);

  const enabled =
    !isLoading &&
    isAuthenticated &&
    Boolean(token) &&
    Boolean(user) &&
    (role === 'BUYER' || role === 'SELLER');

  const onNotificationCreated = useCallback(
    (notification: NotificationItem) => {
      if (seenIdsRef.current.has(notification.id)) {
        return;
      }
      seenIdsRef.current.add(notification.id);
      if (seenIdsRef.current.size > SEEN_CAP) {
        const oldest = seenIdsRef.current.values().next().value;
        if (oldest != null) {
          seenIdsRef.current.delete(oldest);
        }
      }

      void mutate(
        FIRST_PAGE_KEY,
        (current: NotificationListResponse | undefined) =>
          mergeNotificationIntoFirstPage(current, notification),
        { revalidate: true },
      );

      showLiveNotificationToast(notification, role);
    },
    [mutate, role],
  );

  const onReconnect = useCallback(() => {
    void mutate(FIRST_PAGE_KEY);
  }, [mutate]);

  useNotificationRealtime({
    enabled,
    token,
    onNotificationCreated,
    onReconnect,
  });

  return null;
}
