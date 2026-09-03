'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import { format } from 'date-fns';
import { Gavel, Package, Store, Trophy } from 'lucide-react';
import useSWR from 'swr';

import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatAuctionMoney, getAuctionTitle } from '@/lib/auctionDisplay';
import { AUCTIONS_LIST_API_PATH, auctionListFetcher } from '@/lib/auctionsApi';
import { MY_LISTINGS_API_PATH, myListingsFetcher } from '@/lib/productsApi';
import {
  getRecentSellerAuctions,
  getRecentSellerProducts,
  getSellerDashboardMetrics,
  getSellerAuctionDisplayStatus,
  formatSellerProductCondition,
} from '@/lib/seller';
import type { Auction, Product } from '@/lib/types';
import {
  SELLER_AUCTIONS_PATH,
  SELLER_AUCTION_CREATE_PATH,
  SELLER_PRODUCTS_PATH,
  SELLER_PRODUCT_CREATE_PATH,
  sellerAuctionDetailPath,
  sellerProductDetailPath,
} from '@/lib/workspaceNavigation';

function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
        <span className="text-sky-700 dark:text-sky-300" aria-hidden>
          {icon}
        </span>
      </div>
      <p
        className="mt-3 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-white"
        aria-label={`${label}: ${value}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading your seller activity</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
        <div className="h-48 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
      </div>
    </div>
  );
}

function formatCreatedAt(
  value: string | undefined,
): { iso: string; label: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), label: format(date, 'MMM d, yyyy') };
}

function formatEndedAt(
  value: string | undefined,
): { iso: string; label: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), label: format(date, 'MMM d, yyyy, h:mm a') };
}

function ProductPreview({ item }: { item: Product }) {
  const created = formatCreatedAt(item.created_at);
  const title = item.title.trim() ? item.title : 'Untitled product';
  return (
    <article className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
        <Link
          href={sellerProductDetailPath(item.id)}
          className="hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:hover:text-sky-300"
        >
          {title}
        </Link>
      </h3>
      <dl className="mt-2 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex justify-between gap-3">
          <dt>Condition</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {formatSellerProductCondition(item.condition)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Created</dt>
          <dd>
            {created ? <time dateTime={created.iso}>{created.label}</time> : '—'}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function AuctionPreview({ item }: { item: Auction }) {
  const ended = formatEndedAt(item.end_time);
  const statusLabel = getSellerAuctionDisplayStatus(item);
  const amount = Number(item.current_highest_bid);

  return (
    <article className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
        <Link
          href={sellerAuctionDetailPath(item.id)}
          className="hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:hover:text-sky-300"
        >
          {getAuctionTitle(item)}
        </Link>
      </h3>
      <dl className="mt-2 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex justify-between gap-3">
          <dt>Status</dt>
          <dd className="font-medium text-zinc-800 dark:text-zinc-200">{statusLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Current bid</dt>
          <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">
            {Number.isFinite(amount) ? formatAuctionMoney(amount) : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Ends</dt>
          <dd>
            {ended ? <time dateTime={ended.iso}>{ended.label}</time> : '—'}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function SellerHomePage() {
  const { user } = useAuth();
  const userId = user?.id;

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
  const error = productsError || auctionsError;

  const metrics = useMemo(() => {
    if (userId == null) {
      return { products: 0, auctions: 0, activeAuctions: 0, closedAuctions: 0 };
    }
    return getSellerDashboardMetrics(products ?? [], auctions ?? [], userId);
  }, [products, auctions, userId]);

  const recentProducts = useMemo(
    () => getRecentSellerProducts(products ?? []),
    [products],
  );

  const recentAuctions = useMemo(() => {
    if (userId == null) return [];
    return getRecentSellerAuctions(auctions ?? [], userId);
  }, [auctions, userId]);

  const handleRetry = () => {
    void mutateProducts();
    void mutateAuctions();
  };

  const isEmpty =
    !loading &&
    !error &&
    metrics.products === 0 &&
    metrics.auctions === 0;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Seller Dashboard
        </h1>
        <p className="mt-3 text-base text-zinc-800 dark:text-zinc-200">
          Welcome back, {user?.username ?? 'seller'}.
        </p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Track the products you own and the auctions you are running.
        </p>
      </header>

      {loading ? <DashboardSkeleton /> : null}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <p>We couldn&apos;t load your seller activity.</p>
          <p className="mt-1 text-xs opacity-80">
            {getApiErrorMessage(error, 'Please try again in a moment.')}
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

      {!loading && !error && isEmpty ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Your seller workspace is ready.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            Create a catalog product, then start an auction from a product you
            own.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={SELLER_PRODUCT_CREATE_PATH}
              className="inline-flex rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
            >
              Create Product
            </Link>
            <Link
              href={SELLER_AUCTION_CREATE_PATH}
              className="inline-flex rounded-lg border border-sky-700 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300 dark:hover:bg-sky-950"
            >
              Create Auction
            </Link>
            <Link
              href={SELLER_PRODUCTS_PATH}
              className="inline-flex text-sm font-medium text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
            >
              View all products
            </Link>
          </div>
        </section>
      ) : null}

      {!loading && !error && !isEmpty ? (
        <>
          <section aria-label="Seller summary">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="My Products"
                value={metrics.products}
                hint="Items from your product listings"
                icon={<Package className="h-4 w-4" />}
              />
              <MetricCard
                label="My Auctions"
                value={metrics.auctions}
                hint="Auctions linked to your products"
                icon={<Store className="h-4 w-4" />}
              />
              <MetricCard
                label="Active Auctions"
                value={metrics.activeAuctions}
                hint="Owned auctions with ACTIVE status"
                icon={<Gavel className="h-4 w-4" />}
              />
              <MetricCard
                label="Closed Auctions"
                value={metrics.closedAuctions}
                hint="Owned auctions with CLOSED status"
                icon={<Trophy className="h-4 w-4" />}
              />
            </div>
          </section>

          <div className="grid gap-8 lg:grid-cols-2">
            <section aria-labelledby="recent-products-heading">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2
                    id="recent-products-heading"
                    className="text-xl font-semibold text-zinc-900 dark:text-white"
                  >
                    Recent Products
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Catalog items you own. These are not auctions.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={SELLER_PRODUCT_CREATE_PATH}
                    className="text-sm font-medium text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
                  >
                    Create Product
                  </Link>
                  <Link
                    href={SELLER_PRODUCTS_PATH}
                    className="text-sm font-medium text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
                  >
                    View all products
                  </Link>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {recentProducts.length > 0 ? (
                  recentProducts.map((item) => (
                    <ProductPreview key={item.id} item={item} />
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    No products in your listings yet.
                  </p>
                )}
              </div>
            </section>

            <section aria-labelledby="recent-auctions-heading">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2
                    id="recent-auctions-heading"
                    className="text-xl font-semibold text-zinc-900 dark:text-white"
                  >
                    Recent Auctions
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Auctions running on products you own.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={SELLER_AUCTION_CREATE_PATH}
                    className="text-sm font-medium text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
                  >
                    Create Auction
                  </Link>
                  <Link
                    href={SELLER_AUCTIONS_PATH}
                    className="text-sm font-medium text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
                  >
                    View all auctions
                  </Link>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {recentAuctions.length > 0 ? (
                  recentAuctions.map((item) => (
                    <AuctionPreview key={item.id} item={item} />
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    No auctions on your products yet.
                  </p>
                )}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
