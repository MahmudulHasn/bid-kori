'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useSWR from 'swr';

import WonAuctionItem, {
  type WonCheckoutUiState,
} from '@/components/buyer/WonAuctionItem';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage, getApiStatus } from '@/lib/apiErrors';
import {
  AUCTIONS_LIST_API_PATH,
  auctionListFetcher,
  checkoutAuction,
  isCheckoutAlreadyPaidError,
} from '@/lib/auctionsApi';
import {
  getBuyerWonAuctions,
  matchesBuyerWonFilter,
  withAuctionMarkedPaid,
  type BuyerWonFilter,
} from '@/lib/buyer';
import { MARKETPLACE_ROUTES } from '@/lib/marketplace';

const FILTERS: { id: BuyerWonFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'awaiting_checkout', label: 'Awaiting Checkout' },
  { id: 'paid', label: 'Paid' },
];

export default function BuyerWonAuctionsPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const [filter, setFilter] = useState<BuyerWonFilter>('all');
  const [checkoutById, setCheckoutById] = useState<
    Record<number, WonCheckoutUiState>
  >({});

  const {
    data: auctions,
    error,
    isLoading,
    mutate,
  } = useSWR(AUCTIONS_LIST_API_PATH, auctionListFetcher);

  const wonAuctions = useMemo(() => {
    if (userId == null) return [];
    return getBuyerWonAuctions(auctions ?? [], userId);
  }, [auctions, userId]);

  const visible = useMemo(
    () => wonAuctions.filter((auction) => matchesBuyerWonFilter(auction, filter)),
    [wonAuctions, filter],
  );

  const awaitingCount = useMemo(
    () =>
      wonAuctions.filter((auction) =>
        matchesBuyerWonFilter(auction, 'awaiting_checkout'),
      ).length,
    [wonAuctions],
  );
  const paidCount = useMemo(
    () =>
      wonAuctions.filter((auction) => matchesBuyerWonFilter(auction, 'paid'))
        .length,
    [wonAuctions],
  );

  const handleRetry = () => {
    void mutate();
  };

  const handleCheckout = async (auctionId: number) => {
    setCheckoutById((current) => ({
      ...current,
      [auctionId]: { status: 'submitting' },
    }));

    try {
      const payment = await checkoutAuction(auctionId);
      const transactionId = payment.transaction_id || undefined;
      toast.success(
        transactionId
          ? `Checkout complete (mock). Transaction ${transactionId}`
          : 'Checkout complete (mock).',
      );
      setCheckoutById((current) => ({
        ...current,
        [auctionId]: { status: 'success', transactionId },
      }));
      await mutate(
        (current) => withAuctionMarkedPaid(current ?? [], auctionId),
        { revalidate: true },
      );
    } catch (checkoutError: unknown) {
      const message = getApiErrorMessage(
        checkoutError,
        'Checkout failed. Please try again.',
      );
      const status = getApiStatus(checkoutError);

      if (isCheckoutAlreadyPaidError(checkoutError)) {
        toast.success('This auction has already been paid.');
        setCheckoutById((current) => ({
          ...current,
          [auctionId]: { status: 'success' },
        }));
        await mutate(
          (current) => withAuctionMarkedPaid(current ?? [], auctionId),
          { revalidate: true },
        );
        return;
      }

      if (status === 401) {
        toast.error('Please log in again to complete checkout.');
      } else {
        toast.error(message);
      }

      setCheckoutById((current) => ({
        ...current,
        [auctionId]: { status: 'error', message },
      }));
      await mutate();
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Won Auctions
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Closed auctions where you are the winning bidder. Checkout here is a
          development mock — no real payment is processed.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <p className="sr-only">Loading your won auctions</p>
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-40 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <p>We couldn&apos;t load your won auctions.</p>
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

      {!isLoading && !error && wonAuctions.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            No won auctions yet.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            Keep bidding — your next win could be waiting.
          </p>
          <Link
            href={MARKETPLACE_ROUTES.auctions}
            className="mt-5 inline-flex rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          >
            Browse Auctions
          </Link>
        </section>
      ) : null}

      {!isLoading && !error && wonAuctions.length > 0 ? (
        <>
          <div
            role="tablist"
            aria-label="Filter won auctions"
            className="flex flex-wrap gap-2"
          >
            {FILTERS.map((item) => {
              const selected = filter === item.id;
              const count =
                item.id === 'all'
                  ? wonAuctions.length
                  : item.id === 'awaiting_checkout'
                    ? awaitingCount
                    : paidCount;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setFilter(item.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ${
                    selected
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                  }`}
                >
                  {item.label}
                  <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              No won auctions match this filter.
            </p>
          ) : (
            <ul className="space-y-4">
              {visible.map((auction) => (
                <li key={auction.id}>
                  <WonAuctionItem
                    auction={auction}
                    checkout={checkoutById[auction.id]}
                    onCheckout={handleCheckout}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
