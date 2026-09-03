type MarketplaceStateProps = {
  onRetry?: () => void;
};

export function AuctionGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      aria-hidden
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="aspect-[4/3] animate-pulse bg-zinc-100 dark:bg-zinc-900" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-5 w-1/2 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MarketplaceErrorState({ onRetry }: MarketplaceStateProps) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
    >
      <p>Could not load auctions. Please try again.</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:border-red-800 dark:hover:bg-red-950"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function MarketplaceEmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
      {message}
    </p>
  );
}
