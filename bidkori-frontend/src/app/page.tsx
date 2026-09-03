'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Gavel, Search } from 'lucide-react';
import useSWR from 'swr';

import AuctionGrid from '@/components/marketplace/AuctionGrid';
import {
  AuctionGridSkeleton,
  MarketplaceEmptyState,
  MarketplaceErrorState,
} from '@/components/marketplace/MarketplaceStates';
import { auctionListFetcher } from '@/lib/auctionsApi';
import {
  ACTIVE_AUCTIONS_API_PATH,
  MARKETPLACE_ROUTES,
  buildSearchPageHref,
  sortAuctionsEndingSoon,
} from '@/lib/marketplace';

const PREVIEW_LIMIT = 4;

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { data, error, isLoading, mutate } = useSWR(
    ACTIVE_AUCTIONS_API_PATH,
    auctionListFetcher,
  );

  const auctions = data ?? [];
  const activePreview = auctions.slice(0, PREVIEW_LIMIT);
  const endingSoon = sortAuctionsEndingSoon(auctions).slice(0, PREVIEW_LIMIT);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push(buildSearchPageHref(query));
  };

  return (
    <main className="flex-1">
      <section className="border-b border-zinc-200 bg-gradient-to-b from-amber-50/80 to-white dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-14 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
              <Gavel className="h-4 w-4" aria-hidden />
              BidKori
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-5xl">
              Bid on what matters.
            </h1>
            <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400 sm:text-lg">
              Discover live auctions, place bids, and follow listings across the
              BidKori marketplace.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={MARKETPLACE_ROUTES.auctions}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
              >
                Browse auctions
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href={MARKETPLACE_ROUTES.search}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                Search marketplace
              </Link>
            </div>
          </div>

          <form
            onSubmit={handleSearch}
            role="search"
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <label
              htmlFor="home-search"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Search auctions
            </label>
            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                  aria-hidden
                />
                <input
                  id="home-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Try laptop, watch, camera…"
                  className="w-full rounded-lg border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-amber-500/40 focus-visible:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Go
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Empty search opens the full auction browse page.
            </p>
          </form>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl space-y-12 px-4 py-12 sm:px-6">
        <section aria-labelledby="active-preview-heading">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="active-preview-heading"
                className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white"
              >
                Active auctions
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                A live preview of auctions open for bidding.
              </p>
            </div>
            <Link
              href={MARKETPLACE_ROUTES.auctions}
              className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-300"
            >
              View all
            </Link>
          </div>

          {isLoading ? <AuctionGridSkeleton count={4} /> : null}
          {error ? <MarketplaceErrorState onRetry={() => mutate()} /> : null}
          {!isLoading && !error && activePreview.length === 0 ? (
            <MarketplaceEmptyState message="No active auctions are available right now." />
          ) : null}
          {!isLoading && !error && activePreview.length > 0 ? (
            <AuctionGrid auctions={activePreview} />
          ) : null}
        </section>

        {!isLoading && !error && endingSoon.length > 0 ? (
          <section aria-labelledby="ending-soon-heading">
            <div className="mb-6">
              <h2
                id="ending-soon-heading"
                className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white"
              >
                Ending soon
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Active listings ordered by soonest end time.
              </p>
            </div>
            <AuctionGrid auctions={endingSoon} />
          </section>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
            Ready to explore the marketplace?
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-zinc-600 dark:text-zinc-400">
            Browse every active auction or search by product details.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href={MARKETPLACE_ROUTES.auctions}
              className="inline-flex rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500"
            >
              Browse auctions
            </Link>
            <Link
              href={MARKETPLACE_ROUTES.search}
              className="inline-flex rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-white dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-950"
            >
              Search
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
