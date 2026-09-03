'use client';

import Link from 'next/link';
import { format } from 'date-fns';

import { formatAuctionMoney, getAuctionTitle } from '@/lib/auctionDisplay';
import {
  getAuctionPaymentState,
  type AuctionPaymentState,
} from '@/lib/buyer';
import { MARKETPLACE_ROUTES } from '@/lib/marketplace';
import type { Auction } from '@/lib/types';

export type WonCheckoutUiStatus = 'idle' | 'submitting' | 'success' | 'error';

export type WonCheckoutUiState = {
  status: WonCheckoutUiStatus;
  message?: string;
  transactionId?: string;
};

function formatEndedAt(
  value: string | undefined,
): { iso: string; label: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), label: format(date, 'MMM d, yyyy, h:mm a') };
}

function paymentLabel(state: AuctionPaymentState): string {
  switch (state) {
    case 'paid':
      return 'Paid';
    case 'unpaid':
      return 'Awaiting Checkout';
    case 'unknown':
      return 'Status unavailable';
  }
}

function paymentClass(state: AuctionPaymentState): string {
  switch (state) {
    case 'paid':
      return 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
    case 'unpaid':
      return 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
    case 'unknown':
      return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
  }
}

export default function WonAuctionItem({
  auction,
  checkout,
  onCheckout,
}: {
  auction: Auction;
  checkout?: WonCheckoutUiState;
  onCheckout: (auctionId: number) => void;
}) {
  const title = getAuctionTitle(auction);
  const payment = getAuctionPaymentState(auction);
  const ended = formatEndedAt(auction.end_time);
  const submitting = checkout?.status === 'submitting';
  const showCheckout = payment !== 'paid';
  const finalAmount = Number(auction.current_highest_bid);

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
            <Link
              href={MARKETPLACE_ROUTES.auctionDetail(auction.id)}
              className="hover:text-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:hover:text-amber-300"
            >
              {title}
            </Link>
          </h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-zinc-500 dark:text-zinc-400">Winning bid</dt>
              <dd className="font-medium tabular-nums text-amber-700 dark:text-amber-300">
                {Number.isFinite(finalAmount)
                  ? formatAuctionMoney(finalAmount)
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-zinc-500 dark:text-zinc-400">Ended</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">
                {ended ? (
                  <time dateTime={ended.iso}>{ended.label}</time>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3 sm:col-span-2 sm:block">
              <dt className="text-zinc-500 dark:text-zinc-400">Payment status</dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${paymentClass(payment)}`}
                >
                  {paymentLabel(payment)}
                </span>
              </dd>
            </div>
          </dl>
          {checkout?.transactionId ? (
            <p className="mt-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
              Transaction {checkout.transactionId}
            </p>
          ) : null}
          {checkout?.status === 'error' && checkout.message ? (
            <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
              {checkout.message}
            </p>
          ) : null}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-52">
          {showCheckout ? (
            <button
              type="button"
              onClick={() => onCheckout(auction.id)}
              disabled={submitting}
              aria-busy={submitting}
              aria-label={`Complete mock checkout for ${title}`}
              className="inline-flex w-full items-center justify-center rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Completing checkout...' : 'Complete Checkout'}
            </button>
          ) : (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-sm font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              Paid
            </p>
          )}
          <Link
            href={MARKETPLACE_ROUTES.auctionDetail(auction.id)}
            className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            View Auction
          </Link>
        </div>
      </div>
    </article>
  );
}
