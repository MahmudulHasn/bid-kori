'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import useSWR, { useSWRConfig } from 'swr';

import AdminUserStatusAction from '@/components/admin/AdminUserStatusAction';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  ADMIN_USERS_PATH,
  ADMIN_USER_ROLE_OPTIONS,
  ADMIN_USER_STATUS_OPTIONS,
  ADMIN_USERS_READONLY_IDENTITY_COPY,
  adminUserDetailPath,
  adminUsersFiltersAreActive,
  buildAdminUserDetailApiPath,
  buildAdminUsersApiPath,
  buildAdminUsersPageHref,
  canGoToNextAdminUsersPage,
  canGoToPreviousAdminUsersPage,
  formatAdminUserRole,
  formatAdminUserStatus,
  parseAdminUserRoleFilter,
  parseAdminUsersPageParam,
  parseAdminUserStatusFilter,
  type AdminUserRoleFilter,
  type AdminUserStatusFilter,
} from '@/lib/adminUsers';
import { adminUsersListFetcher } from '@/lib/adminUsersApi';
import type { AdminUser, PaginatedAdminUsers } from '@/lib/types';

function formatJoined(value: string): { iso: string; label: string } | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), label: format(date, 'MMM d, yyyy') };
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

function RoleBadge({ role }: { role: AdminUser['role'] }) {
  return (
    <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
      {formatAdminUserRole(role)}
    </span>
  );
}

function UserCard({
  user,
  onUpdated,
}: {
  user: AdminUser;
  onUpdated: (user: AdminUser) => void | Promise<void>;
}) {
  const joined = formatJoined(user.date_joined);
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
          <Link
            href={adminUserDetailPath(user.id)}
            className="hover:text-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:hover:text-violet-300"
          >
            {user.username}
          </Link>
        </h2>
        <StatusBadge isActive={user.is_active} />
      </div>
      <dl className="mt-3 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex justify-between gap-3">
          <dt>Email</dt>
          <dd className="truncate text-zinc-800 dark:text-zinc-200">
            {user.email}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Role</dt>
          <dd>
            <RoleBadge role={user.role} />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Joined</dt>
          <dd>
            {joined ? (
              <time dateTime={joined.iso}>{joined.label}</time>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href={adminUserDetailPath(user.id)}
          className="text-sm font-semibold text-violet-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300"
        >
          View
          <span className="sr-only"> {user.username}</span>
        </Link>
        <AdminUserStatusAction user={user} onUpdated={onUpdated} compact />
      </div>
    </article>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutate: mutateGlobal } = useSWRConfig();

  const page = parseAdminUsersPageParam(searchParams.get('page'));
  const role = parseAdminUserRoleFilter(searchParams.get('role'));
  const status = parseAdminUserStatusFilter(searchParams.get('is_active'));
  const appliedSearch = (searchParams.get('search') ?? '').trim();

  const [searchInput, setSearchInput] = useState(appliedSearch);

  useEffect(() => {
    setSearchInput(appliedSearch);
  }, [appliedSearch]);

  const listKey = useMemo(
    () =>
      buildAdminUsersApiPath({
        page,
        search: appliedSearch,
        role,
        status,
      }),
    [page, appliedSearch, role, status],
  );

  const { data, error, isLoading, mutate } = useSWR(
    listKey,
    adminUsersListFetcher,
  );

  const filtersActive = adminUsersFiltersAreActive({
    search: appliedSearch,
    role,
    status,
  });

  const navigateFilters = (next: {
    page?: number;
    search?: string;
    role?: AdminUserRoleFilter;
    status?: AdminUserStatusFilter;
  }) => {
    router.push(
      buildAdminUsersPageHref({
        page: next.page ?? 1,
        search: next.search ?? appliedSearch,
        role: next.role ?? role,
        status: next.status ?? status,
      }),
    );
  };

  const handleUpdated = async (updated: AdminUser) => {
    await mutate(
      (current: PaginatedAdminUsers | undefined) =>
        current
          ? {
              ...current,
              results: current.results.map((row) =>
                row.id === updated.id ? updated : row,
              ),
            }
          : current,
      { revalidate: false },
    );
    await mutateGlobal(
      buildAdminUserDetailApiPath(updated.id),
      updated,
      { revalidate: false },
    );
  };

  const results = data?.results ?? [];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Users
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Marketplace account directory with reversible Suspend and Reactivate
          controls.
        </p>
        <p className="mt-2 max-w-2xl text-xs text-zinc-500 dark:text-zinc-500">
          {ADMIN_USERS_READONLY_IDENTITY_COPY}
        </p>
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <form
          className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            navigateFilters({ page: 1, search: searchInput });
          }}
        >
          <label className="block min-w-0 flex-1 space-y-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Search users
            </span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search users…"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500/40 focus:ring-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              Searches username and email on the server.
            </span>
          </label>
          <button
            type="submit"
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
          >
            Search
          </button>
        </form>

        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="block space-y-1.5 sm:w-40">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Role
            </span>
            <select
              value={role}
              onChange={(event) =>
                navigateFilters({
                  page: 1,
                  role: event.target.value as AdminUserRoleFilter,
                })
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500/40 focus:ring-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-zinc-700 dark:bg-zinc-900"
            >
              {ADMIN_USER_ROLE_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 sm:w-44">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Status
            </span>
            <select
              value={status}
              onChange={(event) =>
                navigateFilters({
                  page: 1,
                  status: event.target.value as AdminUserStatusFilter,
                })
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500/40 focus:ring-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-zinc-700 dark:bg-zinc-900"
            >
              {ADMIN_USER_STATUS_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {filtersActive ? (
        <div>
          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              router.push(ADMIN_USERS_PATH);
            }}
            className="text-sm font-medium text-violet-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300"
          >
            Clear filters
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <p className="sr-only">Loading users</p>
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <p>Unable to load users.</p>
          <p className="mt-1 text-xs opacity-80">
            {getApiErrorMessage(error, 'Please try again in a moment.')}
          </p>
          <button
            type="button"
            onClick={() => void mutate()}
            className="mt-3 inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-red-800 dark:hover:bg-red-950"
          >
            Try Again
          </button>
        </div>
      ) : null}

      {!isLoading && !error && results.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            {filtersActive ? 'No users match these filters.' : 'No users found.'}
          </h2>
        </section>
      ) : null}

      {!isLoading && !error && results.length > 0 ? (
        <>
          <ul className="space-y-3 md:hidden">
            {results.map((user) => (
              <li key={user.id}>
                <UserCard user={user} onUpdated={handleUpdated} />
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 md:block">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Admin users directory</caption>
              <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Username
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Role
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Joined
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-zinc-950">
                {results.map((user) => {
                  const joined = formatJoined(user.date_joined);
                  return (
                    <tr
                      key={user.id}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">
                        <Link
                          href={adminUserDetailPath(user.id)}
                          className="hover:text-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:hover:text-violet-300"
                        >
                          {user.username}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {user.email}
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge isActive={user.is_active} />
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {joined ? (
                          <time dateTime={joined.iso}>{joined.label}</time>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-3">
                          <Link
                            href={adminUserDetailPath(user.id)}
                            className="font-semibold text-violet-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300"
                          >
                            View
                            <span className="sr-only"> {user.username}</span>
                          </Link>
                          <AdminUserStatusAction
                            user={user}
                            onUpdated={handleUpdated}
                            compact
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data &&
          (canGoToPreviousAdminUsersPage(page) ||
            canGoToNextAdminUsersPage(data)) ? (
            <nav
              className="flex items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800"
              aria-label="Users pagination"
            >
              <button
                type="button"
                disabled={!canGoToPreviousAdminUsersPage(page)}
                onClick={() => navigateFilters({ page: page - 1 })}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Previous
              </button>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Page {page}
                {typeof data.count === 'number'
                  ? ` · ${data.count} total`
                  : null}
              </p>
              <button
                type="button"
                disabled={!canGoToNextAdminUsersPage(data)}
                onClick={() => navigateFilters({ page: page + 1 })}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Next
              </button>
            </nav>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
