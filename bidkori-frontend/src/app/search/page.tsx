'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';

import AuctionGrid from '@/components/marketplace/AuctionGrid';
import AuctionToolbar from '@/components/marketplace/AuctionToolbar';
import {
  AuctionGridSkeleton,
  MarketplaceEmptyState,
  MarketplaceErrorState,
} from '@/components/marketplace/MarketplaceStates';
import { auctionListFetcher } from '@/lib/auctionsApi';
import {
  buildAuctionSearchApiPath,
  normalizeSearchQuery,
} from '@/lib/marketplace';

function SearchResults() {
  const searchParams = useSearchParams();
  const rawQuery = searchParams.get('q');
  const query = normalizeSearchQuery(rawQuery);
  const apiPath = query ? buildAuctionSearchApiPath(query) : null;

  const { data, error, isLoading, mutate } = useSWR(
    apiPath,
    auctionListFetcher,
  );

  const auctions = data ?? [];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8 max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
          Search
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Find auctions
        </h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Search BidKori listings by product title or description.
        </p>
      </div>

      <div className="mb-8">
        <AuctionToolbar
          initialQuery={query ?? ''}
          resultSummary={
            query && !isLoading && !error
              ? `${auctions.length} result${auctions.length === 1 ? '' : 's'} for “${query}”`
              : null
          }
        />
      </div>

      {!query ? (
        <MarketplaceEmptyState message="Enter a search term to find auctions." />
      ) : null}

      {query && isLoading ? <AuctionGridSkeleton /> : null}

      {query && error ? (
        <MarketplaceErrorState onRetry={() => mutate()} />
      ) : null}

      {query && !isLoading && !error && auctions.length === 0 ? (
        <MarketplaceEmptyState
          message={`No auctions matched “${query}”.`}
        />
      ) : null}

      {query && !isLoading && !error && auctions.length > 0 ? (
        <AuctionGrid auctions={auctions} />
      ) : null}
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
          <AuctionGridSkeleton count={4} />
        </main>
      }
    >
      <SearchResults />
    </Suspense>
  );
}
