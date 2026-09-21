'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

import { buildSearchPageHref } from '@/lib/marketplace';

type AuctionToolbarProps = {
  /** Optional initial query shown in the search field. */
  initialQuery?: string;
  /** Shown beside the form (e.g. result count). */
  resultSummary?: string | null;
};

export default function AuctionToolbar({
  initialQuery = '',
  resultSummary = null,
}: AuctionToolbarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push(buildSearchPageHref(query));
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <form
        onSubmit={handleSubmit}
        role="search"
        className="flex w-full max-w-xl items-center gap-2"
      >
        <label className="sr-only" htmlFor="marketplace-search">
          Search auctions
        </label>
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            aria-hidden
          />
          <input
            id="marketplace-search"
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title, brand, category…"
            className="min-h-[44px] w-full rounded-xl border border-zinc-200/90 bg-white py-2.5 pl-10 pr-3.5 text-sm text-zinc-900 shadow-2xs outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Search
        </button>
      </form>
      {resultSummary ? (
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {resultSummary}
        </span>
      ) : null}
    </div>
  );
}
