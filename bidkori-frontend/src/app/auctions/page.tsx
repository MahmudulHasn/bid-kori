'use client';

import Link from 'next/link';
import useSWR from 'swr';

import AuctionGrid from '@/components/marketplace/AuctionGrid';
import AuctionToolbar from '@/components/marketplace/AuctionToolbar';
import {
  AuctionGridSkeleton,
  MarketplaceEmptyState,
  MarketplaceErrorState,
} from '@/components/marketplace/MarketplaceStates';
import { auctionListFetcher } from '@/lib/auctionsApi';
import { ACTIVE_AUCTIONS_API_PATH } from '@/lib/marketplace';

export default function AuctionsPage() {
  const { data, error, isLoading, mutate } = useSWR(
    ACTIVE_AUCTIONS_API_PATH,
    auctionListFetcher,
  );

  const auctions = data ?? [];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8 max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
          Marketplace
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Active auctions
        </h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Browse live BidKori listings that are open for bidding right now.
        </p>
      </div>

      <div className="mb-8">
        <AuctionToolbar
          resultSummary={
            !isLoading && !error
              ? `${auctions.length} active listing${auctions.length === 1 ? '' : 's'}`
              : null
          }
        />
      </div>

      {isLoading ? <AuctionGridSkeleton /> : null}

      {error ? <MarketplaceErrorState onRetry={() => mutate()} /> : null}

      {!isLoading && !error && auctions.length === 0 ? (
        <MarketplaceEmptyState message="No active auctions are available right now." />
      ) : null}

      {!isLoading && !error && auctions.length > 0 ? (
        <AuctionGrid auctions={auctions} />
      ) : null}

      <p className="mt-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Looking for something specific?{' '}
        <Link
          href="/search"
          className="font-medium text-amber-700 hover:underline dark:text-amber-300"
        >
          Search all auctions
        </Link>
      </p>
    </main>
  );
}
