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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <form
        onSubmit={handleSubmit}
        role="search"
        className="flex w-full max-w-xl flex-col gap-2 sm:flex-row sm:items-center"
      >
        <label className="sr-only" htmlFor="marketplace-search">
          Search auctions
        </label>
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            aria-hidden
          />
          <input
            id="marketplace-search"
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title or description"
            className="w-full rounded-lg border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-amber-500/40 focus-visible:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
        >
          Search
        </button>
      </form>
      {resultSummary ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{resultSummary}</p>
      ) : null}
    </div>
  );
}
