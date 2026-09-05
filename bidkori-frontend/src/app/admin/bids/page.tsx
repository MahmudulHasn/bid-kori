'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { format } from 'date-fns';
import useSWR from 'swr';

import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  ADMIN_AUCTION_SEARCH_HINT,
  ADMIN_AUCTION_STATUS_OPTIONS,
} from '@/lib/adminAuctions';
import {
  ADMIN_BIDS_PAGE_HINT,
  ADMIN_BIDS_READONLY_COPY,
  ADMIN_BIDS_VS_ANALYTICS_HINT,
  ADMIN_BID_HISTORY_ORDER_HINT,
  adminBidsPath,
  buildAdminAuctionsApiPath,
  buildAuctionBidHistoryApiPath,
  getAdminBidAuctionContext,
  mapAdminBidsVisibilityHistory,
  parseAdminBidAuctionQuery,
  resolveAdminBidAuctionHint,
  type AdminAuctionStatusFilter,
} from '@/lib/adminBids';
import { adminProductDetailPath } from '@/lib/adminProducts';
import {
  auctionBidHistoryFetcher,
  auctionListFetcher,
} from '@/lib/auctionsApi';
import type { Auction } from '@/lib/types';

function formatDateTime(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'MMM d, yyyy, h:mm a');
}

function formatBidTime(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, 'MMM d, yyyy, h:mm a');
}

function AdminBidsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auctionHint = parseAdminBidAuctionQuery(searchParams.get('auction'));

  const [statusFilter, setStatusFilter] =
    useState<AdminAuctionStatusFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const catalogKey = useMemo(
    () =>
      buildAdminAuctionsApiPath({
        status: statusFilter,
        search: appliedSearch,
      }),
    [statusFilter, appliedSearch],
  );

  const {
    data: auctions,
    error: catalogError,
    isLoading: catalogLoading,
    mutate: mutateCatalog,
  } = useSWR(catalogKey, auctionListFetcher);

  const catalog = auctions ?? [];
  const selection = useMemo(
    () => resolveAdminBidAuctionHint(auctions ?? [], auctionHint),
    [auctions, auctionHint],
  );

  const selectedAuction: Auction | null = selection.auction;
  const historyKey = selectedAuction
    ? buildAuctionBidHistoryApiPath(selectedAuction.id)
    : null;

  const {
    data: bids,
    error: historyError,
    isLoading: historyLoading,
    mutate: mutateHistory,
  } = useSWR(historyKey, auctionBidHistoryFetcher);

  const historyRows = useMemo(
    () => mapAdminBidsVisibilityHistory(bids ?? []),
    [bids],
  );

  const context = selectedAuction
    ? getAdminBidAuctionContext(selectedAuction)
    : null;

  const catalogMessage = catalogError
    ? getApiErrorMessage(catalogError, 'Could not load the auction catalog.')
    : null;

  function selectAuction(id: number) {
    router.replace(adminBidsPath(id), { scroll: false });
  }

  function clearSelection() {
    router.replace(adminBidsPath(), { scroll: false });
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Bid Visibility
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          {ADMIN_BIDS_PAGE_HINT}
        </p>
        <p className="max-w-2xl text-xs text-zinc-500 dark:text-zinc-500">
          {ADMIN_BIDS_READONLY_COPY}
        </p>
        <p className="max-w-2xl text-xs text-zinc-500 dark:text-zinc-500">
          {ADMIN_BIDS_VS_ANALYTICS_HINT}
        </p>
      </header>

      {catalogMessage ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <p>{catalogMessage}</p>
          <button
            type="button"
            onClick={() => void mutateCatalog()}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-red-800 dark:hover:bg-red-900/40"
          >
            Retry catalog
          </button>
        </div>
      ) : null}

      <section
        aria-labelledby="auction-picker-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="auction-picker-heading"
          className="text-base font-semibold text-zinc-900 dark:text-white"
        >
          Select an auction
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {ADMIN_AUCTION_SEARCH_HINT} History loads only after you select one
          auction.
        </p>

        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(searchInput);
          }}
        >
          <div className="min-w-[12rem] flex-1">
            <label
              htmlFor="admin-bids-search"
              className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              Search auctions
            </label>
            <input
              id="admin-bids-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Product title or description"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
          <div>
            <label
              htmlFor="admin-bids-status"
              className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              Status
            </label>
            <select
              id="admin-bids-status"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as AdminAuctionStatusFilter)
              }
              className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              {ADMIN_AUCTION_STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
          >
            Apply search
          </button>
        </form>

        {catalogLoading && !auctions ? (
          <div
            className="mt-4 h-40 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"
            aria-busy="true"
          />
        ) : null}

        {!catalogLoading && !catalogMessage && catalog.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            No auctions match this filter.
          </p>
        ) : null}

        {!catalogMessage && catalog.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Auction
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Product
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Seller
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Amount
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    End
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((auction) => {
                  const rowContext = getAdminBidAuctionContext(auction);
                  const isSelected =
                    selectedAuction?.id === auction.id;
                  return (
                    <tr
                      key={auction.id}
                      className={
                        isSelected
                          ? 'border-b border-violet-100 bg-violet-50/60 dark:border-violet-900/40 dark:bg-violet-950/30'
                          : 'border-b border-zinc-100 dark:border-zinc-800'
                      }
                    >
                      <td className="py-2 pr-3 tabular-nums text-zinc-900 dark:text-zinc-100">
                        #{auction.id}
                        {isSelected ? (
                          <span className="sr-only"> (selected)</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-100">
                        {rowContext.title}
                      </td>
                      <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">
                        {rowContext.sellerLabel}
                      </td>
                      <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">
                        {rowContext.statusLabel}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-zinc-900 dark:text-zinc-100">
                        <span className="block text-[10px] uppercase tracking-wide text-zinc-500">
                          {rowContext.amountLabel}
                        </span>
                        {rowContext.amountFormatted}
                      </td>
                      <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">
                        {formatDateTime(auction.end_time)}
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => selectAuction(auction.id)}
                          className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
                        >
                          {isSelected ? 'Selected' : 'View bids'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {selection.status === 'unknown' && !catalogLoading ? (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <p>
            Auction #{selection.auctionId} is not in the current catalog
            results. Adjust search/status filters or clear the selection.
          </p>
          <button
            type="button"
            onClick={clearSelection}
            className="mt-2 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-amber-800 dark:hover:bg-amber-900/40"
          >
            Clear selection
          </button>
        </div>
      ) : null}

      {context ? (
        <section
          aria-labelledby="selected-auction-heading"
          className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="selected-auction-heading"
                className="text-base font-semibold text-zinc-900 dark:text-white"
              >
                Auction #{context.auctionId}
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {context.title}
              </p>
            </div>
            <Link
              href={context.auctionDetailHref}
              className="text-sm font-medium text-violet-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300"
            >
              View Auction
            </Link>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Status
              </dt>
              <dd className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">
                {context.statusLabel}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Seller
              </dt>
              <dd className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">
                {context.sellerLabel}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Start
              </dt>
              <dd className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">
                {formatDateTime(context.startTime)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                End
              </dt>
              <dd className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">
                {formatDateTime(context.endTime)}
              </dd>
            </div>
          </dl>
          {context.productId != null ? (
            <p className="mt-3 text-sm">
              <Link
                href={adminProductDetailPath(context.productId)}
                className="font-medium text-violet-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300"
              >
                View Product #{context.productId}
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}

      {selectedAuction ? (
        <section
          aria-labelledby="bid-history-heading"
          className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2
            id="bid-history-heading"
            className="text-base font-semibold text-zinc-900 dark:text-white"
          >
            Bid history
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {ADMIN_BID_HISTORY_ORDER_HINT}
          </p>

          {historyLoading && !bids ? (
            <div
              className="mt-4 h-32 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"
              aria-busy="true"
            />
          ) : null}

          {historyError ? (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
            >
              <p>
                {getApiErrorMessage(
                  historyError,
                  'Could not load bid history for this auction.',
                )}
              </p>
              <button
                type="button"
                onClick={() => void mutateHistory()}
                className="mt-2 inline-flex rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-amber-800 dark:hover:bg-amber-900/40"
              >
                Retry history
              </button>
            </div>
          ) : null}

          {!historyLoading && !historyError && historyRows.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
              No bids have been placed on this auction.
            </p>
          ) : null}

          {!historyLoading && !historyError && historyRows.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Bid ID
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Bidder
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Amount
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Timestamp
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-2 pr-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                        #{row.id}
                      </td>
                      <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-100">
                        {row.bidderUsername}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-zinc-900 dark:text-zinc-100">
                        {row.amount}
                      </td>
                      <td className="py-2 text-zinc-600 dark:text-zinc-400">
                        {row.timestamp ? (
                          <time dateTime={row.timestamp}>
                            {formatBidTime(row.timestamp)}
                          </time>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : selection.status === 'none' && !catalogLoading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Select an auction above to load its bid history.
        </p>
      ) : null}
    </div>
  );
}

export default function AdminBidsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-40 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        </div>
      }
    >
      <AdminBidsPageInner />
    </Suspense>
  );
}
