import { AuctionGridSkeleton } from '@/components/marketplace/MarketplaceStates';

export default function BuyerLoading() {
  return (
    <div className="space-y-8" aria-busy="true">
      {/* Header Skeleton */}
      <header className="space-y-1">
        <div className="h-8 w-44 animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-800" />
        <div className="h-4 w-72 animate-pulse rounded-lg bg-zinc-200/60 dark:bg-zinc-800/60" />
      </header>

      {/* KPI Cards Skeleton */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-900/60"
          />
        ))}
      </div>

      {/* Tabs Skeleton */}
      <div className="flex gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <div className="h-9 w-28 animate-pulse rounded-xl bg-zinc-900/80 dark:bg-zinc-100/80" />
        <div className="h-9 w-24 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70" />
      </div>

      {/* Bids Grid Skeleton */}
      <AuctionGridSkeleton count={4} />
    </div>
  );
}
