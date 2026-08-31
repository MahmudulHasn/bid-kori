'use client';

import useSWR from 'swr';

import ProductCard from '@/components/ProductCard';
import api from '@/lib/api';
import type { Auction } from '@/lib/types';

const fetcher = async (url: string) => {
  const { data } = await api.get<Auction[]>(url);
  return data;
};

export default function HomePage() {
  const { data, error, isLoading } = useSWR('/auctions/', fetcher);

  const auctions = (data ?? []).filter(
    (auction) => !auction.status || auction.status === 'ACTIVE',
  );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8 max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
          Live marketplace
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Active auctions
        </h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Browse live BidKori listings and jump in before the clock runs out.
        </p>
      </div>

      {isLoading && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading auctions…</p>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          Could not load auctions. Is the Django API running on port 8000?
        </p>
      )}

      {!isLoading && !error && auctions.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No active auctions yet. Create one to get started.
        </p>
      )}

      {auctions.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {auctions.map((auction) => (
            <ProductCard key={auction.id} auction={auction} />
          ))}
        </div>
      )}
    </main>
  );
}
