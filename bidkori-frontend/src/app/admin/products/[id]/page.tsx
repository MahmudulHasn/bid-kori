'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import useSWR from 'swr';
import type { ReactNode } from 'react';

import { getApiErrorMessage, getApiStatus } from '@/lib/apiErrors';
import {
  ADMIN_PRODUCTS_PATH,
  ADMIN_PRODUCT_READONLY_COPY,
  formatAdminProductCategory,
  formatAdminProductCondition,
  formatAdminProductSeller,
  getAdminLinkedAuctionSummary,
} from '@/lib/adminProducts';
import {
  AUCTIONS_LIST_API_PATH,
  auctionListFetcher,
} from '@/lib/auctionsApi';
import {
  buildProductDetailApiPath,
  productDetailFetcher,
} from '@/lib/productsApi';
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

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="text-sm font-medium text-zinc-900 dark:text-white">
        {children}
      </dd>
    </div>
  );
}

function ProductDetailBody({ product }: { product: Product }) {
  const created = formatTimestamp(product.created_at);
  const updated = formatTimestamp(product.updated_at);
  const title = product.title.trim() ? product.title : 'Untitled product';
  const categoryLabel = formatAdminProductCategory(product.category);
  const description = product.description?.trim();

  const { data: auctions } = useSWR(AUCTIONS_LIST_API_PATH, auctionListFetcher);
  const linked = getAdminLinkedAuctionSummary(product.id, auctions ?? []);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          <Link
            href={ADMIN_PRODUCTS_PATH}
            className="font-medium text-violet-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300"
          >
            ← Products
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Read-only product record from the platform catalog.
        </p>
      </header>

      <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        {ADMIN_PRODUCT_READONLY_COPY}
      </p>

      <section
        aria-labelledby="product-details-heading"
        className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 shadow-sm sm:px-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="product-details-heading"
          className="pt-3 text-base font-semibold text-zinc-900 dark:text-white"
        >
          Product Details
        </h2>
        <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
          <DetailRow label="Product ID">#{product.id}</DetailRow>
          <DetailRow label="Title">{title}</DetailRow>
          <DetailRow label="Condition">
            {formatAdminProductCondition(product.condition)}
          </DetailRow>
          <DetailRow label="Seller">
            {formatAdminProductSeller(product.seller)}
          </DetailRow>
          {categoryLabel ? (
            <DetailRow label="Category">{categoryLabel}</DetailRow>
          ) : null}
          <DetailRow label="Created">
            {created ? (
              <time dateTime={created.iso}>{created.label}</time>
            ) : (
              '—'
            )}
          </DetailRow>
          <DetailRow label="Updated">
            {updated ? (
              <time dateTime={updated.iso}>{updated.label}</time>
            ) : (
              '—'
            )}
          </DetailRow>
        </dl>
      </section>

      <section
        aria-labelledby="product-description-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="product-description-heading"
          className="text-base font-semibold text-zinc-900 dark:text-white"
        >
          Description
        </h2>
        <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
          {description || 'No description provided.'}
        </p>
      </section>

      {linked ? (
        <section
          aria-labelledby="linked-auction-heading"
          className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2
            id="linked-auction-heading"
            className="text-base font-semibold text-zinc-900 dark:text-white"
          >
            Linked Auction
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">Auction</dt>
              <dd className="font-medium tabular-nums text-zinc-900 dark:text-white">
                #{linked.id}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">Status</dt>
              <dd className="font-medium text-zinc-900 dark:text-white">
                {linked.statusLabel}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Resolved from the auction catalog. Admin Auction pages are not
            enabled yet.
          </p>
        </section>
      ) : null}
    </div>
  );
}

export default function AdminProductDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const detailKey =
    id != null && String(id).trim() !== ''
      ? buildProductDetailApiPath(id)
      : null;

  const { data: product, error, isLoading, mutate } = useSWR(
    detailKey,
    productDetailFetcher,
  );

  if (!detailKey) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">
          Product not found
        </h1>
        <Link
          href={ADMIN_PRODUCTS_PATH}
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          Back to Products
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <p className="sr-only">Loading product</p>
        <div className="h-10 w-2/3 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-48 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
      </div>
    );
  }

  if (error) {
    const status = getApiStatus(error);
    const notFound = status === 404;
    return (
      <div
        role="alert"
        className="space-y-4 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      >
        <h1 className="text-lg font-semibold">
          {notFound ? 'Product not found' : 'Could not load product'}
        </h1>
        <p>
          {getApiErrorMessage(
            error,
            notFound
              ? 'This product does not exist or is no longer available.'
              : 'Please try again in a moment.',
          )}
        </p>
        <div className="flex flex-wrap gap-3">
          {!notFound ? (
            <button
              type="button"
              onClick={() => void mutate()}
              className="inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-red-800 dark:hover:bg-red-950"
            >
              Try Again
            </button>
          ) : null}
          <Link
            href={ADMIN_PRODUCTS_PATH}
            className="inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium transition hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-950"
          >
            Back to Products
          </Link>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">
          Product not found
        </h1>
        <Link
          href={ADMIN_PRODUCTS_PATH}
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          Back to Products
        </Link>
      </div>
    );
  }

  return <ProductDetailBody product={product} />;
}
