'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import useSWR from 'swr';

import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatAuctionMoney, getAuctionTitle } from '@/lib/auctionDisplay';
import {
  AUCTIONS_LIST_API_PATH,
  auctionListFetcher,
  myBidsFetcher,
} from '@/lib/auctionsApi';
import {
  BUYER_WON_PATH,
  MY_BIDS_API_PATH,
  buildBuyerBidActivity,
  indexAuctionsById,
  matchesBuyerMyBidsFilter,
  type BuyerAuctionBidActivity,
  type BuyerMyBidsFilter,
} from '@/lib/buyer';
import { MARKETPLACE_ROUTES } from '@/lib/marketplace';

const FILTERS: { id: BuyerMyBidsFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'won', label: 'Won' },
  { id: 'ended', label: 'Ended' },
];

function formatBidTime(value: string | null): { iso: string; label: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), label: format(date, 'MMM d, h:mm a') };
}

function statusClass(status: BuyerAuctionBidActivity['status']): string {
  switch (status) {
    case 'currently_highest':
      return 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
    case 'outbid':
      return 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
    case 'won':
      return 'bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300';
    case 'lost':
    case 'cancelled':
    case 'unresolved':
      return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
    case 'awaiting_finalization':
      return 'bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300';
  }
}

function AuctionAction({ row }: { row: BuyerAuctionBidActivity }) {
  if (!row.auction) {
    return (
      <span className="text-sm text-zinc-400 dark:text-zinc-500">Unavailable</span>
    );
  }

  const href = MARKETPLACE_ROUTES.auctionDetail(row.auctionId);
  const label = row.status === 'outbid' ? 'Bid Again' : 'View Auction';

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {row.status === 'won' ? (
        <Link
          href={BUYER_WON_PATH}
          className="inline-flex rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Manage Win
          <span className="sr-only"> for {getAuctionTitle(row.auction)}</span>
        </Link>
      ) : null}
      <Link
        href={href}
        className="inline-flex rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {label}
        <span className="sr-only"> for {getAuctionTitle(row.auction)}</span>
      </Link>
    </div>
  );
}

function ActivityAmounts({ row }: { row: BuyerAuctionBidActivity }) {
  return (
    <dl className="space-y-1 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-zinc-500 dark:text-zinc-400">My highest bid</dt>
        <dd className="font-medium tabular-nums text-zinc-900 dark:text-white">
          {formatAuctionMoney(row.myHighestAmount)}
        </dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-zinc-500 dark:text-zinc-400">Current bid</dt>
        <dd className="font-medium tabular-nums text-amber-700 dark:text-amber-300">
          {row.currentHighestAmount == null
            ? '—'
            : formatAuctionMoney(row.currentHighestAmount)}
        </dd>
      </div>
    </dl>
  );
}

function OwnBids({ row }: { row: BuyerAuctionBidActivity }) {
  if (row.bidCount <= 1) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:text-zinc-400 dark:hover:text-zinc-200">
        {row.bidCount} of your bids
      </summary>
      <ul className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        {row.bids.map((bid) => {
          const time = formatBidTime(bid.timestamp ?? null);
          return (
            <li key={bid.id}>
              {formatAuctionMoney(Number(bid.amount))}
              {time ? (
                <>
                  {' '}
                  —{' '}
                  <time dateTime={time.iso}>{time.label}</time>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function ActivityCard({ row }: { row: BuyerAuctionBidActivity }) {
  const title = row.auction
    ? getAuctionTitle(row.auction)
    : `Auction #${row.auctionId}`;
  const lastBid = formatBidTime(row.latestBidAt);

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
          {row.auction ? (
            <Link
              href={MARKETPLACE_ROUTES.auctionDetail(row.auctionId)}
              className="hover:text-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:hover:text-amber-300"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(row.status)}`}
        >
          {row.statusLabel}
        </span>
      </div>
      <div className="mt-3">
        <ActivityAmounts row={row} />
      </div>
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        {row.bidCount} bid{row.bidCount === 1 ? '' : 's'}
        {lastBid ? (
          <>
            {' '}
            · Last bid <time dateTime={lastBid.iso}>{lastBid.label}</time>
          </>
        ) : null}
      </p>
      {row.status === 'won' ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Complete mock checkout from Won Auctions.
        </p>
      ) : null}
      <OwnBids row={row} />
      <div className="mt-4">
        <AuctionAction row={row} />
      </div>
    </article>
  );
}

export default function BuyerMyBidsPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const [filter, setFilter] = useState<BuyerMyBidsFilter>('all');

  const {
    data: myBids,
    error: bidsError,
    isLoading: bidsLoading,
    mutate: mutateBids,
  } = useSWR(MY_BIDS_API_PATH, myBidsFetcher);

  const {
    data: auctions,
    error: auctionsError,
    isLoading: auctionsLoading,
    mutate: mutateAuctions,
  } = useSWR(AUCTIONS_LIST_API_PATH, auctionListFetcher);

  const loading = bidsLoading || auctionsLoading;
  const error = bidsError || auctionsError;

  const activity = useMemo(() => {
    if (userId == null) return [];
    return buildBuyerBidActivity(
      myBids ?? [],
      indexAuctionsById(auctions ?? []),
      userId,
    );
  }, [myBids, auctions, userId]);

  const visible = useMemo(
    () => activity.filter((row) => matchesBuyerMyBidsFilter(row, filter)),
    [activity, filter],
  );

  const unresolvedCount = activity.filter((row) => row.status === 'unresolved').length;
  const hasNoBids = !loading && !error && activity.length === 0;

  const handleRetry = () => {
    void mutateBids();
    void mutateAuctions();
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          My Bids
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Auctions you have participated in, your highest bid, and the current
          or final outcome.
        </p>
      </header>

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <p className="sr-only">Loading your bids</p>
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <p>We couldn&apos;t load your bids.</p>
          <p className="mt-1 text-xs opacity-80">
            {getApiErrorMessage(error, 'Please try again in a moment.')}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-3 inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:border-red-800 dark:hover:bg-red-950"
          >
            Try Again
          </button>
        </div>
      ) : null}

      {!loading && !error && hasNoBids ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            You haven&apos;t placed any bids yet.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            Browse the marketplace to find an auction you like.
          </p>
          <Link
            href={MARKETPLACE_ROUTES.auctions}
            className="mt-5 inline-flex rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          >
            Browse Auctions
          </Link>
        </section>
      ) : null}

      {!loading && !error && !hasNoBids ? (
        <>
          <div
            role="tablist"
            aria-label="Filter bid activity"
            className="flex flex-wrap gap-2"
          >
            {FILTERS.map((item) => {
              const selected = filter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setFilter(item.id)}
                  className={[
                    'rounded-full px-3 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500',
                    selected
                      ? 'bg-amber-600 text-white'
                      : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700',
                  ].join(' ')}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {unresolvedCount > 0 && filter === 'all' ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {unresolvedCount} of your bid
              {unresolvedCount === 1 ? '' : 's'} could not be matched to a
              current auction listing.
            </p>
          ) : null}

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              No bids in this filter.
            </p>
          ) : (
            <>
              <div className="grid gap-4 md:hidden">
                {visible.map((row) => (
                  <ActivityCard key={row.auctionId} row={row} />
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 md:block">
                <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                  <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                    <tr>
                      <th className="px-4 py-3">Auction</th>
                      <th className="px-4 py-3">My highest bid</th>
                      <th className="px-4 py-3">Current bid</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Last bid</th>
                      <th className="px-4 py-3">
                        <span className="sr-only">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                    {visible.map((row) => {
                      const title = row.auction
                        ? getAuctionTitle(row.auction)
                        : `Auction #${row.auctionId}`;
                      const lastBid = formatBidTime(row.latestBidAt);
                      return (
                        <tr key={row.auctionId}>
                          <td className="px-4 py-3 align-top">
                            {row.auction ? (
                              <Link
                                href={MARKETPLACE_ROUTES.auctionDetail(row.auctionId)}
                                className="font-medium text-zinc-900 hover:text-amber-700 dark:text-white dark:hover:text-amber-300"
                              >
                                {title}
                              </Link>
                            ) : (
                              <span className="font-medium text-zinc-500">{title}</span>
                            )}
                            <p className="mt-1 text-xs text-zinc-500">
                              {row.bidCount} bid{row.bidCount === 1 ? '' : 's'}
                            </p>
                            {row.status === 'won' ? (
                              <p className="mt-1 text-xs text-zinc-500">
                                Complete mock checkout from Won Auctions.
                              </p>
                            ) : null}
                            <OwnBids row={row} />
                          </td>
                          <td className="px-4 py-3 align-top tabular-nums font-medium text-zinc-900 dark:text-white">
                            {formatAuctionMoney(row.myHighestAmount)}
                          </td>
                          <td className="px-4 py-3 align-top tabular-nums font-medium text-amber-700 dark:text-amber-300">
                            {row.currentHighestAmount == null
                              ? '—'
                              : formatAuctionMoney(row.currentHighestAmount)}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(row.status)}`}
                            >
                              {row.statusLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-400">
                            {lastBid ? (
                              <time dateTime={lastBid.iso}>{lastBid.label}</time>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 align-top text-right">
                            <AuctionAction row={row} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
