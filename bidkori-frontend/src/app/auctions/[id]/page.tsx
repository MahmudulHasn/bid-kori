'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, Gavel, ImageOff, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import useSWR from 'swr';

import { useAuth } from '@/context/AuthContext';
import { useAuctionRealtime } from '@/hooks/useAuctionRealtime';
import { useAuctionTimer } from '@/hooks/useAuctionTimer';
import api from '@/lib/api';
import { getApiStatus } from '@/lib/apiErrors';
import { isAuctionOwnedByUser } from '@/lib/auctionOwnership';
import {
  applyAuctionCancelledToAuction,
  applyAuctionClosedToAuction,
  applyBidAcceptedToAuction,
  type AuctionCancelledEvent,
  type AuctionClosedEvent,
  type BidAcceptedEvent,
} from '@/lib/auctionRealtime';
import { buildLoginHref } from '@/lib/authRouting';
import {
  formatAuctionMoney,
  getAuctionProduct,
  getAuctionTitle,
} from '@/lib/auctionDisplay';
import {
  formatAuctionDetailMoney,
  formatBidHistoryEmptyLabel,
  getAuctionCurrentBidAmount,
  getAuctionDisplayState,
  getAuctionDisplayStateLabel,
  getAuctionReservePresentation,
  getAuctionStartingBidAmount,
  getAuctionViewerBidState,
  getAuctionViewerBidStateLabel,
  getClosedNoWinnerLabel,
  getNextValidBidAmount,
  getPlaceBidErrorMessage,
  myHighestBidAmountForAuction,
  prependRealtimeBidToHistory,
  sortBidsNewestFirst,
} from '@/lib/auctionDetailUx';
import { remainingMsToCountdownParts } from '@/lib/auctionTime';
import {
  auctionBidHistoryFetcher,
  auctionDetailFetcher,
  buildAuctionBidHistoryApiPath,
  myBidsFetcher,
} from '@/lib/auctionsApi';
import { MY_BIDS_API_PATH } from '@/lib/buyer';
import { MARKETPLACE_ROUTES } from '@/lib/marketplace';
import { resolveMediaUrl } from '@/lib/media';
import { formatSellerProductCondition } from '@/lib/seller';
import { sellerAuctionDetailPath } from '@/lib/workspaceNavigation';
import type { UserBid } from '@/lib/types';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function displayStateBadgeClass(state: string): string {
  switch (state) {
    case 'LIVE':
      return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300';
    case 'UPCOMING':
      return 'bg-sky-500/15 text-sky-800 dark:text-sky-300';
    case 'FINALIZING':
      return 'bg-amber-500/15 text-amber-900 dark:text-amber-200';
    case 'CLOSED':
      return 'bg-zinc-500/15 text-zinc-800 dark:text-zinc-300';
    case 'CANCELLED':
      return 'bg-rose-500/15 text-rose-800 dark:text-rose-300';
    default:
      return 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300';
  }
}

export default function AuctionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const auctionId = params?.id;
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [bidAmount, setBidAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const {
    data: auction,
    error,
    isLoading,
    mutate,
  } = useSWR(
    auctionId ? `/auctions/${auctionId}/` : null,
    auctionDetailFetcher,
    { refreshInterval: 3000 },
  );

  const historyKey = auctionId
    ? buildAuctionBidHistoryApiPath(auctionId)
    : null;
  const {
    data: history,
    mutate: mutateHistory,
  } = useSWR<UserBid[]>(historyKey, auctionBidHistoryFetcher, {
    refreshInterval: 3000,
  });

  const { data: myBids, mutate: mutateMyBids } = useSWR(
    isAuthenticated && !authLoading ? MY_BIDS_API_PATH : null,
    myBidsFetcher,
    { refreshInterval: 5000 },
  );

  const handleBidAccepted = useCallback(
    (event: BidAcceptedEvent) => {
      if (!auctionId) return;
      void mutate(
        (current) => {
          const result = applyBidAcceptedToAuction(current, event, auctionId);
          if (result.revalidate) {
            queueMicrotask(() => {
              void mutate();
            });
          }
          return result.auction;
        },
        { revalidate: false },
      );
      void mutateHistory(
        (current) =>
          prependRealtimeBidToHistory(current, event.bid, auctionId),
        { revalidate: true },
      );
      if (isAuthenticated) {
        void mutateMyBids();
      }
    },
    [auctionId, mutate, mutateHistory, mutateMyBids, isAuthenticated],
  );

  const handleAuctionClosed = useCallback(
    (event: AuctionClosedEvent) => {
      if (!auctionId) return;
      void mutate(
        (current) => {
          const result = applyAuctionClosedToAuction(current, event, auctionId);
          if (result.revalidate) {
            queueMicrotask(() => {
              void mutate();
            });
          }
          return result.auction;
        },
        { revalidate: false },
      );
      void mutateHistory();
      if (isAuthenticated) {
        void mutateMyBids();
      }
    },
    [auctionId, mutate, mutateHistory, mutateMyBids, isAuthenticated],
  );

  const handleAuctionCancelled = useCallback(
    (event: AuctionCancelledEvent) => {
      if (!auctionId) return;
      void mutate(
        (current) => {
          const result = applyAuctionCancelledToAuction(
            current,
            event,
            auctionId,
          );
          if (result.revalidate) {
            queueMicrotask(() => {
              void mutate();
            });
          }
          return result.auction;
        },
        { revalidate: false },
      );
      void mutateHistory();
    },
    [auctionId, mutate, mutateHistory],
  );

  const handleRealtimeReconnect = useCallback(() => {
    void mutate();
    void mutateHistory();
    if (isAuthenticated) {
      void mutateMyBids();
    }
  }, [mutate, mutateHistory, mutateMyBids, isAuthenticated]);

  const { status: realtimeStatus } = useAuctionRealtime({
    auctionId,
    enabled: Boolean(auctionId),
    onBidAccepted: handleBidAccepted,
    onAuctionClosed: handleAuctionClosed,
    onAuctionCancelled: handleAuctionCancelled,
    onReconnect: handleRealtimeReconnect,
  });

  const timer = useAuctionTimer(auction?.end_time, auction?.server_time, {
    forceExpired:
      auction?.status === 'CLOSED' || auction?.status === 'CANCELLED',
    startTime: auction?.start_time,
  });

  const parsedServerMs = auction?.server_time
    ? Date.parse(auction.server_time)
    : Number.NaN;
  const nowMs =
    timer.estimatedNowMs ??
    (Number.isFinite(parsedServerMs) ? parsedServerMs : 0);

  const displayState = auction
    ? getAuctionDisplayState({
        status: auction.status,
        startTime: auction.start_time,
        endTime: auction.end_time,
        nowMs,
      })
    : null;

  const biddingUnavailable =
    !displayState ||
    displayState === 'UPCOMING' ||
    displayState === 'FINALIZING' ||
    displayState === 'CLOSED' ||
    displayState === 'CANCELLED';

  const isBackendClosed = auction?.status === 'CLOSED';
  const isBackendCancelled = auction?.status === 'CANCELLED';

  const winnerLabel = (() => {
    if (!isBackendClosed || isBackendCancelled) return null;
    const username = auction?.winning_bidder_username?.trim();
    if (username) return username;
    if (auction?.winning_bidder != null) {
      return `Bidder #${auction.winning_bidder}`;
    }
    return null;
  })();

  const isOwner = isAuctionOwnedByUser(auction, user);
  const showSellerWorkspaceLink = isOwner && !authLoading;

  const imageUrls = useMemo(() => {
    const urls = (auction?.images ?? [])
      .map((image) => resolveMediaUrl(image.image))
      .filter((url): url is string => Boolean(url));
    return urls;
  }, [auction?.images]);

  const activeImage = imageUrls[activeImageIndex] ?? imageUrls[0] ?? null;
  const startingBid = auction ? getAuctionStartingBidAmount(auction) : null;
  const currentBid = auction ? getAuctionCurrentBidAmount(auction) : null;
  const minIncrement = Number(auction?.min_increment ?? 0);
  const nextValid = auction ? getNextValidBidAmount(auction) : null;
  const suggestedBid =
    nextValid != null ? nextValid.toFixed(2) : '';

  const reservePresentation = auction
    ? getAuctionReservePresentation(auction)
    : { kind: 'none' as const };

  const myHighest = auctionId
    ? myHighestBidAmountForAuction(myBids, auctionId)
    : null;

  const viewerState =
    auction && displayState
      ? getAuctionViewerBidState({
          auction,
          isAuthenticated,
          isOwner,
          userId: user?.id,
          myHighestBidAmount: myHighest,
          displayState,
        })
      : 'anonymous';
  const viewerLabel = getAuctionViewerBidStateLabel(viewerState);

  const product = auction ? getAuctionProduct(auction) : null;
  const sortedHistory = useMemo(
    () => sortBidsNewestFirst(history ?? []),
    [history],
  );

  const startParts = remainingMsToCountdownParts(timer.startsInMs);

  useEffect(() => {
    if (displayState === 'FINALIZING' && auction?.status === 'ACTIVE') {
      const id = window.setTimeout(() => {
        void mutate();
      }, 1500);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [displayState, auction?.status, mutate]);

  const handlePlaceBid = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (authLoading) {
      toast.error('Checking your session… please try again in a moment.');
      return;
    }
    if (!isAuthenticated) {
      toast.error('Please log in to place a bid.');
      if (auctionId) {
        router.push(
          buildLoginHref(MARKETPLACE_ROUTES.auctionDetail(auctionId)),
        );
      }
      return;
    }
    if (isOwner) {
      toast.error('You cannot bid on your own auction.');
      return;
    }
    if (!auctionId || biddingUnavailable) {
      toast.error(
        displayState === 'UPCOMING'
          ? 'This auction has not started yet.'
          : displayState === 'FINALIZING'
            ? 'Finalizing auction… bidding is closed.'
            : auction?.status === 'CANCELLED'
              ? 'This auction was cancelled.'
              : 'This auction is closed.',
      );
      return;
    }

    const amount = Number(bidAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid bid amount.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/auctions/${auctionId}/place-bid/`, { amount });
      toast.success('Bid placed successfully.');
      setBidAmount('');
      await Promise.all([mutate(), mutateHistory(), mutateMyBids()]);
    } catch (err: unknown) {
      toast.error(getPlaceBidErrorMessage(err));
      if (getApiStatus(err) === 401 && auctionId) {
        router.push(
          buildLoginHref(MARKETPLACE_ROUTES.auctionDetail(auctionId)),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Loading auction…
        </p>
      </main>
    );
  }

  if (error || !auction || !displayState) {
    const status = getApiStatus(error);
    const notFound = status === 404 || (!auction && !error);
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {notFound
            ? 'Auction not found.'
            : 'Auction temporarily unavailable. Please try again.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {!notFound ? (
            <button
              type="button"
              onClick={() => void mutate()}
              className="text-sm font-medium text-amber-800 underline-offset-2 hover:underline dark:text-amber-300"
            >
              Retry
            </button>
          ) : null}
          <Link
            href={MARKETPLACE_ROUTES.auctions}
            className="text-sm text-amber-700 hover:underline dark:text-amber-300"
          >
            Back to auctions
          </Link>
        </div>
      </main>
    );
  }

  const countdownHeading =
    displayState === 'CANCELLED'
      ? 'Auction cancelled'
      : displayState === 'CLOSED'
        ? 'Auction ended'
        : displayState === 'FINALIZING'
          ? 'Finalizing auction…'
          : displayState === 'UPCOMING'
            ? 'Starts in'
            : 'Ending in';

  const countdownParts =
    displayState === 'UPCOMING'
      ? {
          days: startParts.days,
          hours: startParts.hours,
          minutes: startParts.minutes,
          seconds: startParts.seconds,
        }
      : displayState === 'LIVE'
        ? {
            days: timer.days,
            hours: timer.hours,
            minutes: timer.minutes,
            seconds: timer.seconds,
          }
        : { days: 0, hours: 0, minutes: 0, seconds: 0 };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-6">
        <Link
          href={MARKETPLACE_ROUTES.auctions}
          className="text-sm text-amber-700 hover:underline dark:text-amber-300"
        >
          ← Back to auctions
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
            {getAuctionTitle(auction)}
          </h1>
          <span
            className={[
              'inline-flex rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide',
              displayStateBadgeClass(displayState),
            ].join(' ')}
          >
            {getAuctionDisplayStateLabel(displayState)}
          </span>
        </div>
        {product?.description ? (
          <p className="mt-2 max-w-3xl text-zinc-600 dark:text-zinc-400">
            {product.description}
          </p>
        ) : null}
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          {product?.condition ? (
            <div>
              <dt className="inline text-zinc-500">Condition: </dt>
              <dd className="inline font-medium text-zinc-800 dark:text-zinc-200">
                {formatSellerProductCondition(product.condition)}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_0.9fr]">
        <section className="space-y-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
            {activeImage ? (
              <Image
                src={activeImage}
                alt={getAuctionTitle(auction)}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-400">
                <ImageOff className="h-8 w-8" aria-hidden />
                <span className="text-sm">No images uploaded</span>
              </div>
            )}
          </div>

          {imageUrls.length > 1 ? (
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
              {imageUrls.map((url, index) => (
                <button
                  key={url + index}
                  type="button"
                  onClick={() => setActiveImageIndex(index)}
                  aria-label={`Show gallery image ${index + 1}`}
                  className={[
                    'relative aspect-square overflow-hidden rounded-xl border',
                    index === activeImageIndex
                      ? 'border-amber-500 ring-2 ring-amber-500/40'
                      : 'border-zinc-200 dark:border-zinc-800',
                  ].join(' ')}
                >
                  <Image
                    src={url}
                    alt={`Gallery image ${index + 1}`}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          ) : null}

          <section
            aria-labelledby="auction-bid-history-heading"
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h2
              id="auction-bid-history-heading"
              className="text-base font-semibold text-zinc-900 dark:text-white"
            >
              Bid history
            </h2>
            {sortedHistory.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                {formatBidHistoryEmptyLabel()}
              </p>
            ) : (
              <ol className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
                {sortedHistory.map((bid) => (
                  <li
                    key={bid.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm"
                  >
                    <span className="font-medium text-zinc-900 dark:text-white">
                      {formatAuctionMoney(Number(bid.amount))}
                    </span>
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {bid.bidder_username?.trim() || 'Bidder'}
                    </span>
                    <time
                      className="w-full text-xs text-zinc-500 sm:w-auto"
                      dateTime={bid.timestamp}
                    >
                      {bid.timestamp
                        ? new Date(bid.timestamp).toLocaleString()
                        : '—'}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <Clock3 className="h-4 w-4" aria-hidden />
              <span>{countdownHeading}</span>
            </div>
            <div
              className="grid grid-cols-4 gap-2 text-center"
              aria-live="polite"
              aria-label={countdownHeading}
            >
              {[
                { label: 'Days', value: countdownParts.days },
                { label: 'Hours', value: countdownParts.hours },
                { label: 'Mins', value: countdownParts.minutes },
                { label: 'Secs', value: countdownParts.seconds },
              ].map((unit) => (
                <div
                  key={unit.label}
                  className="rounded-xl bg-zinc-50 px-2 py-3 dark:bg-zinc-900"
                >
                  <div className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-white">
                    {pad(unit.value)}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                    {unit.label}
                  </div>
                </div>
              ))}
            </div>
            {auction.start_time || auction.end_time ? (
              <dl className="mt-3 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                {auction.start_time ? (
                  <div className="flex justify-between gap-2">
                    <dt>Starts</dt>
                    <dd className="text-right text-zinc-700 dark:text-zinc-300">
                      {new Date(auction.start_time).toLocaleString()}
                    </dd>
                  </div>
                ) : null}
                {auction.end_time ? (
                  <div className="flex justify-between gap-2">
                    <dt>Ends</dt>
                    <dd className="text-right text-zinc-700 dark:text-zinc-300">
                      {new Date(auction.end_time).toLocaleString()}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {currentBid != null ? 'Current highest bid' : 'Starting bid'}
              </p>
              {realtimeStatus === 'connected' ? (
                <span
                  className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300"
                  title="WebSocket connected — live bid and close updates"
                >
                  Live updates
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-3xl font-semibold text-amber-700 dark:text-amber-300">
              {formatAuctionDetailMoney(
                currentBid != null ? currentBid : startingBid,
              )}
            </p>
            {currentBid != null && startingBid != null ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Starting bid: {formatAuctionDetailMoney(startingBid)}
              </p>
            ) : null}
            {currentBid == null ? (
              <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                No bids yet
              </p>
            ) : null}
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Minimum increment:{' '}
              <span className="font-semibold text-zinc-900 dark:text-white">
                {Number.isFinite(minIncrement) && minIncrement > 0
                  ? formatAuctionMoney(minIncrement)
                  : '—'}
              </span>
            </p>
            {nextValid != null && displayState === 'LIVE' ? (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Next valid bid:{' '}
                <span className="font-semibold text-zinc-900 dark:text-white">
                  {formatAuctionMoney(nextValid)}
                </span>
              </p>
            ) : null}
            {reservePresentation.kind !== 'none' &&
            reservePresentation.kind !== 'closed_unmet' ? (
              <p
                className="mt-2 text-sm font-medium text-zinc-800 dark:text-zinc-200"
                aria-live="polite"
              >
                {reservePresentation.label}
              </p>
            ) : null}
            {viewerLabel ? (
              <p
                className="mt-3 text-sm font-semibold text-zinc-900 dark:text-white"
                aria-live="polite"
              >
                {viewerLabel}
              </p>
            ) : null}
            {isBackendCancelled ? (
              <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                This auction was cancelled. No winner.
              </p>
            ) : null}
            {isBackendClosed ? (
              <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
                {winnerLabel ? (
                  <>
                    Winner:{' '}
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      {winnerLabel}
                    </span>
                  </>
                ) : (
                  <span className="font-medium">
                    {getClosedNoWinnerLabel(auction)}
                  </span>
                )}
              </p>
            ) : null}
            {displayState === 'FINALIZING' ? (
              <p className="mt-3 text-sm font-medium text-amber-800 dark:text-amber-200">
                Finalizing auction… bidding is closed.
              </p>
            ) : null}
            {displayState === 'UPCOMING' ? (
              <p className="mt-3 text-sm font-medium text-sky-800 dark:text-sky-200">
                Auction has not started yet.
              </p>
            ) : null}
          </div>

          {showSellerWorkspaceLink ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="mb-3 flex items-center gap-2">
                <Shield
                  className="h-4 w-4 text-amber-700 dark:text-amber-300"
                  aria-hidden
                />
                <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
                  Your listing
                </h2>
              </div>
              <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                Edit, upload images, cancel, or delete from your Seller
                workspace.
              </p>
              <Link
                href={sellerAuctionDetailPath(auction.id)}
                className="inline-flex rounded-lg border border-amber-600 px-4 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:text-amber-200 dark:hover:bg-amber-950/40"
              >
                Manage in Seller workspace
              </Link>
            </div>
          ) : null}

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-4 flex items-center gap-2">
              <Gavel
                className="h-4 w-4 text-amber-700 dark:text-amber-300"
                aria-hidden
              />
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
                Bid panel
              </h2>
            </div>

            {biddingUnavailable ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {displayState === 'UPCOMING'
                  ? 'Bidding opens when the auction starts.'
                  : displayState === 'FINALIZING'
                    ? 'Finalizing auction…'
                    : displayState === 'CANCELLED'
                      ? 'This auction was cancelled.'
                      : 'Bidding is closed for this auction.'}
              </p>
            ) : isOwner ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Sellers cannot bid on their own listings.
              </p>
            ) : (
              <form onSubmit={handlePlaceBid} className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Your bid amount
                  </span>
                  <input
                    type="number"
                    min={suggestedBid || undefined}
                    step="0.01"
                    required
                    inputMode="decimal"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder={suggestedBid}
                    disabled={submitting}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
                <button
                  type="submit"
                  disabled={submitting || authLoading || !isAuthenticated}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Placing bid…' : 'Place Bid'}
                </button>
                {!authLoading && !isAuthenticated ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    <Link
                      href={buildLoginHref(
                        auctionId
                          ? MARKETPLACE_ROUTES.auctionDetail(auctionId)
                          : MARKETPLACE_ROUTES.auctions,
                      )}
                      className="text-amber-700 hover:underline"
                    >
                      Log in
                    </Link>{' '}
                    to place a bid.
                  </p>
                ) : null}
              </form>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
