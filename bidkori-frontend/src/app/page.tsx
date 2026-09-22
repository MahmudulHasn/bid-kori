'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Clock,
  Gavel,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import useSWR from 'swr';

import AuctionGrid from '@/components/marketplace/AuctionGrid';
import {
  AuctionGridSkeleton,
  MarketplaceEmptyState,
  MarketplaceErrorState,
} from '@/components/marketplace/MarketplaceStates';
import { auctionListFetcher } from '@/lib/auctionsApi';
import { CATEGORIES_API_PATH, categoriesFetcher } from '@/lib/categoriesApi';
import {
  ACTIVE_AUCTIONS_API_PATH,
  MARKETPLACE_ROUTES,
  buildSearchPageHref,
  sortAuctionsEndingSoon,
} from '@/lib/marketplace';
import type { Category } from '@/lib/types';

const PREVIEW_LIMIT = 4;

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const {
    data: auctionsData,
    error: auctionsError,
    isLoading: auctionsLoading,
    mutate: mutateAuctions,
  } = useSWR(ACTIVE_AUCTIONS_API_PATH, auctionListFetcher);

  const {
    data: categoriesData,
  } = useSWR<Category[]>(CATEGORIES_API_PATH, categoriesFetcher);

  const auctions = auctionsData ?? [];
  const categories = categoriesData ?? [];
  const activePreview = auctions.slice(0, PREVIEW_LIMIT);
  const endingSoon = sortAuctionsEndingSoon(auctions).slice(0, PREVIEW_LIMIT);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push(buildSearchPageHref(query));
  };

  return (
    <main className="flex-1">
      {/* SECTION 9 — COMPACT HERO & MOBILE SEARCH */}
      <section className="relative overflow-hidden border-b border-zinc-200/80 bg-gradient-to-b from-amber-500/10 via-amber-500/[0.02] to-transparent dark:border-zinc-800/80 dark:from-amber-500/[0.08] dark:via-transparent">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-amber-400/20 blur-3xl dark:bg-amber-600/15"
        />

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:py-14 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
              <Gavel className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
              <span>Real-Time Online Auctions</span>
            </div>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-4xl lg:text-5xl">
              Bid on what{' '}
              <span className="bg-gradient-to-r from-amber-600 to-amber-500 bg-clip-text text-transparent">
                matters.
              </span>
            </h1>

            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 sm:text-base leading-relaxed">
              Discover verified marketplace listings, place live bids with sub-second WebSocket sync, and win items transparently.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={MARKETPLACE_ROUTES.auctions}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-amber-600/20 transition-all hover:from-amber-500 hover:to-amber-400 active:scale-98 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
              >
                Browse Auctions
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/auth/register"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-200 bg-white/90 px-4 py-2.5 text-sm font-semibold text-zinc-800 shadow-2xs transition-all hover:bg-zinc-50 active:scale-98 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Sell on BidKori
              </Link>
            </div>
          </div>

          {/* SECTION 10 — SEARCH FORM */}
          <form
            onSubmit={handleSearch}
            role="search"
            className="w-full max-w-md rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-lg shadow-zinc-200/40 dark:border-zinc-800/80 dark:bg-zinc-900/90 dark:shadow-none"
          >
            <label
              htmlFor="home-search"
              className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
            >
              Search Marketplace
            </label>

            <div className="mt-2 flex gap-2">
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
                  placeholder="Search watches, laptops, art…"
                  className="min-h-[44px] w-full rounded-xl border border-zinc-300 bg-zinc-50 py-2.5 pl-10 pr-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
              </div>
              <button
                type="submit"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800 active:scale-98 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Go
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">Popular:</span>
              {['Smartphones', 'Laptops', 'Watches', 'Gaming'].map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setQuery(term)}
                  className="min-h-[30px] rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {term}
                </button>
              ))}
            </div>
          </form>
        </div>
      </section>

      {/* SECTION 11 — HORIZONTAL CATEGORY NAVIGATION */}
      {categories.length > 0 && (
        <section
          aria-labelledby="categories-heading"
          className="border-b border-zinc-200/80 bg-zinc-50/50 py-4 dark:border-zinc-800/80 dark:bg-zinc-900/30"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex items-center justify-between pb-2">
              <h2
                id="categories-heading"
                className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
              >
                Browse by Category
              </h2>
              <Link
                href={MARKETPLACE_ROUTES.auctions}
                className="text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400"
              >
                All Categories &rarr;
              </Link>
            </div>

            <div className="flex gap-2.5 overflow-x-auto pb-1 pt-1 scrollbar-none">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`${MARKETPLACE_ROUTES.auctions}?category=${encodeURIComponent(cat.slug || cat.name)}`}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-800 shadow-2xs transition hover:border-amber-400 hover:bg-amber-50/50 hover:text-amber-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-amber-500 dark:hover:bg-zinc-800"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
                  <span>{cat.name}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* MAIN CATALOG PREVIEWS */}
      <div className="mx-auto w-full max-w-6xl space-y-14 px-4 py-10 sm:px-6">
        {/* LIVE AUCTIONS SECTION */}
        <section aria-labelledby="live-auctions-heading">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <h2
                  id="live-auctions-heading"
                  className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-2xl"
                >
                  Live Auctions
                </h2>
              </div>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 sm:text-sm">
                Real-time auctions currently accepting competitive bids.
              </p>
            </div>
            <Link
              href={MARKETPLACE_ROUTES.auctions}
              className="group inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-600 dark:text-amber-400 sm:text-sm"
            >
              <span>View all ({auctions.length})</span>
              <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </Link>
          </div>

          {auctionsLoading ? <AuctionGridSkeleton count={4} /> : null}
          {auctionsError ? <MarketplaceErrorState onRetry={() => mutateAuctions()} /> : null}
          {!auctionsLoading && !auctionsError && activePreview.length === 0 ? (
            <MarketplaceEmptyState message="No live auctions available right now. Check back soon!" />
          ) : null}
          {!auctionsLoading && !auctionsError && activePreview.length > 0 ? (
            <AuctionGrid auctions={activePreview} />
          ) : null}
        </section>

        {/* ENDING SOON SECTION */}
        {!auctionsLoading && !auctionsError && endingSoon.length > 0 && (
          <section aria-labelledby="ending-soon-heading">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden />
                  <h2
                    id="ending-soon-heading"
                    className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-2xl"
                  >
                    Ending Soon
                  </h2>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 sm:text-sm">
                  Last chance countdowns ordered by soonest closing time.
                </p>
              </div>
              <Link
                href={MARKETPLACE_ROUTES.auctions}
                className="group inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-600 dark:text-amber-400 sm:text-sm"
              >
                <span>Browse all</span>
                <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
              </Link>
            </div>
            <AuctionGrid auctions={endingSoon} />
          </section>
        )}

        {/* TRUST & PLATFORM VALUE HIGHLIGHTS */}
        <section aria-labelledby="trust-heading" className="rounded-3xl border border-zinc-200/80 bg-zinc-50/70 p-6 sm:p-10 dark:border-zinc-800/80 dark:bg-zinc-900/40">
          <div className="text-center">
            <h2 id="trust-heading" className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-2xl">
              Why Bid with BidKori?
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-xs text-zinc-600 dark:text-zinc-400 sm:text-sm">
              Engineered from the ground up for fair, reliable, transparent online auctions.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                <Zap className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-zinc-900 dark:text-white">
                Real-Time WebSocket Sync
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Live bid escalation broadcasts over Django Channels and Redis with zero manual page refreshing required.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-zinc-900 dark:text-white">
                Atomic Bidding Engine
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                PostgreSQL row-level locking guarantees no out-of-order bids, no race conditions, and an authoritative winner.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                <Lock className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-zinc-900 dark:text-white">
                Transparent Fee Accounting
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Immutable 5% commission ledger snapshots protect both buyer settlement and seller net payouts.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
