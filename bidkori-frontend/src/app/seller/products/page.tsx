'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';

import SellerProductItem, {
  SellerProductTableRow,
} from '@/components/seller/SellerProductItem';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { MY_LISTINGS_API_PATH, myListingsFetcher } from '@/lib/productsApi';
import {
  filterSellerProducts,
  sortSellerProducts,
  type SellerProductSort,
} from '@/lib/seller';
import { SELLER_PRODUCT_CREATE_PATH } from '@/lib/workspaceNavigation';

const SORTS: { id: SellerProductSort; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'name', label: 'Name' },
];

export default function SellerProductsPage() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SellerProductSort>('newest');

  const {
    data: products,
    error,
    isLoading,
    mutate,
  } = useSWR(MY_LISTINGS_API_PATH, myListingsFetcher);

  const visible = useMemo(() => {
    const filtered = filterSellerProducts(products ?? [], query);
    return sortSellerProducts(filtered, sort);
  }, [products, query, sort]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
            My Products
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Catalog items you own. These are not auctions.
          </p>
        </div>
        <Link
          href={SELLER_PRODUCT_CREATE_PATH}
          className="inline-flex items-center justify-center rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
        >
          Create Product
        </Link>
      </header>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <p className="sr-only">Loading your products</p>
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <p>We couldn&apos;t load your products.</p>
          <p className="mt-1 text-xs opacity-80">
            {getApiErrorMessage(error, 'Please try again in a moment.')}
          </p>
          <button
            type="button"
            onClick={() => void mutate()}
            className="mt-3 inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:border-red-800 dark:hover:bg-red-950"
          >
            Try Again
          </button>
        </div>
      ) : null}

      {!isLoading && !error && (products?.length ?? 0) === 0 ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            You haven&apos;t created any products yet.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            Create a catalog item first. Listing it as an auction comes later.
          </p>
          <Link
            href={SELLER_PRODUCT_CREATE_PATH}
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            Create Product
          </Link>
        </section>
      ) : null}

      {!isLoading && !error && (products?.length ?? 0) > 0 ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="block min-w-0 flex-1 space-y-1.5">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Search products
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title or description"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-sky-500/40 focus:ring-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="block space-y-1.5 sm:w-40">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Sort
              </span>
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as SellerProductSort)
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-sky-500/40 focus:ring-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-zinc-700 dark:bg-zinc-900"
              >
                {SORTS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              No products match this search.
            </p>
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {visible.map((product) => (
                  <li key={product.id}>
                    <SellerProductItem product={product} />
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 md:block">
                <table className="min-w-full text-left text-sm">
                  <caption className="sr-only">Your products</caption>
                  <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                    <tr>
                      <th scope="col" className="px-4 py-3">
                        Product
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Condition
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Created
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-zinc-950">
                    {visible.map((product) => (
                      <SellerProductTableRow key={product.id} product={product} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
