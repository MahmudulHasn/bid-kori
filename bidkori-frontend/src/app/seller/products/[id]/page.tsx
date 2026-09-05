'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useState } from 'react';
import toast from 'react-hot-toast';
import useSWR, { useSWRConfig } from 'swr';

import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage, getApiStatus } from '@/lib/apiErrors';
import {
  AUCTIONS_LIST_API_PATH,
  auctionListFetcher,
} from '@/lib/auctionsApi';
import {
  MY_LISTINGS_API_PATH,
  buildProductDetailApiPath,
  deleteProduct,
  productDetailFetcher,
} from '@/lib/productsApi';
import {
  canOfferSellerProductEdit,
  canSellerDeleteProduct,
  formatSellerProductCondition,
  getAuctionedProductIds,
  isProductLinkedAuctionDeleteError,
  isProductOwnedByUser,
} from '@/lib/seller';
import {
  SELLER_PRODUCTS_PATH,
  sellerAuctionCreatePath,
  sellerProductEditPath,
} from '@/lib/workspaceNavigation';
import type { Auction, AuthUser, Product } from '@/lib/types';

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

function OwnedProductDetail({
  product,
  user,
  auctions,
  onDeleted,
  onDeleteRejected,
}: {
  product: Product;
  user: AuthUser;
  auctions: readonly Auction[];
  onDeleted: () => Promise<void>;
  onDeleteRejected: () => Promise<void>;
}) {
  const created = formatTimestamp(product.created_at);
  const title = product.title.trim() ? product.title : 'Untitled product';
  const canDelete = canSellerDeleteProduct(product, user, auctions);
  const canEdit = canOfferSellerProductEdit(product, user, auctions);
  const canCreateAuction = !getAuctionedProductIds(auctions).has(product.id);
  const [deletePhase, setDeletePhase] = useState<
    'idle' | 'confirming' | 'submitting'
  >('idle');
  const [deleteError, setDeleteError] = useState<string>();

  const handleDelete = async () => {
    if (deletePhase === 'submitting') return;
    setDeletePhase('submitting');
    setDeleteError(undefined);
    try {
      await deleteProduct(product.id);
      toast.success('Product deleted.');
      await onDeleted();
    } catch (error: unknown) {
      const message = getApiErrorMessage(
        error,
        isProductLinkedAuctionDeleteError(error)
          ? 'This product cannot be deleted because it is linked to an auction.'
          : 'We could not delete this product.',
      );
      setDeleteError(message);
      setDeletePhase('confirming');
      await onDeleteRejected();
    }
  };

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Product details from your catalog.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {canEdit ? (
            <Link
              href={sellerProductEditPath(product.id)}
              className="inline-flex items-center justify-center rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
            >
              Edit Product
            </Link>
          ) : null}
          {canCreateAuction ? (
            <Link
              href={sellerAuctionCreatePath(product.id)}
              className="inline-flex items-center justify-center rounded-lg border border-sky-700 px-3 py-1.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300 dark:hover:bg-sky-950"
            >
              Create Auction
            </Link>
          ) : null}
        </div>
        {!canEdit ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Product details are locked once the linked auction starts or
            receives bids.
          </p>
        ) : null}
        {!canDelete ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Delete is unavailable while this product is linked to an auction.
          </p>
        ) : deletePhase === 'idle' ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setDeleteError(undefined);
                setDeletePhase('confirming');
              }}
              className="inline-flex items-center justify-center rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
            >
              Delete Product
            </button>
          </div>
        ) : (
          <div
            role="group"
            aria-labelledby="delete-product-confirm-heading"
            className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 dark:border-red-900 dark:bg-red-950/40"
          >
            <h2
              id="delete-product-confirm-heading"
              className="text-sm font-semibold text-red-900 dark:text-red-200"
            >
              Delete product?
            </h2>
            <p className="mt-2 text-sm text-red-800 dark:text-red-300">
              This product has no auction and can be permanently removed.
            </p>
            {deleteError ? (
              <p
                role="alert"
                className="mt-3 text-sm font-medium text-red-900 dark:text-red-200"
              >
                {deleteError}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={deletePhase === 'submitting'}
                onClick={() => {
                  setDeletePhase('idle');
                  setDeleteError(undefined);
                }}
                className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                Keep Product
              </button>
              <button
                type="button"
                disabled={deletePhase === 'submitting'}
                aria-busy={deletePhase === 'submitting'}
                onClick={() => void handleDelete()}
                className="inline-flex rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletePhase === 'submitting' ? 'Deleting…' : 'Delete Product'}
              </button>
            </div>
          </div>
        )}
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
  const router = useRouter();
  const { user } = useAuth();
  const { mutate: mutateGlobal } = useSWRConfig();

  const {
    data: product,
    error,
    isLoading,
    mutate,
  } = useSWR(
    productId ? buildProductDetailApiPath(productId) : null,
    productDetailFetcher,
  );

  const { data: auctions = [], mutate: mutateAuctions } = useSWR(
    AUCTIONS_LIST_API_PATH,
    auctionListFetcher,
  );

  const owned = isProductOwnedByUser(product, user);
  const status = getApiStatus(error);
  const unavailable = Boolean(error) && (status === 404 || status === 403);

  const handleDeleted = async () => {
    await mutateGlobal(MY_LISTINGS_API_PATH);
    await mutateAuctions();
    router.push(SELLER_PRODUCTS_PATH);
  };

  const handleDeleteRejected = async () => {
    await mutate();
    await mutateAuctions();
    await mutateGlobal(MY_LISTINGS_API_PATH);
  };

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

      {!isLoading && !error && product && owned && user ? (
        <OwnedProductDetail
          product={product}
          user={user}
          auctions={auctions}
          onDeleted={handleDeleted}
          onDeleteRejected={handleDeleteRejected}
        />
      ) : null}
    </div>
  );
}
