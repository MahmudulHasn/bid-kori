'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';

import AuctionGrid from '@/components/marketplace/AuctionGrid';
import AuctionToolbar from '@/components/marketplace/AuctionToolbar';
import {
  AuctionGridSkeleton,
  MarketplaceEmptyState,
  MarketplaceErrorState,
} from '@/components/marketplace/MarketplaceStates';
import { auctionListFetcher } from '@/lib/auctionsApi';
import { CATEGORIES_API_PATH, categoriesFetcher } from '@/lib/categoriesApi';
import { getCategoryVisual } from '@/lib/categoryVisuals';
import {
  buildActiveAuctionsApiPath,
  buildMarketplaceAuctionsHref,
  normalizeSearchQuery,
} from '@/lib/marketplace';
import { resolveMediaUrl } from '@/lib/media';
import type { Category } from '@/lib/types';

function MarketplaceCategoryCard({
  cat,
  isSelected,
  searchQuery,
}: {
  cat: Category;
  isSelected: boolean;
  searchQuery: string;
}) {
  const [imageError, setImageError] = useState(false);
  const visual = getCategoryVisual(cat.name);
  const Icon = visual.icon;
  const resolvedUrl = cat.image ? resolveMediaUrl(cat.image) : null;
  const showImage = Boolean(resolvedUrl && !imageError);

  return (
    <Link
      href={buildMarketplaceAuctionsHref({
        category: cat.slug || cat.name,
        query: searchQuery,
      })}
      className={`group relative flex min-w-[105px] sm:min-w-[120px] max-w-[135px] flex-col items-center justify-center rounded-2xl border p-3 text-center transition-all duration-300 shrink-0 ${
        isSelected
          ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/40 dark:border-amber-400 dark:bg-amber-400/10'
          : 'border-zinc-200/90 bg-white hover:border-amber-400 hover:bg-zinc-50 hover:shadow-md dark:border-zinc-800 dark:bg-[#0B0F1A] dark:hover:border-amber-500/50 dark:hover:bg-[#0F1424] dark:hover:shadow-amber-500/5'
      }`}
    >
      {isSelected && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
        </span>
      )}
      <div
        className={`relative flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center overflow-hidden rounded-xl border transition-transform duration-200 group-hover:scale-110 ${
          showImage
            ? isSelected
              ? 'border-amber-500 bg-zinc-900/60 shadow-inner'
              : 'border-zinc-200 dark:border-zinc-700/80 bg-zinc-100 dark:bg-zinc-900/60 shadow-inner'
            : visual.color
        }`}
      >
        {showImage ? (
          <img
            src={resolvedUrl!}
            alt={cat.name}
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <Icon className="h-5 w-5" />
        )}
      </div>
      <span
        className={`mt-2.5 text-xs font-semibold line-clamp-1 transition ${
          isSelected
            ? 'text-amber-800 dark:text-amber-300 font-bold'
            : 'text-zinc-700 group-hover:text-amber-700 dark:text-zinc-300 dark:group-hover:text-white'
        }`}
      >
        {cat.name}
      </span>
    </Link>
  );
}

function AuctionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCategory = searchParams.get('category') || '';
  const rawQuery = searchParams.get('q') || searchParams.get('search') || '';
  const searchQuery = normalizeSearchQuery(rawQuery) ?? '';

  const activeApiPath = useMemo(() => {
    return buildActiveAuctionsApiPath({
      category: selectedCategory,
      search: searchQuery,
    });
  }, [selectedCategory, searchQuery]);

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

  const handleSearch = (newQuery: string) => {
    router.push(
      buildMarketplaceAuctionsHref({
        category: selectedCategory,
        query: newQuery,
      }),
    );
  };

  const handleClearSearch = () => {
    router.push(
      buildMarketplaceAuctionsHref({
        category: selectedCategory,
        query: '',
      }),
    );
  };

  const resultSummary = useMemo(() => {
    if (isLoading || error) return null;
    if (searchQuery) {
      return `${auctions.length} active result${auctions.length === 1 ? '' : 's'} for “${searchQuery}”`;
    }
    return `${auctions.length} active listing${auctions.length === 1 ? '' : 's'}`;
  }, [auctions.length, searchQuery, isLoading, error]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScrollability = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScrollability();
    el.addEventListener('scroll', checkScrollability, { passive: true });
    window.addEventListener('resize', checkScrollability);
    return () => {
      el.removeEventListener('scroll', checkScrollability);
      window.removeEventListener('resize', checkScrollability);
    };
  }, [checkScrollability, categories]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = 360;
    el.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

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
            {searchQuery ? 'Active Matches' : 'Total Active'}
          </span>
          <p className="text-2xl font-extrabold tabular-nums text-amber-700 dark:text-amber-400">
            {isLoading ? '…' : auctions.length}
          </p>
        </div>
      </div>

      {/* Search Toolbar (filters only Active Auctions in this section) */}
      <div className="mb-6">
        <AuctionToolbar
          initialQuery={searchQuery}
          onSearch={handleSearch}
          onClear={handleClearSearch}
          resultSummary={resultSummary}
        />
      </div>

      {/* Category Section (Large Cards with Left-Right Scrolling Controls) */}
      {categories.length > 0 && (
        <section aria-label="Marketplace Categories" className="mb-8">
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 sm:text-base">
                Browse by Category
              </h2>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {categories.length}
              </span>
            </div>

            {/* Left - Right Scrolling Navigation Controls <- -> */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleScroll('left')}
                disabled={!canScrollLeft}
                aria-label="Scroll categories left"
                title="Scroll categories left"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 shadow-2xs transition hover:border-amber-400 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-amber-500 dark:hover:text-amber-400"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleScroll('right')}
                disabled={!canScrollRight}
                aria-label="Scroll categories right"
                title="Scroll categories right"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 shadow-2xs transition hover:border-amber-400 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-amber-500 dark:hover:text-amber-400"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Carousel Track with Floating Left-Right Side Buttons */}
          <div className="relative group/carousel">
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => handleScroll('left')}
                aria-label="Scroll categories left"
                className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 hidden sm:flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white/95 text-zinc-800 shadow-lg backdrop-blur-md transition hover:scale-110 hover:border-amber-400 hover:text-amber-600 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200 dark:hover:border-amber-500 dark:hover:text-amber-400"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}

            <div
              ref={scrollRef}
              className="flex items-center gap-3 overflow-x-auto pb-3 pt-1 scroll-smooth scrollbar-none"
            >
              {/* All Categories Card */}
              <Link
                href={buildMarketplaceAuctionsHref({ query: searchQuery })}
                className={`group relative flex min-w-[105px] sm:min-w-[120px] max-w-[135px] flex-col items-center justify-center rounded-2xl border p-3 text-center transition-all duration-300 shrink-0 ${
                  !selectedCategory
                    ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/40 dark:border-amber-400 dark:bg-amber-400/10'
                    : 'border-zinc-200/90 bg-white hover:border-amber-400 hover:bg-zinc-50 hover:shadow-md dark:border-zinc-800 dark:bg-[#0B0F1A] dark:hover:border-amber-500/50 dark:hover:bg-[#0F1424] dark:hover:shadow-amber-500/5'
                }`}
              >
                {!selectedCategory && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
                  </span>
                )}
                <div
                  className={`relative flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center overflow-hidden rounded-xl border transition-transform duration-200 group-hover:scale-110 ${
                    !selectedCategory
                      ? 'border-amber-500/50 bg-amber-500/20 text-amber-600 dark:text-amber-300'
                      : 'border-zinc-200 dark:border-zinc-700/80 bg-zinc-100 dark:bg-zinc-900/60 text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  <Layers className="h-5 w-5" />
                </div>
                <span
                  className={`mt-2.5 text-xs font-semibold line-clamp-1 transition ${
                    !selectedCategory
                      ? 'text-amber-800 dark:text-amber-300 font-bold'
                      : 'text-zinc-700 group-hover:text-amber-700 dark:text-zinc-300 dark:group-hover:text-white'
                  }`}
                >
                  All Categories
                </span>
              </Link>

              {/* Dynamic Category Cards */}
              {categories.map((cat) => {
                const isSelected =
                  selectedCategory.toLowerCase() === (cat.slug || cat.name).toLowerCase();
                return (
                  <MarketplaceCategoryCard
                    key={cat.id}
                    cat={cat}
                    isSelected={isSelected}
                    searchQuery={searchQuery}
                  />
                );
              })}
            </div>

            {canScrollRight && (
              <button
                type="button"
                onClick={() => handleScroll('right')}
                aria-label="Scroll categories right"
                className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 hidden sm:flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white/95 text-zinc-800 shadow-lg backdrop-blur-md transition hover:scale-110 hover:border-amber-400 hover:text-amber-600 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200 dark:hover:border-amber-500 dark:hover:text-amber-400"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>
        </section>
      )}

      {/* Content Grid */}
      {isLoading ? <AuctionGridSkeleton count={8} /> : null}

      {error ? <MarketplaceErrorState onRetry={() => mutate()} /> : null}

      {!isLoading && !error && auctions.length === 0 ? (
        <div className="space-y-4">
          <MarketplaceEmptyState
            message={
              searchQuery
                ? selectedCategory
                  ? `No active auctions found matching “${searchQuery}” in category “${selectedCategory}”.`
                  : `No active auctions found matching “${searchQuery}”.`
                : selectedCategory
                  ? `No active auctions found in category “${selectedCategory}”.`
                  : 'No active auctions are available right now.'
            }
          />
          {searchQuery && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleClearSearch}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Clear Search Filter
              </button>
            </div>
          )}
        </div>
      ) : null}

      {!isLoading && !error && auctions.length > 0 ? (
        <AuctionGrid auctions={auctions} />
      ) : null}

      <div className="mt-12 rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-6 text-center dark:border-zinc-800/80 dark:bg-zinc-900/30">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Looking for a specific brand, model, or closed listing?{' '}
          <Link
            href={
              searchQuery
                ? `/search?q=${encodeURIComponent(searchQuery)}`
                : '/search'
            }
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
