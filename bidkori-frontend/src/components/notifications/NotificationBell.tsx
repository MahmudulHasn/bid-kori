'use client';

import Link from 'next/link';
import useSWR from 'swr';

import { Bell } from 'lucide-react';

import {
  buildNotificationsListApiPath,
  getNotificationsPagePath,
  shouldShowUnreadIndicator,
} from '@/lib/notifications';
import { notificationsListFetcher } from '@/lib/notificationsApi';
import type { UserRole } from '@/lib/types';

const FIRST_PAGE_KEY = buildNotificationsListApiPath(1);

type NotificationBellProps = {
  role: UserRole;
};

/**
 * Header bell for Buyer/Seller. Shows a non-numeric unread dot based on
 * first-page REST data only (no invented unread totals). Admin: hidden.
 */
export default function NotificationBell({ role }: NotificationBellProps) {
  const href = getNotificationsPagePath(role);
  const enabled = href != null;

  const { data } = useSWR(
    enabled ? FIRST_PAGE_KEY : null,
    notificationsListFetcher,
    {
      refreshInterval: 15_000,
      revalidateOnFocus: true,
    },
  );

  if (!href) {
    return null;
  }

  const hasUnread = shouldShowUnreadIndicator(data);
  const label = hasUnread ? 'Notifications, unread' : 'Notifications';

  return (
    <Link
      href={href}
      aria-label={label}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
    >
      <Bell className="h-5 w-5" aria-hidden />
      {hasUnread ? (
        <span
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-zinc-900"
          aria-hidden
        />
      ) : null}
    </Link>
  );
}
