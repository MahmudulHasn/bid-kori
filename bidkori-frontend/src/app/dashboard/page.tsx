'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CreditCard, Gavel, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import useSWR from 'swr';

import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import type { Auction, PaymentSummary, UserBid } from '@/lib/types';

const fetchAuctions = async (url: string) => {
  const { data } = await api.get<Auction[]>(url);
  return data;
};

const fetchBids = async (url: string) => {
  const { data } = await api.get<UserBid[]>(url);
  return data;
};

function getAuctionId(bid: UserBid): number | null {
  if (typeof bid.auction === 'number') return bid.auction;
  if (bid.auction && typeof bid.auction === 'object') return bid.auction.id;
  return null;
}

function formatMoney(value: string | number | undefined) {
  return `৳${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
  })}`;
}

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [payingId, setPayingId] = useState<number | null>(null);
  const [paidOverrides, setPaidOverrides] = useState<Record<number, string>>({});

  const {
    data: auctions,
    error: auctionsError,
    isLoading: auctionsLoading,
    mutate: mutateAuctions,
  } = useSWR(isAuthenticated ? '/auctions/' : null, fetchAuctions);

  const {
    data: myBids,
    error: bidsError,
    isLoading: bidsLoading,
  } = useSWR(isAuthenticated ? '/auctions/my-bids/' : null, fetchBids);

  const auctionById = useMemo(() => {
    const map = new Map<number, Auction>();
    for (const auction of auctions ?? []) {
      map.set(auction.id, auction);
    }
    return map;
  }, [auctions]);

  const activeBids = useMemo(() => {
    const seen = new Set<number>();
    const rows: Array<{ bid: UserBid; auction: Auction }> = [];

    for (const bid of myBids ?? []) {
      const auctionId = getAuctionId(bid);
      if (auctionId == null || seen.has(auctionId)) continue;
      const auction = auctionById.get(auctionId);
      if (!auction) continue;
      if (auction.status && auction.status !== 'ACTIVE') continue;
      seen.add(auctionId);
      rows.push({ bid, auction });
    }

    return rows;
  }, [myBids, auctionById]);

  const wonAuctions = useMemo(() => {
    if (!user) return [];
    return (auctions ?? []).filter(
      (auction) =>
        auction.status === 'CLOSED' && auction.winning_bidder === user.id,
    );
  }, [auctions, user]);

  const handlePayNow = async (auctionId: number) => {
    setPayingId(auctionId);
    try {
      const { data } = await api.post<PaymentSummary>(
        `/auctions/${auctionId}/checkout/`,
      );
      const txn = data.transaction_id || 'N/A';
      toast.success(`Payment successful. Transaction ID: ${txn}`);
      setPaidOverrides((prev) => ({ ...prev, [auctionId]: txn }));
      await mutateAuctions(
        (current) =>
          (current ?? []).map((auction) =>
            auction.id === auctionId ? { ...auction, is_paid: true } : auction,
          ),
        { revalidate: true },
      );
    } catch (error: unknown) {
      const response = (
        error as { response?: { status?: number; data?: Record<string, unknown> } }
      )?.response;
      const message =
        (typeof response?.data?.error === 'string' && response.data.error) ||
        (typeof response?.data?.detail === 'string' && response.data.detail) ||
        'Checkout failed. Please try again.';
      toast.error(String(message));
    } finally {
      setPayingId(null);
    }
  };

  if (authLoading) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-sm text-zinc-500">Loading dashboard…</p>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-sm text-zinc-500">
          Please{' '}
          <Link href="/auth/login" className="text-amber-700 hover:underline">
            log in
          </Link>{' '}
          to view your dashboard.
        </p>
      </main>
    );
  }

  const loading = auctionsLoading || bidsLoading;
  const errored = auctionsError || bidsError;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
          Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          Welcome, {user.username}
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Track your live bids and complete checkout for auctions you have won.
        </p>
      </div>

      {loading && (
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          Loading your auctions…
        </p>
      )}

      {errored && (
        <p className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          Could not load dashboard data. Confirm the API is running and you are
          authenticated.
        </p>
      )}

      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <Gavel className="h-5 w-5 text-amber-700 dark:text-amber-300" aria-hidden />
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
            Active Bids
          </h2>
        </div>

        {activeBids.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            You have no active bids right now.{' '}
            <Link href="/" className="text-amber-700 hover:underline">
              Browse auctions
            </Link>
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {activeBids.map(({ bid, auction }) => (
              <article
                key={`${auction.id}-${bid.id}`}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <Link
                  href={`/auctions/${auction.id}`}
                  className="text-lg font-semibold text-zinc-900 hover:text-amber-700 dark:text-white dark:hover:text-amber-300"
                >
                  {auction.product?.title ?? `Auction #${auction.id}`}
                </Link>
                <dl className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                  <div className="flex justify-between gap-3">
                    <dt>Your bid</dt>
                    <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                      {formatMoney(bid.amount)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Current high</dt>
                    <dd className="font-medium text-amber-700 dark:text-amber-300">
                      {formatMoney(auction.current_highest_bid)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Status</dt>
                    <dd>{auction.status ?? 'ACTIVE'}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-700 dark:text-amber-300" aria-hidden />
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
            Won Auctions
          </h2>
        </div>

        {wonAuctions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            No won auctions yet. Keep bidding!
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {wonAuctions.map((auction) => {
              const isPaid =
                Boolean(auction.is_paid) || Boolean(paidOverrides[auction.id]);
              const showPayNow =
                auction.status === 'CLOSED' && !isPaid;

              return (
                <article
                  key={auction.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <Link
                    href={`/auctions/${auction.id}`}
                    className="text-lg font-semibold text-zinc-900 hover:text-amber-700 dark:text-white dark:hover:text-amber-300"
                  >
                    {auction.product?.title ?? `Auction #${auction.id}`}
                  </Link>
                  <dl className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                    <div className="flex justify-between gap-3">
                      <dt>Winning amount</dt>
                      <dd className="font-medium text-amber-700 dark:text-amber-300">
                        {formatMoney(auction.current_highest_bid)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Payment</dt>
                      <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                        {isPaid ? 'Paid' : 'Unpaid'}
                      </dd>
                    </div>
                    {paidOverrides[auction.id] && (
                      <div className="flex justify-between gap-3">
                        <dt>Transaction</dt>
                        <dd className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
                          {paidOverrides[auction.id]}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {showPayNow ? (
                    <button
                      type="button"
                      onClick={() => handlePayNow(auction.id)}
                      disabled={payingId === auction.id}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <CreditCard className="h-4 w-4" aria-hidden />
                      {payingId === auction.id ? 'Processing…' : 'Pay Now'}
                    </button>
                  ) : (
                    isPaid && (
                      <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-center text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Paid
                      </p>
                    )
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
