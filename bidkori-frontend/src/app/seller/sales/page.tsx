'use client';

import Link from 'next/link';
import { Suspense, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Banknote, Percent, Receipt, Wallet } from 'lucide-react';
import useSWR from 'swr';

import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatAdminMoney } from '@/lib/adminDashboard';
import {
  LEGACY_SALE_FEE_UNAVAILABLE,
  SELLER_EARNINGS_API_PATH,
  SELLER_FINANCE_DISCLOSURE,
  SELLER_LEGACY_FEE_NOTE,
  SELLER_SALES_PATH,
  buildSellerSalesApiPath,
  formatFeeRateDisplay,
  hasLegacySellerSales,
  isLegacySaleRow,
  parseSellerSalesPageParam,
  sellerSalesHasNextPage,
  sellerSalesHasPreviousPage,
} from '@/lib/sellerFinance';
import {
  sellerEarningsFetcher,
  sellerSalesFetcher,
} from '@/lib/sellerFinanceApi';
import { sellerAuctionDetailPath } from '@/lib/workspaceNavigation';

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
        <span className="text-sky-700 dark:text-sky-300" aria-hidden>
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

function formatSaleDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, 'MMM d, yyyy, h:mm a');
}

function SellerSalesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = parseSellerSalesPageParam(searchParams.get('page'));
  const salesKey = buildSellerSalesApiPath(page);

  const {
    data: earnings,
    error: earningsError,
    isLoading: earningsLoading,
    mutate: mutateEarnings,
  } = useSWR(SELLER_EARNINGS_API_PATH, sellerEarningsFetcher);

  const {
    data: sales,
    error: salesError,
    isLoading: salesLoading,
    mutate: mutateSales,
  } = useSWR(salesKey, sellerSalesFetcher);

  const earningsBusy = earningsLoading && !earnings;
  const salesBusy = salesLoading && !sales;
  const earningsErrorMessage = earningsError
    ? getApiErrorMessage(earningsError, 'Unable to load earnings.')
    : null;
  const salesErrorMessage = salesError
    ? getApiErrorMessage(salesError, 'Unable to load sales.')
    : null;

  const rows = sales?.results ?? [];
  const empty = !salesBusy && !salesErrorMessage && (sales?.count ?? 0) === 0;
  const showLegacy = hasLegacySellerSales(earnings ?? null);

  const pageLabel = useMemo(() => {
    if (!sales) return null;
    return `Page ${page} · ${sales.count} sale${sales.count === 1 ? '' : 's'}`;
  }, [page, sales]);

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) params.delete('page');
    else params.set('page', String(nextPage));
    const query = params.toString();
    router.push(query ? `${SELLER_SALES_PATH}?${query}` : SELLER_SALES_PATH);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Sales
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Completed mock checkout ledger for your auctions. Gross is the winning
          amount; platform fee is the seller-side commission; net is accounting
          proceeds — not a payout balance.
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          {SELLER_FINANCE_DISCLOSURE}
        </p>
      </header>

      {earningsErrorMessage ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <p>{earningsErrorMessage}</p>
          <button
            type="button"
            onClick={() => void mutateEarnings()}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-red-800 dark:hover:bg-red-900/40"
          >
            Retry earnings
          </button>
        </div>
      ) : null}

      <section aria-labelledby="seller-earnings-heading">
        <h2 id="seller-earnings-heading" className="sr-only">
          Earnings summary
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Completed Sales"
            value={earnings?.completed_sales_count ?? null}
            hint="COMPLETED mock checkouts"
            icon={<Receipt className="h-5 w-5" aria-hidden />}
            loading={earningsBusy}
          />
          <MetricCard
            label="Gross Sales"
            value={
              earnings ? formatAdminMoney(earnings.gross_sales) : null
            }
            hint="Sum of winning amounts"
            icon={<Banknote className="h-5 w-5" aria-hidden />}
            loading={earningsBusy}
          />
          <MetricCard
            label="Platform Fees"
            value={
              earnings ? formatAdminMoney(earnings.platform_fees) : null
            }
            hint="Accounted fee snapshots only"
            icon={<Percent className="h-5 w-5" aria-hidden />}
            loading={earningsBusy}
          />
          <MetricCard
            label="Net Earnings"
            value={
              earnings ? formatAdminMoney(earnings.net_earnings) : null
            }
            hint="Accounting net — not withdrawn"
            icon={<Wallet className="h-5 w-5" aria-hidden />}
            loading={earningsBusy}
          />
        </div>
      </section>

      {showLegacy ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
        >
          {SELLER_LEGACY_FEE_NOTE}
          {earnings ? (
            <>
              {' '}
              Legacy gross:{' '}
              <span className="font-medium tabular-nums">
                {formatAdminMoney(earnings.legacy_gross_sales)}
              </span>{' '}
              ({earnings.legacy_completed_sales_count} sale
              {earnings.legacy_completed_sales_count === 1 ? '' : 's'}).
            </>
          ) : null}
        </p>
      ) : null}

      {salesErrorMessage ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <p>{salesErrorMessage}</p>
          <button
            type="button"
            onClick={() => void mutateSales()}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-red-800 dark:hover:bg-red-900/40"
          >
            Retry sales
          </button>
        </div>
      ) : null}

      <section
        aria-labelledby="seller-sales-ledger-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="seller-sales-ledger-heading"
              className="text-lg font-semibold text-zinc-900 dark:text-white"
            >
              Completed sales
            </h2>
            {pageLabel ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {pageLabel}
              </p>
            ) : null}
          </div>
        </div>

        {salesBusy ? (
          <div
            className="h-40 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"
            aria-busy="true"
          />
        ) : empty ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No completed sales yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <tr>
                  <th className="px-2 py-2 font-medium">Auction</th>
                  <th className="px-2 py-2 font-medium">Buyer</th>
                  <th className="px-2 py-2 font-medium">Gross</th>
                  <th className="px-2 py-2 font-medium">Fee rate</th>
                  <th className="px-2 py-2 font-medium">Platform fee</th>
                  <th className="px-2 py-2 font-medium">Net</th>
                  <th className="px-2 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.map((row) => {
                  const legacy = isLegacySaleRow(row);
                  return (
                    <tr key={row.payment_id}>
                      <td className="px-2 py-3">
                        <Link
                          href={sellerAuctionDetailPath(row.auction_id)}
                          className="font-medium text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
                        >
                          {row.auction_title}
                        </Link>
                      </td>
                      <td className="px-2 py-3 text-zinc-700 dark:text-zinc-300">
                        {row.buyer_username}
                      </td>
                      <td className="px-2 py-3 tabular-nums text-zinc-900 dark:text-white">
                        {formatAdminMoney(row.amount)}
                      </td>
                      <td
                        className="px-2 py-3 tabular-nums text-zinc-700 dark:text-zinc-300"
                        title={legacy ? LEGACY_SALE_FEE_UNAVAILABLE : undefined}
                      >
                        {legacy ? '—' : formatFeeRateDisplay(row.fee_rate)}
                      </td>
                      <td
                        className="px-2 py-3 tabular-nums text-zinc-700 dark:text-zinc-300"
                        title={legacy ? LEGACY_SALE_FEE_UNAVAILABLE : undefined}
                      >
                        {legacy
                          ? '—'
                          : formatAdminMoney(row.platform_fee)}
                      </td>
                      <td
                        className="px-2 py-3 tabular-nums text-zinc-900 dark:text-white"
                        title={legacy ? LEGACY_SALE_FEE_UNAVAILABLE : undefined}
                      >
                        {legacy
                          ? '—'
                          : formatAdminMoney(row.seller_net_amount)}
                      </td>
                      <td className="px-2 py-3 text-zinc-500 dark:text-zinc-400">
                        {formatSaleDate(row.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {sales && (sellerSalesHasPreviousPage(sales) || sellerSalesHasNextPage(sales)) ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={!sellerSalesHasPreviousPage(sales)}
              onClick={() => goToPage(page - 1)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 enabled:hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:enabled:hover:bg-zinc-800"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!sellerSalesHasNextPage(sales)}
              onClick={() => goToPage(page + 1)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 enabled:hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:enabled:hover:bg-zinc-800"
            >
              Next
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Fallback() {
  return (
    <p className="text-sm text-zinc-500 dark:text-zinc-400" role="status">
      Loading sales…
    </p>
  );
}

export default function SellerSalesPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <SellerSalesContent />
    </Suspense>
  );
}
