export default function SellerLoading() {
  return (
    <div className="space-y-8" aria-busy="true">
      {/* Header Skeleton */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="h-8 w-48 animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-800" />
          <div className="h-4 w-80 animate-pulse rounded-lg bg-zinc-200/60 dark:bg-zinc-800/60" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-800" />
          <div className="h-9 w-32 animate-pulse rounded-xl bg-violet-600/40 dark:bg-violet-500/40" />
        </div>
      </header>

      {/* Metric Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-900/60"
          />
        ))}
      </div>

      {/* Analytics & Activity Split Skeleton */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-52 animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-900/60" />
        <div className="h-52 animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-900/60" />
      </div>

      {/* Table Skeleton */}
      <div className="h-64 animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-900/60" />
    </div>
  );
}
