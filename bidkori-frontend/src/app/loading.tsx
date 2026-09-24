export default function RootLoading() {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="relative flex h-10 w-10 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-30" />
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
      <p className="mt-4 text-xs font-medium tracking-wide uppercase text-zinc-400 dark:text-zinc-500">
        Loading…
      </p>
    </div>
  );
}
