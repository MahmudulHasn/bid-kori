'use client';

import { useMemo, type ReactNode } from 'react';
import { format } from 'date-fns';
import { Gavel, Package, Store, Trophy } from 'lucide-react';
import useSWR from 'swr';

import { useAuth } from '@/context/AuthContext';
import {
  ADMIN_ANALYTICS_API_PATH,
  BIDDING_VOLUME_HINT,
  BIDDING_VOLUME_LABEL,
  adminAnalyticsFetcher,
} from '@/lib/adminAnalyticsApi';
import {
  buildAdminDashboardMetrics,
  formatAdminMoney,
  mapCategorySnapshot,
  mapRecentBidActivity,
  mapTopActiveBidders,
} from '@/lib/adminDashboard';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { AUCTIONS_LIST_API_PATH, auctionListFetcher } from '@/lib/auctionsApi';
import {
  PRODUCTS_COLLECTION_API_PATH,
  productListFetcher,
} from '@/lib/productsApi';

function MetricCard({
  label,
  value,
  hint,
  icon,
  loading,
  unavailable,
}: {
  label: string;
  value: string | number | null;
  hint: string;
  icon: ReactNode;
  loading?: boolean;
  unavailable?: boolean;
}) {
  const display =
    loading || unavailable || value === null ? (loading ? '…' : '—') : value;

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
        <span className="text-violet-700 dark:text-violet-300" aria-hidden>
          {icon}
        </span>
      </div>
      {loading ? (
        <div
          className="mt-3 h-9 w-20 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800"
          aria-hidden
        />
      ) : (
        <p
          className="mt-3 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-white"
          aria-label={`${label}: ${unavailable || value === null ? 'unavailable' : value}`}
        >
          {display}
        </p>
      )}
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
    </article>
  );
}

function SectionCard({
  title,
  children,
  error,
  loading,
  empty,
  emptyMessage,
}: {
  title: string;
  children: ReactNode;
  error?: string | null;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
        {title}
      </h2>
      {loading ? (
        <div
          className="mt-4 h-32 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"
          aria-busy="true"
        />
      ) : error ? (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : empty ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          {emptyMessage ?? 'Nothing to show yet.'}
        </p>
      ) : (
        <div className="mt-4">{children}</div>
      )}
    </section>
  );
}

function formatBidTime(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, 'MMM d, yyyy, h:mm a');
}

export default function AdminHomePage() {
  const { user } = useAuth();

  const {
    data: analytics,
    error: analyticsError,
    isLoading: analyticsLoading,
    mutate: mutateAnalytics,
  } = useSWR(ADMIN_ANALYTICS_API_PATH, adminAnalyticsFetcher);

  const {
    data: products,
    error: productsError,
    isLoading: productsLoading,
    mutate: mutateProducts,
  } = useSWR(PRODUCTS_COLLECTION_API_PATH, productListFetcher);

  const {
    data: auctions,
    error: auctionsError,
    isLoading: auctionsLoading,
    mutate: mutateAuctions,
  } = useSWR(AUCTIONS_LIST_API_PATH, auctionListFetcher);

  const catalogLoading = productsLoading || auctionsLoading;
  const catalogFailed = Boolean(productsError || auctionsError);
  const catalogReady = products != null && auctions != null;

  const metrics = useMemo(
    () =>
      buildAdminDashboardMetrics({
        analytics: analyticsError ? null : analytics,
        products: productsError ? null : products,
        auctions: auctionsError ? null : auctions,
      }),
    [analytics, analyticsError, products, productsError, auctions, auctionsError],
  );

  const categories = useMemo(
    () => mapCategorySnapshot(analytics?.category_breakdown ?? []),
    [analytics],
  );
  const topBidders = useMemo(
    () => mapTopActiveBidders(analytics?.top_active_bidders ?? []),
    [analytics],
  );
  const recentBids = useMemo(
    () => mapRecentBidActivity(analytics?.bid_escalation_history ?? []),
    [analytics],
  );

  const analyticsMessage = analyticsError
    ? getApiErrorMessage(analyticsError, 'Could not load platform analytics.')
    : null;
  const catalogMessage =
    productsError || auctionsError
      ? getApiErrorMessage(
          productsError ?? auctionsError,
          'Could not load product or auction catalogs.',
        )
      : null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          Admin Dashboard
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Welcome back, {user?.username ?? 'admin'}. Platform overview from live
          REST data (read-only).
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Catalog counts use unpaginated list APIs — suitable for MVP scale only.
        </p>
      </header>

      {(analyticsMessage || catalogMessage) && (
        <div className="space-y-2" role="status">
          {analyticsMessage ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              <p>{analyticsMessage}</p>
              <button
                type="button"
                onClick={() => void mutateAnalytics()}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-red-800 dark:hover:bg-red-900/40"
              >
                Retry analytics
              </button>
            </div>
          ) : null}
          {catalogMessage ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              <p>{catalogMessage}</p>
              <button
                type="button"
                onClick={() => {
                  void mutateProducts();
                  void mutateAuctions();
                }}
                className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-amber-800 dark:hover:bg-amber-900/40"
              >
                Retry catalogs
              </button>
            </div>
          ) : null}
        </div>
      )}

      <section aria-labelledby="admin-metrics-heading">
        <h2 id="admin-metrics-heading" className="sr-only">
          Platform metrics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Active Auctions"
            value={metrics.activeAuctions}
            hint="From staff analytics"
            icon={<Gavel className="h-5 w-5" aria-hidden />}
            loading={analyticsLoading && !analytics}
            unavailable={Boolean(analyticsError)}
          />
          <MetricCard
            label="Total Auctions"
            value={metrics.totalAuctions}
            hint="From auction catalog"
            icon={<Store className="h-5 w-5" aria-hidden />}
            loading={catalogLoading && !catalogReady}
            unavailable={catalogFailed}
          />
          <MetricCard
            label="Total Products"
            value={metrics.totalProducts}
            hint="From product catalog"
            icon={<Package className="h-5 w-5" aria-hidden />}
            loading={catalogLoading && !catalogReady}
            unavailable={catalogFailed}
          />
          <MetricCard
            label="Total Bids"
            value={metrics.totalBids}
            hint="From staff analytics"
            icon={<Trophy className="h-5 w-5" aria-hidden />}
            loading={analyticsLoading && !analytics}
            unavailable={Boolean(analyticsError)}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            label="Closed Auctions"
            value={metrics.closedAuctions}
            hint="status = CLOSED"
            icon={<Store className="h-5 w-5" aria-hidden />}
            loading={catalogLoading && !catalogReady}
            unavailable={catalogFailed}
          />
          <MetricCard
            label="Cancelled Auctions"
            value={metrics.cancelledAuctions}
            hint="status = CANCELLED"
            icon={<Store className="h-5 w-5" aria-hidden />}
            loading={catalogLoading && !catalogReady}
            unavailable={catalogFailed}
          />
          <MetricCard
            label="Paid Auctions"
            value={metrics.paidAuctions}
            hint="is_paid = true"
            icon={<Trophy className="h-5 w-5" aria-hidden />}
            loading={catalogLoading && !catalogReady}
            unavailable={catalogFailed}
          />
        </div>
      </section>

      <SectionCard
        title="Platform Activity"
        loading={analyticsLoading && !analytics}
        error={analyticsMessage}
      >
        <dl className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {BIDDING_VOLUME_LABEL}
            </dt>
            <dd className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white">
              {formatAdminMoney(metrics.biddingVolume)}
            </dd>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {BIDDING_VOLUME_HINT}
          </p>
        </dl>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Recent Bid Activity"
          loading={analyticsLoading && !analytics}
          error={analyticsMessage}
          empty={!analyticsMessage && recentBids.length === 0}
          emptyMessage="No recent bids in the analytics sample."
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    When
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Bidder
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Auction
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentBids.map((row) => (
                  <tr
                    key={row.bidId}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">
                      <time dateTime={row.timestamp}>
                        {formatBidTime(row.timestamp)}
                      </time>
                    </td>
                    <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-100">
                      {row.bidderUsername}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                      #{row.auctionId}
                    </td>
                    <td className="py-2 tabular-nums text-zinc-900 dark:text-zinc-100">
                      {row.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Sample from platform analytics (not a full bids console).
          </p>
        </SectionCard>

        <SectionCard
          title="Top Active Bidders"
          loading={analyticsLoading && !analytics}
          error={analyticsMessage}
          empty={!analyticsMessage && topBidders.length === 0}
          emptyMessage="No bidder activity to rank yet."
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Username
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Bids
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Total bid amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {topBidders.map((row) => (
                  <tr
                    key={row.username}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-100">
                      {row.username}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                      {row.bidCount}
                    </td>
                    <td className="py-2 tabular-nums text-zinc-900 dark:text-zinc-100">
                      {row.totalBidAmount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Category Snapshot"
        loading={analyticsLoading && !analytics}
        error={analyticsMessage}
        empty={!analyticsMessage && categories.length === 0}
        emptyMessage="No category breakdown available yet."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Category
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Auctions
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Avg starting price
                </th>
                <th scope="col" className="py-2 font-medium">
                  Avg highest bid
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((row) => (
                <tr
                  key={row.category}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-100">
                    {row.category}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                    {row.auctionCount}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-900 dark:text-zinc-100">
                    {row.avgStartingPrice}
                  </td>
                  <td className="py-2 tabular-nums text-zinc-900 dark:text-zinc-100">
                    {row.avgHighestBid}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
