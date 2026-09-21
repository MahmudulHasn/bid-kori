'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Sparkles, Tag } from 'lucide-react';

import AuctionGrid from '@/components/marketplace/AuctionGrid';
import AuctionToolbar from '@/components/marketplace/AuctionToolbar';
import {
  AuctionGridSkeleton,
  MarketplaceEmptyState,
  MarketplaceErrorState,
} from '@/components/marketplace/MarketplaceStates';
import { auctionListFetcher } from '@/lib/auctionsApi';
import { CATEGORIES_API_PATH, categoriesFetcher } from '@/lib/categoriesApi';
import { ACTIVE_AUCTIONS_API_PATH, MARKETPLACE_ROUTES } from '@/lib/marketplace';
import type { Category } from '@/lib/types';

function AuctionsContent() {
  const searchParams = useSearchParams();
  const selectedCategory = searchParams.get('category') || '';

  const activeApiPath = selectedCategory
    ? `${ACTIVE_AUCTIONS_API_PATH}?category=${encodeURIComponent(selectedCategory)}`
    : ACTIVE_AUCTIONS_API_PATH;

  const { data, error, isLoading, mutate } = useSWR(
    activeApiPath,
    auctionListFetcher,
  );

  const { data: categoriesData } = useSWR<Category[]>(
    CATEGORIES_API_PATH,
    categoriesFetcher,
  );

  const auctions = data ?? [];
  const categories = categoriesData ?? [];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      {/* Header Banner */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span>Live Marketplace</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
            Active Auctions
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Real-time verified listings open for live competitive bidding.
          </p>
        </div>

        <div className="hidden sm:block text-right">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Total Active
          </span>
          <p className="text-2xl font-extrabold tabular-nums text-amber-700 dark:text-amber-400">
            {isLoading ? '…' : auctions.length}
          </p>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="mb-6">
        <AuctionToolbar
          resultSummary={
            !isLoading && !error
              ? `${auctions.length} active listing${auctions.length === 1 ? '' : 's'}`
              : null
          }
        />
      </div>

      {/* Category Pills Bar */}
      {categories.length > 0 && (
        <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <Link
            href={MARKETPLACE_ROUTES.auctions}
            className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
              !selectedCategory
                ? 'bg-zinc-900 text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-900'
                : 'border border-zinc-200/90 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:bg-zinc-800'
            }`}
          >
            <span>All Categories</span>
          </Link>
          {categories.map((cat) => {
            const isSelected =
              selectedCategory.toLowerCase() === (cat.slug || cat.name).toLowerCase();
            return (
              <Link
                key={cat.id}
                href={`${MARKETPLACE_ROUTES.auctions}?category=${encodeURIComponent(cat.slug || cat.name)}`}
                className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-amber-600 text-white shadow-xs shadow-amber-600/20 dark:bg-amber-500 dark:text-zinc-950 font-semibold'
                    : 'border border-zinc-200/90 bg-white text-zinc-700 hover:border-amber-400 hover:text-amber-800 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:border-amber-500'
                }`}
              >
                <Tag className="h-3 w-3 shrink-0" aria-hidden />
                <span>{cat.name}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Content Grid */}
      {isLoading ? <AuctionGridSkeleton count={8} /> : null}

      {error ? <MarketplaceErrorState onRetry={() => mutate()} /> : null}

      {!isLoading && !error && auctions.length === 0 ? (
        <MarketplaceEmptyState
          message={
            selectedCategory
              ? `No active auctions found in category “${selectedCategory}”.`
              : 'No active auctions are available right now.'
          }
        />
      ) : null}

      {!isLoading && !error && auctions.length > 0 ? (
        <AuctionGrid auctions={auctions} />
      ) : null}

      <div className="mt-12 rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-6 text-center dark:border-zinc-800/80 dark:bg-zinc-900/30">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Looking for a specific brand, model, or closed listing?{' '}
          <Link
            href="/search"
            className="font-semibold text-amber-700 hover:underline dark:text-amber-400"
          >
            Search the full marketplace catalog &rarr;
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function AuctionsPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
          <AuctionGridSkeleton count={8} />
        </main>
      }
    >
      <AuctionsContent />
    </Suspense>
  );
}

