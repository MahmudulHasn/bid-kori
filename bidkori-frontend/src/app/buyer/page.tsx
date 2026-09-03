'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import { ArrowRight, Gavel, Trophy, Wallet } from 'lucide-react';
import useSWR from 'swr';

import AuctionGrid from '@/components/marketplace/AuctionGrid';
import { AuctionGridSkeleton } from '@/components/marketplace/MarketplaceStates';
import { useAuth } from '@/context/AuthContext';
import { auctionListFetcher, myBidsFetcher } from '@/lib/auctionsApi';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  MY_BIDS_API_PATH,
  WON_AUCTION_PREVIEW_LIMIT,
  getBuyerDashboardMetrics,
  getBuyerWonAuctions,
  getRecentBuyerAuctions,
  indexAuctionsById,
} from '@/lib/buyer';
import { MARKETPLACE_ROUTES } from '@/lib/marketplace';

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
        <span className="text-amber-700 dark:text-amber-300" aria-hidden>
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
      <p className="sr-only">Loading your auction activity</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
          />
        ))}
      </div>
      <AuctionGridSkeleton count={4} />
    </div>
  );
}

export default function BuyerHomePage() {
  const { user } = useAuth();
  const userId = user?.id;

  const {
    data: myBids,
    error: bidsError,
    isLoading: bidsLoading,
    mutate: mutateBids,
  } = useSWR(MY_BIDS_API_PATH, myBidsFetcher);

  const {
    data: auctions,
    error: auctionsError,
    isLoading: auctionsLoading,
    mutate: mutateAuctions,
  } = useSWR('/auctions/', auctionListFetcher);

  const loading = bidsLoading || auctionsLoading;
  const error = bidsError || auctionsError;

  const auctionsById = useMemo(
    () => indexAuctionsById(auctions ?? []),
    [auctions],
  );

  const metrics = useMemo(() => {
    if (userId == null) {
      return { auctionsBidOn: 0, wonAuctions: 0, pendingCheckout: 0 };
    }
    return getBuyerDashboardMetrics(myBids ?? [], auctions ?? [], userId);
  }, [myBids, auctions, userId]);

  const recentAuctions = useMemo(
    () => getRecentBuyerAuctions(myBids ?? [], auctionsById),
    [myBids, auctionsById],
  );

  const wonPreview = useMemo(() => {
    if (userId == null) return [];
    return getBuyerWonAuctions(auctions ?? [], userId).slice(
      0,
      WON_AUCTION_PREVIEW_LIMIT,
    );
  }, [auctions, userId]);

  const handleRetry = () => {
    void mutateBids();
    void mutateAuctions();
  };

  const hasNoBids = !loading && !error && metrics.auctionsBidOn === 0;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Buyer Dashboard
        </h1>
        <p className="mt-3 text-base text-zinc-800 dark:text-zinc-200">
          Welcome back, {user?.username ?? 'buyer'}.
        </p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Track your bids and won auctions from here.
        </p>
        <Link
          href={MARKETPLACE_ROUTES.auctions}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
        >
          Browse Auctions
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </header>

      {loading ? <DashboardSkeleton /> : null}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <p>We couldn&apos;t load your auction activity.</p>
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

      {!loading && !error && hasNoBids ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            You haven&apos;t placed any bids yet.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            Explore active auctions and place your first bid.
          </p>
          <Link
            href={MARKETPLACE_ROUTES.auctions}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          >
            Browse Auctions
          </Link>
        </section>
      ) : null}

      {!loading && !error && !hasNoBids ? (
        <>
          <section aria-label="Buyer summary">
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCard
                label="Auctions Bid On"
                value={metrics.auctionsBidOn}
                hint="Distinct auctions from your bid history"
                icon={<Gavel className="h-4 w-4" />}
              />
              <MetricCard
                label="Won Auctions"
                value={metrics.wonAuctions}
                hint="Closed auctions you won"
                icon={<Trophy className="h-4 w-4" />}
              />
              <MetricCard
                label="Pending Checkout"
                value={metrics.pendingCheckout}
                hint="Won auctions not yet marked paid"
                icon={<Wallet className="h-4 w-4" />}
              />
            </div>
          </section>

          <section aria-labelledby="recent-bids-heading">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2
                  id="recent-bids-heading"
                  className="text-xl font-semibold text-zinc-900 dark:text-white"
                >
                  Recent bid activity
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Auctions you have participated in, newest first.
                </p>
              </div>
              <Link
                href="/buyer/my-bids"
                className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-300"
              >
                View my bids
              </Link>
            </div>
            {recentAuctions.length > 0 ? (
              <AuctionGrid auctions={recentAuctions} />
            ) : (
              <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                Your bids are recorded, but matching auction listings could not
                be joined yet.
              </p>
            )}
          </section>

          <section aria-labelledby="won-preview-heading">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2
                  id="won-preview-heading"
                  className="text-xl font-semibold text-zinc-900 dark:text-white"
                >
                  Won auctions
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Closed listings where you are the winning bidder.
                </p>
              </div>
              <span
                aria-disabled="true"
                title="Coming soon"
                className="cursor-not-allowed text-sm text-zinc-400 dark:text-zinc-500"
              >
                View all
                <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide">
                  Soon
                </span>
              </span>
            </div>
            {wonPreview.length > 0 ? (
              <AuctionGrid auctions={wonPreview} />
            ) : (
              <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No won auctions yet. Keep bidding on live listings.
              </p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
