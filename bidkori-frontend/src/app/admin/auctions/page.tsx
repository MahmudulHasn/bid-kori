'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import useSWR from 'swr';

import ModerationVisibilityBadge from '@/components/admin/ModerationVisibilityBadge';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  ADMIN_AUCTIONS_PATH,
  ADMIN_AUCTION_READONLY_COPY,
  ADMIN_AUCTION_SEARCH_HINT,
  ADMIN_AUCTION_SORT_OPTIONS,
  ADMIN_AUCTION_STATUS_OPTIONS,
  adminAuctionDetailPath,
  buildAdminAuctionsApiPath,
  formatAdminAuctionAmountDisplay,
  formatAdminAuctionPaidState,
  formatAdminAuctionStatusLabel,
  getAdminAuctionProductId,
  getAdminAuctionSellerLabel,
  getAdminAuctionTitle,
  sortAdminAuctions,
  type AdminAuctionSort,
  type AdminAuctionStatusFilter,
} from '@/lib/adminAuctions';
import { adminProductDetailPath } from '@/lib/adminProducts';
import { auctionListFetcher } from '@/lib/auctionsApi';
import type { Auction } from '@/lib/types';

function formatDateTime(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'MMM d, yyyy, h:mm a');
}

function AuctionCard({ auction }: { auction: Auction }) {
  const title = getAdminAuctionTitle(auction);
  const productId = getAdminAuctionProductId(auction);
  const amount = formatAdminAuctionAmountDisplay(auction);

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
        <Link
          href={adminAuctionDetailPath(auction.id)}
          className="hover:text-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:hover:text-violet-300"
        >
          {title}
        </Link>
      </h2>
      <dl className="mt-3 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex justify-between gap-3">
          <dt>Auction ID</dt>
          <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">
            #{auction.id}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Lifecycle</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {formatAdminAuctionStatusLabel(auction.status)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Visibility</dt>
          <dd>
            <ModerationVisibilityBadge isHidden={auction.is_hidden} />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Seller</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {getAdminAuctionSellerLabel(auction)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{amount.label}</dt>
          <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">
            {amount.formatted}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Paid</dt>
          <dd>{formatAdminAuctionPaidState(auction.is_paid)}</dd>
        </div>
        {productId != null ? (
          <div className="flex justify-between gap-3">
            <dt>Product</dt>
            <dd>
              <Link
                href={adminProductDetailPath(productId)}
                className="font-medium text-violet-700 hover:underline dark:text-violet-300"
              >
                #{productId}
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>
      <Link
        href={adminAuctionDetailPath(auction.id)}
        className="mt-3 inline-flex text-sm font-semibold text-violet-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300"
      >
        View
        <span className="sr-only"> auction {title}</span>
      </Link>
    </article>
  );
}

export default function AdminAuctionsPage() {
  const [statusFilter, setStatusFilter] =
    useState<AdminAuctionStatusFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [sort, setSort] = useState<AdminAuctionSort>('newest');

  const listKey = useMemo(
    () =>
      buildAdminAuctionsApiPath({
        status: statusFilter,
        search: appliedSearch,
      }),
    [statusFilter, appliedSearch],
  );

  const {
    data: auctions,
    error,
    isLoading,
    mutate,
  } = useSWR(listKey, auctionListFetcher);

  const visible = useMemo(
    () => sortAdminAuctions(auctions ?? [], sort),
    [auctions, sort],
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Auctions
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Platform auction catalog for operational visibility.
        </p>
        <p className="mt-2 max-w-2xl text-xs text-zinc-500 dark:text-zinc-500">
          {ADMIN_AUCTION_READONLY_COPY}
        </p>
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <form
          className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(searchInput);
          }}
        >
          <label className="block min-w-0 flex-1 space-y-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Search auctions
            </span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Product title or description"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500/40 focus:ring-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              {ADMIN_AUCTION_SEARCH_HINT}
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
              Status
            </span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as AdminAuctionStatusFilter)
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500/40 focus:ring-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-zinc-700 dark:bg-zinc-900"
            >
              {ADMIN_AUCTION_STATUS_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 sm:w-44">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Sort
            </span>
            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as AdminAuctionSort)
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500/40 focus:ring-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-zinc-700 dark:bg-zinc-900"
            >
              {ADMIN_AUCTION_SORT_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <p className="sr-only">Loading auctions</p>
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <p>We couldn&apos;t load the auction catalog.</p>
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

      {!isLoading && !error && (auctions?.length ?? 0) === 0 ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            No auctions found.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            {appliedSearch || statusFilter !== 'all'
              ? 'No auctions match this status or search.'
              : 'The auction catalog is empty.'}
          </p>
        </section>
      ) : null}

      {!isLoading && !error && visible.length > 0 ? (
        <>
          <ul className="space-y-3 md:hidden">
            {visible.map((auction) => (
              <li key={auction.id}>
                <AuctionCard auction={auction} />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 md:block">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Platform auctions catalog</caption>
              <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    ID
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Product
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Seller
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Lifecycle
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Visibility
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Start
                  </th>
                  <th scope="col" className="px-4 py-3">
                    End
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Paid
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-zinc-950">
                {visible.map((auction) => {
                  const title = getAdminAuctionTitle(auction);
                  const productId = getAdminAuctionProductId(auction);
                  const amount = formatAdminAuctionAmountDisplay(auction);
                  return (
                    <tr
                      key={auction.id}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                        #{auction.id}
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">
                        <div>{title}</div>
                        {productId != null ? (
                          <Link
                            href={adminProductDetailPath(productId)}
                            className="text-xs font-normal text-violet-700 hover:underline dark:text-violet-300"
                          >
                            Product #{productId}
                          </Link>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {getAdminAuctionSellerLabel(auction)}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {formatAdminAuctionStatusLabel(auction.status)}
                      </td>
                      <td className="px-4 py-3">
                        <ModerationVisibilityBadge isHidden={auction.is_hidden} />
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          {amount.label}
                        </div>
                        <div className="tabular-nums">{amount.formatted}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {formatDateTime(auction.start_time)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {formatDateTime(auction.end_time)}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {formatAdminAuctionPaidState(auction.is_paid)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={adminAuctionDetailPath(auction.id)}
                          className="font-semibold text-violet-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300"
                        >
                          View
                          <span className="sr-only"> {title}</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Showing {visible.length} auction
            {visible.length === 1 ? '' : 's'} from{' '}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
              {listKey}
            </code>
            . Route home: {ADMIN_AUCTIONS_PATH}.
          </p>
        </>
      ) : null}
    </div>
  );
}
