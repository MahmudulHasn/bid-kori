export default function AdminLoading() {
  return (
    <div className="space-y-8" aria-busy="true">
      {/* Header Skeleton */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-56 animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-800" />
            <div className="h-5 w-14 animate-pulse rounded-md bg-violet-100 dark:bg-violet-950/60" />
          </div>
          <div className="h-4 w-96 animate-pulse rounded-lg bg-zinc-200/60 dark:bg-zinc-800/60" />
        </div>
        <div className="h-9 w-24 animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-800" />
      </header>

      {/* Runtime Telemetry Skeleton */}
      <div className="h-14 animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-900/60" />

      {/* 8 KPI Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-900/60"
          />
        ))}
      </div>

      {/* Charts Grid Skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-900/60" />
        <div className="h-64 animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-900/60" />
      </div>
    </div>
  );
}
