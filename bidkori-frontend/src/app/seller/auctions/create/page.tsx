'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { useMemo, useState, Suspense } from 'react';
import toast from 'react-hot-toast';
import useSWR, { useSWRConfig } from 'swr';

import AuctionForm from '@/components/seller/AuctionForm';
import {
  getApiErrorMessage,
  getApiFieldErrors,
  getApiStatus,
  isAuctionProductConflictError,
} from '@/lib/apiErrors';
import {
  AUCTION_CREATE_API_PATH,
  buildExistingProductAuctionPayload,
  emptyAuctionFormValues,
  type AuctionFormField,
  type AuctionFormValues,
} from '@/lib/auctionCreateContract';
import {
  AUCTIONS_LIST_API_PATH,
  auctionListFetcher,
  createAuction,
} from '@/lib/auctionsApi';
import { MY_LISTINGS_API_PATH, myListingsFetcher } from '@/lib/productsApi';
import {
  formatSellerProductCondition,
  getEligibleAuctionProducts,
  resolveAuctionCreateProductHint,
  sortSellerProducts,
} from '@/lib/seller';
import type { Product } from '@/lib/types';
import {
  SELLER_AUCTIONS_PATH,
  SELLER_PRODUCT_CREATE_PATH,
  sellerAuctionDetailPath,
} from '@/lib/workspaceNavigation';

const AUCTION_WRITE_FIELDS = [
  'product',
  'starting_bid',
  'min_increment',
  'reserve_price',
  'start_time',
  'end_time',
] as const;

function formatCreatedAt(
  value: string | undefined,
): { iso: string; label: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), label: format(date, 'MMM d, yyyy') };
}

function CreateAuctionPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productHint = searchParams.get('product');
  const { mutate } = useSWRConfig();

  const {
    data: products,
    error: productsError,
    isLoading: productsLoading,
    mutate: mutateProducts,
  } = useSWR(MY_LISTINGS_API_PATH, myListingsFetcher);

  const {
    data: auctions,
    error: auctionsError,
    isLoading: auctionsLoading,
    mutate: mutateAuctions,
  } = useSWR(AUCTIONS_LIST_API_PATH, auctionListFetcher);

  const loading = productsLoading || auctionsLoading;
  const loadError = productsError || auctionsError;

  const eligible = useMemo(
    () =>
      sortSellerProducts(
        getEligibleAuctionProducts(products ?? [], auctions ?? []),
        'newest',
      ),
    [products, auctions],
  );

  const hintResult = useMemo(() => {
    if (loading || loadError) {
      return { productId: null as number | null, message: undefined as string | undefined };
    }
    return resolveAuctionCreateProductHint(productHint, eligible);
  }, [loading, loadError, productHint, eligible]);

  /** `undefined` = follow query hint; otherwise an explicit user/conflict choice. */
  const [selectedOverride, setSelectedOverride] = useState<
    number | null | undefined
  >(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<AuctionFormField, string>>
  >({});
  const [conflictMessage, setConflictMessage] = useState<string>();

  const selectedProductId =
    selectedOverride === undefined
      ? hintResult.productId
      : selectedOverride;

  const hintMessage =
    conflictMessage ??
    (selectedOverride === undefined ? hintResult.message : undefined);

  const selectedProduct: Product | null = useMemo(() => {
    if (selectedProductId == null) return null;
    return eligible.find((item) => item.id === selectedProductId) ?? null;
  }, [eligible, selectedProductId]);

  const handleRetry = () => {
    void mutateProducts();
    void mutateAuctions();
  };

  const handleSubmit = async (values: AuctionFormValues) => {
    if (submitting || selectedProductId == null) return;
    setSubmitting(true);
    setFormError(undefined);
    setFieldErrors({});
    setConflictMessage(undefined);

    try {
      const payload = buildExistingProductAuctionPayload(
        selectedProductId,
        values,
      );
      const created = await createAuction(payload);
      await Promise.all([
        mutate(AUCTIONS_LIST_API_PATH),
        mutate(MY_LISTINGS_API_PATH),
      ]);
      toast.success('Auction created.');
      if (created?.id != null) {
        router.push(sellerAuctionDetailPath(created.id));
      } else {
        router.push(SELLER_AUCTIONS_PATH);
      }
    } catch (error: unknown) {
      setFieldErrors(
        getApiFieldErrors(error, AUCTION_WRITE_FIELDS) as Partial<
          Record<AuctionFormField, string>
        >,
      );

      if (isAuctionProductConflictError(error)) {
        setFormError(
          'This product already has an auction. Choose another product.',
        );
        await Promise.all([mutateAuctions(), mutateProducts()]);
        setSelectedOverride(null);
        setConflictMessage(
          'That product is not available for a new auction. Choose another product.',
        );
      } else if (getApiStatus(error) === 403) {
        setFormError(
          getApiErrorMessage(
            error,
            'You are not allowed to create an auction.',
          ),
        );
      } else {
        setFormError(
          getApiErrorMessage(error, 'We could not create this auction.'),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const hasProducts = (products?.length ?? 0) > 0;
  const hasEligible = eligible.length > 0;

  return (
    <div className="space-y-8">
      <p>
        <Link
          href={SELLER_AUCTIONS_PATH}
          className="text-sm text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
        >
          ← Back to auctions
        </Link>
      </p>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Create Auction
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Attach bidding terms to a product you already own. The product itself
          is not changed.
        </p>
      </header>

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <p className="sr-only">Loading eligible products</p>
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
            />
          ))}
        </div>
      ) : null}

      {loadError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <p>We couldn&apos;t load products for auction creation.</p>
          <p className="mt-1 text-xs opacity-80">
            {getApiErrorMessage(loadError, 'Please try again in a moment.')}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-3 inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:border-red-800 dark:hover:bg-red-950"
          >
            Try Again
          </button>
        </div>
      ) : null}

      {!loading && !loadError && !hasProducts ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            You need a product before creating an auction.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            Create a catalog product first, then return here to start bidding.
          </p>
          <Link
            href={SELLER_PRODUCT_CREATE_PATH}
            className="mt-4 inline-flex rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            Create Product
          </Link>
        </section>
      ) : null}

      {!loading && !loadError && hasProducts && !hasEligible ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            All of your products already have auctions.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            Create another product before starting a new auction.
          </p>
          <Link
            href={SELLER_PRODUCT_CREATE_PATH}
            className="mt-4 inline-flex rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            Create Product
          </Link>
        </section>
      ) : null}

      {!loading && !loadError && hasEligible ? (
        <div className="space-y-8">
          {hintMessage ? (
            <p
              role="status"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              {hintMessage}
            </p>
          ) : null}

          <section aria-labelledby="product-picker-heading" className="space-y-3">
            <div>
              <h2
                id="product-picker-heading"
                className="text-lg font-semibold text-zinc-900 dark:text-white"
              >
                Choose a product
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Only products without an existing auction are listed.
              </p>
            </div>
            <fieldset>
              <legend className="sr-only">Eligible products</legend>
              <ul className="space-y-3">
                {eligible.map((product) => {
                  const created = formatCreatedAt(product.created_at);
                  const selected = selectedProductId === product.id;
                  return (
                    <li key={product.id}>
                      <label
                        className={`flex cursor-pointer gap-3 rounded-2xl border px-4 py-3 transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky-500 ${
                          selected
                            ? 'border-sky-700 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/40'
                            : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name="auction-product"
                          value={product.id}
                          checked={selected}
                          disabled={submitting}
                          onChange={() => {
                            setSelectedOverride(product.id);
                            setConflictMessage(undefined);
                          }}
                          className="mt-1"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-white">
                            {product.title.trim()
                              ? product.title
                              : 'Untitled product'}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                            <span>
                              Condition:{' '}
                              {formatSellerProductCondition(product.condition)}
                            </span>
                            <span>
                              Created:{' '}
                              {created ? (
                                <time dateTime={created.iso}>{created.label}</time>
                              ) : (
                                '—'
                              )}
                            </span>
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          </section>

          <section
            aria-labelledby="auction-config-heading"
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6"
          >
            <h2
              id="auction-config-heading"
              className="text-lg font-semibold text-zinc-900 dark:text-white"
            >
              Auction configuration
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Set bidding terms for the selected product.
            </p>
            <div className="mt-5">
              <AuctionForm
                selectedProduct={selectedProduct}
                initialValues={emptyAuctionFormValues()}
                submitting={submitting}
                submitLabel="Create Auction"
                submittingLabel="Creating auction…"
                formError={formError}
                fieldErrors={fieldErrors}
                onSubmit={(values) => void handleSubmit(values)}
              />
            </div>
            <p className="sr-only">Posts to {AUCTION_CREATE_API_PATH}</p>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default function SellerCreateAuctionPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <p className="sr-only">Loading create auction</p>
          <div className="h-10 w-1/2 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-40 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
        </div>
      }
    >
      <CreateAuctionPageContent />
    </Suspense>
  );
}
