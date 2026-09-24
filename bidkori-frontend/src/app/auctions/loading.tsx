import { AuctionGridSkeleton } from '@/components/marketplace/MarketplaceStates';

export default function AuctionsLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12" aria-busy="true">
      {/* Header Banner Skeleton */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="h-6 w-32 animate-pulse rounded-full bg-amber-500/10 dark:bg-amber-400/10" />
          <div className="h-8 w-48 animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-800" />
          <div className="h-4 w-72 animate-pulse rounded-lg bg-zinc-200/60 dark:bg-zinc-800/60" />
        </div>
        <div className="hidden sm:block text-right space-y-1">
          <div className="h-3 w-20 ml-auto animate-pulse rounded bg-zinc-200/60 dark:bg-zinc-800/60" />
          <div className="h-8 w-12 ml-auto animate-pulse rounded-lg bg-zinc-200/80 dark:bg-zinc-800" />
        </div>
      </div>

      {/* Search Toolbar Skeleton */}
      <div className="mb-6">
        <div className="h-11 w-full max-w-xl animate-pulse rounded-xl border border-zinc-200/80 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-900/60" />
      </div>

      {/* Category Pills Bar Skeleton */}
      <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <div className="h-9 w-28 shrink-0 animate-pulse rounded-xl bg-zinc-900/80 dark:bg-zinc-100/80" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-24 shrink-0 animate-pulse rounded-xl border border-zinc-200/80 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-900/50"
          />
        ))}
      </div>

      {/* Grid Skeleton */}
      <AuctionGridSkeleton count={8} />
    </main>
  );
}
