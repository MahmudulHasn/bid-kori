'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import useSWR from 'swr';

import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage, getApiStatus } from '@/lib/apiErrors';
import {
  buildProductDetailApiPath,
  productDetailFetcher,
} from '@/lib/productsApi';
import {
  formatSellerProductCondition,
  isProductOwnedByUser,
} from '@/lib/seller';
import {
  SELLER_PRODUCTS_PATH,
  sellerProductEditPath,
} from '@/lib/workspaceNavigation';
import type { Product } from '@/lib/types';

function formatTimestamp(
  value: string | undefined,
): { iso: string; label: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    iso: date.toISOString(),
    label: format(date, 'MMM d, yyyy, h:mm a'),
  };
}

function OwnedProductDetail({ product }: { product: Product }) {
  const created = formatTimestamp(product.created_at);
  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          {product.title.trim() ? product.title : 'Untitled product'}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Product details from your catalog.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={sellerProductEditPath(product.id)}
            className="inline-flex items-center justify-center rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            Edit Product
          </Link>
        </div>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          Delete unavailable while auction-history safeguards are pending.
        </p>
      </header>

      <div
        className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
        role="img"
        aria-label="No product image available"
      >
        No product image
      </div>

      <section
        aria-labelledby="product-details-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="product-details-heading"
          className="text-base font-semibold text-zinc-900 dark:text-white"
        >
          Product details
        </h2>
        <dl className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-6">
            <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Condition
            </dt>
            <dd className="text-sm text-zinc-900 dark:text-white">
              {formatSellerProductCondition(product.condition)}
            </dd>
          </div>
          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-6">
            <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Created
            </dt>
            <dd className="text-sm text-zinc-900 dark:text-white">
              {created ? <time dateTime={created.iso}>{created.label}</time> : '—'}
            </dd>
          </div>
        </dl>
        <div className="mt-4">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Description
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
            {product.description?.trim()
              ? product.description
              : 'No description provided.'}
          </p>
        </div>
      </section>
    </>
  );
}

export default function SellerProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id;
  const { user } = useAuth();

  const {
    data: product,
    error,
    isLoading,
    mutate,
  } = useSWR(
    productId ? buildProductDetailApiPath(productId) : null,
    productDetailFetcher,
  );

  const owned = isProductOwnedByUser(product, user);
  const status = getApiStatus(error);
  const unavailable = Boolean(error) && (status === 404 || status === 403);

  return (
    <div className="space-y-8">
      <p>
        <Link
          href={SELLER_PRODUCTS_PATH}
          className="text-sm text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
        >
          ← Back to products
        </Link>
      </p>

      {isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <p className="sr-only">Loading product</p>
          <div className="h-10 w-2/3 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-48 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
        </div>
      ) : null}

      {unavailable ? (
        <section
          role="alert"
          className="rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">
            Product unavailable
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            We couldn&apos;t load this product.
          </p>
        </section>
      ) : null}

      {error && !unavailable ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <p>We couldn&apos;t load this product.</p>
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

      {!isLoading && !error && product && !owned ? (
        <section className="rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">
            You don&apos;t have permission to manage this product.
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            This listing is not part of your seller catalog.
          </p>
        </section>
      ) : null}

      {!isLoading && !error && product && owned ? (
        <OwnedProductDetail product={product} />
      ) : null}
    </div>
  );
}
