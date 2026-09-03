'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';

import SellerAuctionItem, {
  SellerAuctionTableRow,
} from '@/components/seller/SellerAuctionItem';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  AUCTIONS_LIST_API_PATH,
  auctionListFetcher,
} from '@/lib/auctionsApi';
import {
  filterSellerAuctions,
  sortSellerAuctions,
  type SellerAuctionStatusFilter,
} from '@/lib/seller';
import { SELLER_AUCTION_CREATE_PATH } from '@/lib/workspaceNavigation';

const FILTERS: { id: SellerAuctionStatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'CLOSED', label: 'Closed' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

export default function SellerAuctionsPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const [statusFilter, setStatusFilter] =
    useState<SellerAuctionStatusFilter>('all');

  const {
    data: auctions,
    error,
    isLoading,
    mutate,
  } = useSWR(AUCTIONS_LIST_API_PATH, auctionListFetcher);

  const owned = useMemo(() => {
    if (userId == null) return [];
    return filterSellerAuctions(auctions ?? [], userId, 'all');
  }, [auctions, userId]);

  const visible = useMemo(() => {
    if (userId == null) return [];
    return sortSellerAuctions(
      filterSellerAuctions(auctions ?? [], userId, statusFilter),
    );
  }, [auctions, userId, statusFilter]);

  const waitingForUser = userId == null;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
            My Auctions
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Auctions on products you own, using the catalog auction list.
          </p>
        </div>
        <Link
          href={SELLER_AUCTION_CREATE_PATH}
          className="inline-flex rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
        >
          Create Auction
        </Link>
      </header>

      {isLoading || waitingForUser ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <p className="sr-only">Loading your auctions</p>
          {Array.from({ length: 3 }).map((_, index) => (
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
          <p>We couldn&apos;t load your auctions.</p>
          <p className="mt-1 text-xs opacity-80">
            {getApiErrorMessage(error, 'Please try again in a moment.')}
          </p>
          <button
            type="button"
            onClick={() => void mutate()}
            className="mt-3 inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:border-red-800 dark:hover:bg-red-950"
          >
            Try Again
          </button>
        </div>
      ) : null}

      {!isLoading && !waitingForUser && !error && owned.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            You haven&apos;t created any auctions yet.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            Choose a product you own and set bidding terms to start an auction.
          </p>
          <Link
            href={SELLER_AUCTION_CREATE_PATH}
            className="mt-4 inline-flex rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            Create Auction
          </Link>
        </section>
      ) : null}

      {!isLoading && !waitingForUser && !error && owned.length > 0 ? (
        <>
          <fieldset>
            <legend className="sr-only">Filter auctions by status</legend>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((item) => {
                const selected = statusFilter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setStatusFilter(item.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${
                      selected
                        ? 'border-sky-700 bg-sky-700 text-white'
                        : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              No auctions match this filter.
            </p>
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {visible.map((auction) => (
                  <li key={auction.id}>
                    <SellerAuctionItem auction={auction} />
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 md:block">
                <table className="min-w-full text-left text-sm">
                  <caption className="sr-only">Your auctions</caption>
                  <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                    <tr>
                      <th scope="col" className="px-4 py-3">
                        Auction
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Status
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Amount
                      </th>
                      <th scope="col" className="hidden px-4 py-3 lg:table-cell">
                        Starts
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Ends
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-zinc-950">
                    {visible.map((auction) => (
                      <SellerAuctionTableRow key={auction.id} auction={auction} />
                    ))}
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
