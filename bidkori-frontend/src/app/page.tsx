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
      {/* Hero Section with Ambient Glow */}
      <section className="relative overflow-hidden border-b border-zinc-200/80 bg-gradient-to-b from-amber-500/5 via-amber-500/[0.02] to-transparent dark:border-zinc-800/80 dark:from-amber-500/[0.07] dark:via-transparent">
        {/* Background glow orb */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-amber-400/15 blur-3xl dark:bg-amber-600/10"
        />

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3.5 py-1 text-xs font-semibold tracking-wider text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
              <Gavel className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
              <span>LIVE AUCTIONS MARKETPLACE</span>
            </div>

            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-5xl lg:text-6xl">
              Bid on what{' '}
              <span className="bg-gradient-to-r from-amber-600 to-amber-500 bg-clip-text text-transparent">
                matters.
              </span>
            </h1>

            <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400 sm:text-lg leading-relaxed">
              Discover verified listings, place real-time bids with sub-second sync, and follow auctions across the BidKori marketplace.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <Link
                href={MARKETPLACE_ROUTES.auctions}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-amber-600/25 transition-all hover:from-amber-500 hover:to-amber-400 active:scale-98 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
              >
                Browse auctions
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href={MARKETPLACE_ROUTES.search}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white/90 px-5 py-3 text-sm font-semibold text-zinc-800 shadow-2xs transition-all hover:bg-zinc-50 active:scale-98 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Search marketplace
              </Link>
            </div>
          </div>

          {/* Quick Search Card */}
          <form
            onSubmit={handleSearch}
            role="search"
            className="w-full max-w-md rounded-3xl border border-zinc-200/90 bg-white/90 p-6 shadow-xl shadow-zinc-200/50 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-900/90 dark:shadow-none"
          >
            <div className="flex items-center justify-between">
              <label
                htmlFor="home-search"
                className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
              >
                Find an auction
              </label>
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                Live search
              </span>
            </div>

            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                  aria-hidden
                />
                <input
                  id="home-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Try laptop, watch, camera…"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50/80 py-2.5 pl-10 pr-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-all focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:bg-zinc-900"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-98 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Go
              </button>
            </div>

            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">Popular:</span>
              {['Watches', 'Phones', 'Art'].map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setQuery(term)}
                  className="rounded-lg bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>

            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Empty search opens the full auction browse page.
            </p>
          </form>
        </div>
      </section>

      {/* Main Content Grid Sections */}
      <div className="mx-auto w-full max-w-6xl space-y-16 px-4 py-14 sm:px-6">
        <section aria-labelledby="active-preview-heading">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <h2
                  id="active-preview-heading"
                  className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white"
                >
                  Active auctions
                </h2>
              </div>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                A live preview of auctions currently open for bidding.
              </p>
            </div>
            <Link
              href={MARKETPLACE_ROUTES.auctions}
              className="group inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
            >
              <span>View all</span>
              <span className="transition-transform duration-200 group-hover:translate-x-0.5">&rarr;</span>
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
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2
                  id="ending-soon-heading"
                  className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white"
                >
                  Ending soon
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Active listings ordered by soonest end time. Don&apos;t miss your chance to place the winning bid.
                </p>
              </div>
              <Link
                href={MARKETPLACE_ROUTES.auctions}
                className="group inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
              >
                <span>Browse all</span>
                <span className="transition-transform duration-200 group-hover:translate-x-0.5">&rarr;</span>
              </Link>
            </div>
            <AuctionGrid auctions={endingSoon} />
          </section>
        ) : null}

        {/* Bottom CTA Card */}
        <section className="relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-gradient-to-br from-zinc-50 via-amber-500/[0.04] to-zinc-100 p-8 text-center sm:p-12 dark:border-zinc-800/80 dark:from-zinc-900/80 dark:via-amber-500/[0.06] dark:to-zinc-900/40">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
            Ready to explore the marketplace?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Browse every active auction or search by product title and category to discover your next great win.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href={MARKETPLACE_ROUTES.auctions}
              className="inline-flex rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-600/20 transition-all hover:from-amber-500 hover:to-amber-400 active:scale-98"
            >
              Browse auctions
            </Link>
            <Link
              href={MARKETPLACE_ROUTES.search}
              className="inline-flex rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 shadow-2xs transition-all hover:bg-zinc-50 active:scale-98 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Search
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
