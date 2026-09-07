'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import useSWR, { useSWRConfig } from 'swr';
import type { ReactNode } from 'react';

import AdminUserStatusAction from '@/components/admin/AdminUserStatusAction';
import { getApiErrorMessage, getApiStatus } from '@/lib/apiErrors';
import {
  ADMIN_USERS_PATH,
  ADMIN_USERS_READONLY_IDENTITY_COPY,
  buildAdminUserDetailApiPath,
  formatAdminUserRole,
  formatAdminUserStatus,
  formatAdminUserYesNo,
} from '@/lib/adminUsers';
import { adminUserDetailFetcher } from '@/lib/adminUsersApi';
import type { AdminUser } from '@/lib/types';

function formatJoined(
  value: string | undefined,
): { iso: string; label: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    iso: date.toISOString(),
    label: format(date, 'MMM d, yyyy, h:mm a'),
  };
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="text-sm font-medium text-zinc-900 dark:text-white">
        {children}
      </dd>
    </div>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  const label = formatAdminUserStatus(isActive);
  return (
    <span
      className={[
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
        isActive
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
          : 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
      ].join(' ')}
    >
      {label}
    </span>
  );
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const { mutate: mutateGlobal } = useSWRConfig();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const numericId = Number(id);
  const validId = Number.isFinite(numericId) && numericId > 0;
  const detailKey = validId ? buildAdminUserDetailApiPath(numericId) : null;

  const { data, error, isLoading, mutate } = useSWR(
    detailKey,
    adminUserDetailFetcher,
  );

  const handleUpdated = async (updated: AdminUser) => {
    await mutate(updated, { revalidate: false });
    await mutateGlobal(
      (key) => typeof key === 'string' && key.startsWith('/admin/users'),
      undefined,
      { revalidate: true },
    );
  };

  if (!validId) {
    return (
      <div className="space-y-4">
        <Link
          href={ADMIN_USERS_PATH}
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Users
        </Link>
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          Invalid user id.
        </p>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <p className="sr-only">Loading user</p>
        <div className="h-8 w-40 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-48 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
      </div>
    );
  }

  if (error && !data) {
    const status = getApiStatus(error);
    return (
      <div className="space-y-4">
        <Link
          href={ADMIN_USERS_PATH}
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Users
        </Link>
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <p>
            {status === 404
              ? 'User not found.'
              : 'Unable to load this user.'}
          </p>
          <p className="mt-1 text-xs opacity-80">
            {getApiErrorMessage(error, 'Please try again in a moment.')}
          </p>
          {status !== 404 ? (
            <button
              type="button"
              onClick={() => void mutate()}
              className="mt-3 inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-red-800 dark:hover:bg-red-950"
            >
              Try Again
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const joined = formatJoined(data.date_joined);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          <Link
            href={ADMIN_USERS_PATH}
            className="font-medium text-violet-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300"
          >
            ← Users
          </Link>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
            {data.username}
          </h1>
          <StatusBadge isActive={data.is_active} />
        </div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Marketplace account record.
        </p>
      </header>

      <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        {ADMIN_USERS_READONLY_IDENTITY_COPY}
      </p>

      <section
        aria-labelledby="user-details-heading"
        className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 shadow-sm sm:px-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="user-details-heading"
          className="pt-3 text-base font-semibold text-zinc-900 dark:text-white"
        >
          Account details
        </h2>
        <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
          <DetailRow label="User ID">#{data.id}</DetailRow>
          <DetailRow label="Username">{data.username}</DetailRow>
          <DetailRow label="Email">{data.email}</DetailRow>
          <DetailRow label="Role">{formatAdminUserRole(data.role)}</DetailRow>
          <DetailRow label="Status">
            <StatusBadge isActive={data.is_active} />
          </DetailRow>
          <DetailRow label="Joined">
            {joined ? (
              <time dateTime={joined.iso}>{joined.label}</time>
            ) : (
              '—'
            )}
          </DetailRow>
          <DetailRow label="Staff">
            {formatAdminUserYesNo(data.is_staff)}
          </DetailRow>
          <DetailRow label="Superuser">
            {formatAdminUserYesNo(data.is_superuser)}
          </DetailRow>
        </dl>
      </section>

      <section
        aria-labelledby="user-actions-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="user-actions-heading"
          className="text-base font-semibold text-zinc-900 dark:text-white"
        >
          Account access
        </h2>
        <div className="mt-4">
          <AdminUserStatusAction user={data} onUpdated={handleUpdated} />
        </div>
      </section>
    </div>
  );
}
