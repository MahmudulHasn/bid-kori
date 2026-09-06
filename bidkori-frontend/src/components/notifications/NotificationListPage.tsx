'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { format } from 'date-fns';
import useSWR, { useSWRConfig } from 'swr';
import toast from 'react-hot-toast';

import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  buildNotificationsListApiPath,
  buildNotificationsPageHref,
  canGoToNextPage,
  canGoToPreviousPage,
  getNotificationAuctionHref,
  getNotificationTypeLabel,
  getNotificationsPagePath,
  markAllNotificationsReadLocally,
  markNotificationReadLocally,
  parseNotificationsPageParam,
  type NotificationItem,
  type NotificationListResponse,
} from '@/lib/notifications';
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationsListFetcher,
} from '@/lib/notificationsApi';
import type { UserRole } from '@/lib/types';

type NotificationListPageProps = {
  role: 'BUYER' | 'SELLER';
};

function formatCreatedAt(value: string): { iso: string; label: string } | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), label: format(date, 'MMM d, yyyy h:mm a') };
}

function NotificationRow({
  item,
  role,
  busyId,
  onOpen,
}: {
  item: NotificationItem;
  role: UserRole;
  busyId: number | null;
  onOpen: (item: NotificationItem) => void;
}) {
  const auctionHref = getNotificationAuctionHref(role, item.auction_id);
  const when = formatCreatedAt(item.created_at);
  const typeLabel = getNotificationTypeLabel(item.type);
  const pending = busyId === item.id;

  return (
    <li
      className={[
        'rounded-xl border px-4 py-3 transition',
        item.is_read
          ? 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'
          : 'border-amber-200/80 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {typeLabel}
            </span>
            {!item.is_read ? (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                Unread
              </span>
            ) : null}
          </div>
          <h2
            className={[
              'text-sm text-zinc-900 dark:text-white',
              item.is_read ? 'font-medium' : 'font-semibold',
            ].join(' ')}
          >
            {item.title}
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.message}</p>
          {when ? (
            <time
              dateTime={when.iso}
              className="block text-xs text-zinc-500 dark:text-zinc-500"
            >
              {when.label}
            </time>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          {auctionHref ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onOpen(item)}
              className="inline-flex rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {pending ? 'Opening…' : 'View auction'}
            </button>
          ) : (
            <button
              type="button"
              disabled={pending || item.is_read}
              onClick={() => onOpen(item)}
              className="inline-flex rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:cursor-default disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {item.is_read ? 'Read' : pending ? 'Updating…' : 'Mark read'}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function NotificationListPage({ role }: NotificationListPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutate: mutateGlobal } = useSWRConfig();
  const basePath = getNotificationsPagePath(role)!;
  const page = parseNotificationsPageParam(searchParams.get('page'));
  const listKey = buildNotificationsListApiPath(page);

  const { data, error, isLoading, mutate } = useSWR(
    listKey,
    notificationsListFetcher,
    {
      refreshInterval: 15_000,
      revalidateOnFocus: true,
    },
  );

  const [busyId, setBusyId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const results = data?.results ?? [];
  const hasUnread = results.some((row) => !row.is_read);

  const patchCaches = async (
    updater: (current: NotificationListResponse) => NotificationListResponse,
  ) => {
    await mutate(
      (current) => (current ? updater(current) : current),
      { revalidate: false },
    );
    await mutateGlobal(
      buildNotificationsListApiPath(1),
      (current: NotificationListResponse | undefined) =>
        current ? updater(current) : current,
      { revalidate: false },
    );
  };

  const handleOpen = async (item: NotificationItem) => {
    const href = getNotificationAuctionHref(role, item.auction_id);
    setBusyId(item.id);
    try {
      if (!item.is_read) {
        const updated = await markNotificationRead(item.id);
        await patchCaches((current) => ({
          ...current,
          results: current.results.map((row) =>
            row.id === updated.id ? updated : row,
          ),
        }));
      } else {
        // Keep local shape consistent without a redundant POST.
        await patchCaches((current) => ({
          ...current,
          results: current.results.map((row) =>
            row.id === item.id ? markNotificationReadLocally(row) : row,
          ),
        }));
      }
      if (href) {
        router.push(href);
      }
    } catch (err: unknown) {
      toast.error(
        getApiErrorMessage(err, 'Could not update notification. Please try again.'),
      );
      if (href) {
        router.push(href);
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      await mutate(
        (current) =>
          current
            ? {
                ...current,
                results: markAllNotificationsReadLocally(current.results),
              }
            : current,
        { revalidate: true },
      );
      await mutateGlobal(buildNotificationsListApiPath(1));
      toast.success('All notifications marked as read.');
    } catch (err: unknown) {
      toast.error(
        getApiErrorMessage(err, 'Could not mark all as read. Please try again.'),
      );
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
            Notifications
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Outbid, auction outcomes, and bid activity for your account.
          </p>
        </div>
        <button
          type="button"
          disabled={markingAll || isLoading || !hasUnread}
          onClick={handleMarkAll}
          className="inline-flex rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {markingAll ? 'Marking…' : 'Mark all as read'}
        </button>
      </header>

      {isLoading && !data ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400" role="status">
          Loading notifications…
        </p>
      ) : null}

      {error && !data ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
        >
          <p>We could not load your notifications.</p>
          <button
            type="button"
            className="mt-2 font-semibold underline"
            onClick={() => void mutate()}
          >
            Try again
          </button>
        </div>
      ) : null}

      {data && results.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No notifications yet.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="space-y-3">
          {results.map((row) => (
            <NotificationRow
              key={row.id}
              item={row}
              role={role}
              busyId={busyId}
              onOpen={handleOpen}
            />
          ))}
        </ul>
      ) : null}

      {data && (canGoToPreviousPage(page) || canGoToNextPage(data)) ? (
        <nav
          className="flex items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800"
          aria-label="Notification pages"
        >
          {canGoToPreviousPage(page) ? (
            <Link
              href={buildNotificationsPageHref(basePath, page - 1)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Previous
            </Link>
          ) : (
            <span className="rounded-lg border border-transparent px-3 py-1.5 text-sm text-zinc-400">
              Previous
            </span>
          )}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Page {page}
          </span>
          {canGoToNextPage(data) ? (
            <Link
              href={buildNotificationsPageHref(basePath, page + 1)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Next
            </Link>
          ) : (
            <span className="rounded-lg border border-transparent px-3 py-1.5 text-sm text-zinc-400">
              Next
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
