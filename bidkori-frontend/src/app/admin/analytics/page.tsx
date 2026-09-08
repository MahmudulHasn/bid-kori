'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import { format } from 'date-fns';
import { Gavel, Layers, Percent, Receipt, Trophy, Wallet } from 'lucide-react';
import useSWR from 'swr';

import {
  ADMIN_ANALYTICS_API_PATH,
  ADMIN_ANALYTICS_PATH,
  ANALYTICS_ESCALATION_SAMPLE_HINT,
  ANALYTICS_PAGE_VOLUME_HINT,
  BIDDING_VOLUME_LABEL,
  getAdminAnalyticsSummary,
  mapAdminAnalyticsCategoryRows,
  mapAdminAnalyticsEscalationRows,
  mapAdminAnalyticsTopBidders,
} from '@/lib/adminAnalytics';
import { adminAnalyticsFetcher } from '@/lib/adminAnalyticsApi';
import {
  ADMIN_FINANCE_DISCLOSURE,
  ADMIN_FINANCE_SUMMARY_API_PATH,
  COMPLETED_CHECKOUT_VOLUME_LABEL,
  COMPLETED_SALES_COUNT_LABEL,
  PLATFORM_REVENUE_LABEL,
  SELLER_NET_TOTAL_LABEL,
  hasLegacyAdminPayments,
} from '@/lib/adminFinance';
import { adminFinancialSummaryFetcher } from '@/lib/adminFinanceApi';
import { formatAdminMoney } from '@/lib/adminDashboard';
import { adminAuctionDetailPath } from '@/lib/adminAuctions';
import { getApiErrorMessage } from '@/lib/apiErrors';

function MetricCard({
  label,
  value,
  hint,
  icon,
  loading,
}: {
  label: string;
  value: string | number | null;
  hint: string;
  icon: ReactNode;
  loading?: boolean;
}) {
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
          className="mt-3 h-9 w-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800"
          aria-hidden
        />
      ) : (
        <p
          className="mt-3 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-white"
          aria-label={`${label}: ${value ?? 'unavailable'}`}
        >
          {value ?? '—'}
        </p>
      )}
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
    </article>
  );
}

function formatBidTime(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, 'MMM d, yyyy, h:mm a');
}

export default function AdminAnalyticsPage() {
  const {
    data: analytics,
    error,
    isLoading,
    mutate,
  } = useSWR(ADMIN_ANALYTICS_API_PATH, adminAnalyticsFetcher);

  const {
    data: finance,
    error: financeError,
    isLoading: financeLoading,
    mutate: mutateFinance,
  } = useSWR(ADMIN_FINANCE_SUMMARY_API_PATH, adminFinancialSummaryFetcher);

  const summary = useMemo(
    () => (analytics ? getAdminAnalyticsSummary(analytics) : null),
    [analytics],
  );
  const categories = useMemo(
    () => mapAdminAnalyticsCategoryRows(analytics?.category_breakdown ?? []),
    [analytics],
  );
  const topBidders = useMemo(
    () => mapAdminAnalyticsTopBidders(analytics?.top_active_bidders ?? []),
    [analytics],
  );
  const escalation = useMemo(
    () =>
      mapAdminAnalyticsEscalationRows(analytics?.bid_escalation_history ?? []),
    [analytics],
  );

  const loading = isLoading && !analytics;
  const financeBusy = financeLoading && !finance;
  const errorMessage = error
    ? getApiErrorMessage(error, 'Could not load platform analytics.')
    : null;
  const financeErrorMessage = financeError
    ? getApiErrorMessage(financeError, 'Unable to load financial summary.')
    : null;
  const showFinanceLegacy = hasLegacyAdminPayments(finance ?? null);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Platform Analytics
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Staff-only auction and bidding metrics from the live analytics API,
          plus a separate mock-checkout financial summary. Bidding volume is not
          platform revenue.
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Source: <code>{ADMIN_ANALYTICS_API_PATH}</code> · Route:{' '}
          <code>{ADMIN_ANALYTICS_PATH}</code>
        </p>
      </header>

      {errorMessage ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={() => void mutate()}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-red-800 dark:hover:bg-red-900/40"
          >
            Retry analytics
          </button>
        </div>
      ) : null}

      <section aria-labelledby="analytics-summary-heading">
        <h2
          id="analytics-summary-heading"
          className="sr-only"
        >
          Summary metrics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Active Auctions"
            value={summary?.activeAuctions ?? null}
            hint="total_active_auctions"
            icon={<Gavel className="h-5 w-5" aria-hidden />}
            loading={loading}
          />
          <MetricCard
            label="Total Bids Placed"
            value={summary?.totalBidsPlaced ?? null}
            hint="total_bids_placed"
            icon={<Trophy className="h-5 w-5" aria-hidden />}
            loading={loading}
          />
          <MetricCard
            label={BIDDING_VOLUME_LABEL}
            value={
              summary ? formatAdminMoney(summary.biddingVolume) : null
            }
            hint={ANALYTICS_PAGE_VOLUME_HINT}
            icon={<Wallet className="h-5 w-5" aria-hidden />}
            loading={loading}
          />
          <MetricCard
            label="Categories Represented"
            value={summary?.categoriesRepresented ?? null}
            hint="From category_breakdown length"
            icon={<Layers className="h-5 w-5" aria-hidden />}
            loading={loading}
          />
        </div>
      </section>

      <section aria-labelledby="admin-finance-heading" className="space-y-4">
        <div>
          <h2
            id="admin-finance-heading"
            className="text-lg font-semibold text-zinc-900 dark:text-white"
          >
            Mock checkout financial summary
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Exact aggregates from <code>{ADMIN_FINANCE_SUMMARY_API_PATH}</code>.
            Distinct from {BIDDING_VOLUME_LABEL}. {ADMIN_FINANCE_DISCLOSURE}
          </p>
        </div>

        {financeErrorMessage ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <p>{financeErrorMessage}</p>
            <button
              type="button"
              onClick={() => void mutateFinance()}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-red-800 dark:hover:bg-red-900/40"
            >
              Retry financial summary
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={COMPLETED_SALES_COUNT_LABEL}
            value={finance?.completed_sales_count ?? null}
            hint="COMPLETED Payment rows"
            icon={<Receipt className="h-5 w-5" aria-hidden />}
            loading={financeBusy}
          />
          <MetricCard
            label={COMPLETED_CHECKOUT_VOLUME_LABEL}
            value={
              finance ? formatAdminMoney(finance.gross_paid_volume) : null
            }
            hint="Sum of Payment.amount (mock ledger)"
            icon={<Wallet className="h-5 w-5" aria-hidden />}
            loading={financeBusy}
          />
          <MetricCard
            label={PLATFORM_REVENUE_LABEL}
            value={
              finance ? formatAdminMoney(finance.platform_revenue) : null
            }
            hint="Sum of stored platform_fee snapshots"
            icon={<Percent className="h-5 w-5" aria-hidden />}
            loading={financeBusy}
          />
          <MetricCard
            label={SELLER_NET_TOTAL_LABEL}
            value={
              finance ? formatAdminMoney(finance.seller_net_total) : null
            }
            hint="Sum of seller_net_amount snapshots"
            icon={<Trophy className="h-5 w-5" aria-hidden />}
            loading={financeBusy}
          />
        </div>

        {showFinanceLegacy ? (
          <p
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
          >
            Legacy completed sales without fee snapshots:{' '}
            {finance?.legacy_completed_sales_count}. Legacy gross:{' '}
            <span className="font-medium tabular-nums">
              {finance ? formatAdminMoney(finance.legacy_gross_paid_volume) : '—'}
            </span>
            . Platform Revenue excludes those rows.
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="category-breakdown-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="category-breakdown-heading"
          className="text-base font-semibold text-zinc-900 dark:text-white"
        >
          Category Breakdown
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Average price growth is the average monetary difference between
          current highest bid and starting bid — not a percentage.
        </p>
        {loading ? (
          <div className="mt-4 h-40 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        ) : errorMessage ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Category analytics unavailable until analytics loads.
          </p>
        ) : categories.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No category analytics available.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
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
                    Avg Starting Price
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Avg Highest Bid
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Avg Price Growth
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
                    <td className="py-2 pr-3 tabular-nums text-zinc-900 dark:text-zinc-100">
                      {row.avgHighestBid}
                    </td>
                    <td className="py-2 tabular-nums text-zinc-900 dark:text-zinc-100">
                      {row.avgPriceGrowth}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        aria-labelledby="top-bidders-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="top-bidders-heading"
          className="text-base font-semibold text-zinc-900 dark:text-white"
        >
          Top Active Bidders
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Ranked by bid count from the analytics API. Names are text-only — no
          user management links.
        </p>
        {loading ? (
          <div className="mt-4 h-32 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        ) : errorMessage ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Bidder rankings unavailable until analytics loads.
          </p>
        ) : topBidders.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No bidder activity available.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Bidder
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Bid Count
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Total Bid Amount
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
        )}
      </section>

      <section
        aria-labelledby="escalation-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="escalation-heading"
          className="text-base font-semibold text-zinc-900 dark:text-white"
        >
          Recent Bid Escalation Activity
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {ANALYTICS_ESCALATION_SAMPLE_HINT}
        </p>
        {loading ? (
          <div className="mt-4 h-40 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        ) : errorMessage ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Bid escalation sample unavailable until analytics loads.
          </p>
        ) : escalation.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No recent bid escalation data.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
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
                {escalation.map((row) => (
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
                    <td className="py-2 pr-3 tabular-nums">
                      <Link
                        href={adminAuctionDetailPath(row.auctionId)}
                        className="font-medium text-violet-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300"
                      >
                        Auction #{row.auctionId}
                      </Link>
                    </td>
                    <td className="py-2 tabular-nums text-zinc-900 dark:text-zinc-100">
                      {row.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
