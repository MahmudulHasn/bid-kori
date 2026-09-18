import { AlertCircle, PackageOpen, RotateCw } from 'lucide-react';

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
          className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-0 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900/50"
        >
          <div className="aspect-[4/3] w-full animate-pulse bg-zinc-200/70 dark:bg-zinc-800" />
          <div className="space-y-3 p-5">
            <div className="h-4 w-3/4 animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800" />
            <div className="h-3 w-1/3 animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800" />
            <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <div className="h-6 w-1/2 animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800" />
            </div>
            <div className="h-4 w-2/5 animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800" />
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
      className="flex flex-col items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/50 p-8 text-center dark:border-rose-900/50 dark:bg-rose-950/20"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400">
        <AlertCircle className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        Unable to load auctions
      </h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Could not connect to the live auction service. Please try again.
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-zinc-800 active:scale-98 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function MarketplaceEmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300/80 bg-zinc-50/60 px-6 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
        <PackageOpen className="h-6 w-6" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-400 max-w-sm">
        {message}
      </p>
    </div>
  );
}
