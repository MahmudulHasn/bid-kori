'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import useSWR from 'swr';

import { getApiErrorMessage } from '@/lib/apiErrors';
import ModerationVisibilityBadge from '@/components/admin/ModerationVisibilityBadge';
import {
  ADMIN_PRODUCT_READONLY_COPY,
  ADMIN_PRODUCT_SEARCH_HINT,
  ADMIN_PRODUCT_SORT_OPTIONS,
  adminProductDetailPath,
  filterAdminProducts,
  formatAdminProductCondition,
  formatAdminProductSeller,
  sortAdminProducts,
  type AdminProductSort,
} from '@/lib/adminProducts';
import {
  PRODUCTS_COLLECTION_API_PATH,
  productListFetcher,
} from '@/lib/productsApi';
import type { Product } from '@/lib/types';

function formatCreatedAt(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'MMM d, yyyy');
}

function ProductCard({ product }: { product: Product }) {
  const title = product.title.trim() ? product.title : 'Untitled product';
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
        <Link
          href={adminProductDetailPath(product.id)}
          className="hover:text-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:hover:text-violet-300"
        >
          {title}
        </Link>
      </h2>
      <dl className="mt-3 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex justify-between gap-3">
          <dt>ID</dt>
          <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">
            #{product.id}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Condition</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {formatAdminProductCondition(product.condition)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Seller</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {formatAdminProductSeller(product.seller)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Visibility</dt>
          <dd>
            <ModerationVisibilityBadge isHidden={product.is_hidden} />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Created</dt>
          <dd>{formatCreatedAt(product.created_at)}</dd>
        </div>
      </dl>
      <Link
        href={adminProductDetailPath(product.id)}
        className="mt-3 inline-flex text-sm font-semibold text-violet-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300"
      >
        View
        <span className="sr-only"> {title}</span>
      </Link>
    </article>
  );
}

export default function AdminProductsPage() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<AdminProductSort>('newest');

  const {
    data: products,
    error,
    isLoading,
    mutate,
  } = useSWR(PRODUCTS_COLLECTION_API_PATH, productListFetcher);

  const visible = useMemo(() => {
    const filtered = filterAdminProducts(products ?? [], query);
    return sortAdminProducts(filtered, sort);
  }, [products, query, sort]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Products
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Platform product catalog for operational visibility.
        </p>
        <p className="mt-2 max-w-2xl text-xs text-zinc-500 dark:text-zinc-500">
          {ADMIN_PRODUCT_READONLY_COPY}
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <p className="sr-only">Loading products</p>
          {Array.from({ length: 4 }).map((_, index) => (
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
          <p>We couldn&apos;t load the product catalog.</p>
          <p className="mt-1 text-xs opacity-80">
            {getApiErrorMessage(error, 'Please try again in a moment.')}
          </p>
          <button
            type="button"
            onClick={() => void mutate()}
            className="mt-3 inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-red-800 dark:hover:bg-red-950"
          >
            Try Again
          </button>
        </div>
      ) : null}

      {!isLoading && !error && (products?.length ?? 0) === 0 ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            No products found.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            The product catalog is empty.
          </p>
        </section>
      ) : null}

      {!isLoading && !error && (products?.length ?? 0) > 0 ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="block min-w-0 flex-1 space-y-1.5">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Filter loaded products
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Title, description, condition, or seller ID"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500/40 focus:ring-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-zinc-700 dark:bg-zinc-900"
              />
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                {ADMIN_PRODUCT_SEARCH_HINT}
              </span>
            </label>
            <label className="block space-y-1.5 sm:w-44">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Sort
              </span>
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as AdminProductSort)
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500/40 focus:ring-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-zinc-700 dark:bg-zinc-900"
              >
                {ADMIN_PRODUCT_SORT_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              No products match this filter.
            </p>
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {visible.map((product) => (
                  <li key={product.id}>
                    <ProductCard product={product} />
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 md:block">
                <table className="min-w-full text-left text-sm">
                  <caption className="sr-only">
                    Platform products catalog
                  </caption>
                  <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                    <tr>
                      <th scope="col" className="px-4 py-3">
                        ID
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Title
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Condition
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Seller
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Visibility
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
                    {visible.map((product) => {
                      const title = product.title.trim()
                        ? product.title
                        : 'Untitled product';
                      return (
                        <tr
                          key={product.id}
                          className="border-t border-zinc-100 dark:border-zinc-800"
                        >
                          <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                            #{product.id}
                          </td>
                          <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">
                            <Link
                              href={adminProductDetailPath(product.id)}
                              className="hover:text-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:hover:text-violet-300"
                            >
                              {title}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                            {formatAdminProductCondition(product.condition)}
                          </td>
                          <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                            {formatAdminProductSeller(product.seller)}
                          </td>
                          <td className="px-4 py-3">
                            <ModerationVisibilityBadge
                              isHidden={product.is_hidden}
                            />
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {formatCreatedAt(product.created_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={adminProductDetailPath(product.id)}
                              className="font-semibold text-violet-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300"
                            >
                              View
                              <span className="sr-only"> {title}</span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                Showing {visible.length} of {products?.length ?? 0} loaded
                products (unpaginated catalog from GET /products/).
              </p>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
