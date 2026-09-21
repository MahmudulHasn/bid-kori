'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, Gavel, ImageOff, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import useSWR from 'swr';

import { useAuth } from '@/context/AuthContext';
import AuctionStatusBadge from '@/components/auctions/AuctionStatusBadge';
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


export default function AuctionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const auctionId = params?.id;
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [bidAmount, setBidAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});

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
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-28 sm:px-6 sm:py-8">
      {/* Top Breadcrumb */}
      <div className="mb-5 flex items-center justify-between">
        <Link
          href={MARKETPLACE_ROUTES.auctions}
          className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 rounded"
        >
          ← Back to auctions
        </Link>
        <div className="flex items-center gap-2">
          <AuctionStatusBadge state={displayState} size="sm" />
          {realtimeStatus === 'connected' ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
              title="WebSocket connected — live bid and close updates"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Live Sync
            </span>
          ) : null}
        </div>
      </div>

      {/* Main Two-Column Marketplace Grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
        {/* LEFT COLUMN: Media Gallery + Details + Bid History */}
        <section className="space-y-6 lg:col-span-7">
          {/* Media Gallery */}
          <div className="space-y-3">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-zinc-200/90 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 shadow-2xs">
              {activeImage && !imageErrorMap[activeImage] ? (
                <Image
                  src={activeImage}
                  alt={getAuctionTitle(auction)}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  className="object-cover transition-transform duration-300"
                  onError={() =>
                    setImageErrorMap((prev) => ({
                      ...prev,
                      [activeImage]: true,
                    }))
                  }
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-400">
                  <ImageOff className="h-8 w-8" aria-hidden />
                  <span className="text-xs font-medium">No images uploaded</span>
                </div>
              )}
            </div>

            {/* Thumbnail Strip */}
            {imageUrls.length > 1 ? (
              <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
                {imageUrls.map((url, index) => (
                  <button
                    key={url + index}
                    type="button"
                    onClick={() => setActiveImageIndex(index)}
                    aria-label={`Show gallery image ${index + 1}`}
                    className={[
                      'relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border transition-all',
                      index === activeImageIndex
                        ? 'border-amber-500 ring-2 ring-amber-500/40'
                        : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700 opacity-70 hover:opacity-100',
                    ].join(' ')}
                  >
                    <Image
                      src={url}
                      alt={`Gallery image ${index + 1}`}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Product Overview & Structured Description */}
          <article className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">
              Product Overview & Details
            </h2>

            {/* Badges / Specifications row */}
            <dl className="mt-4 flex flex-wrap gap-2 text-xs">
              {product?.condition ? (
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2.5 py-1 font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  <span className="text-zinc-500 dark:text-zinc-400">Condition:</span>
                  <span className="font-semibold">
                    {formatSellerProductCondition(product.condition)}
                  </span>
                </div>
              ) : null}
              {auction.start_time ? (
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2.5 py-1 font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  <span className="text-zinc-500 dark:text-zinc-400">Listed:</span>
                  <span>{new Date(auction.start_time).toLocaleDateString()}</span>
                </div>
              ) : null}
            </dl>

            {/* Description Body */}
            {product?.description ? (
              <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <p className="whitespace-pre-line text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed font-normal">
                  {product.description}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-xs italic text-zinc-400">
                No description provided for this listing.
              </p>
            )}
          </article>

          {/* Live Bid History */}
          <section
            aria-labelledby="auction-bid-history-heading"
            className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60"
          >
            <div className="flex items-center justify-between">
              <h2
                id="auction-bid-history-heading"
                className="text-base font-bold text-zinc-900 dark:text-white"
              >
                Bid History
              </h2>
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                {sortedHistory.length} {sortedHistory.length === 1 ? 'bid' : 'bids'} placed
              </span>
            </div>

            {sortedHistory.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                {formatBidHistoryEmptyLabel()}
              </p>
            ) : (
              <ol className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
                {sortedHistory.map((bid, index) => (
                  <li
                    key={bid.id}
                    className={`flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm ${
                      index === 0 ? 'font-semibold' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {index === 0 && (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                          Leading
                        </span>
                      )}
                      <span className="text-zinc-900 dark:text-white font-bold tabular-nums">
                        {formatAuctionMoney(Number(bid.amount))}
                      </span>
                    </div>
                    <span className="text-zinc-600 dark:text-zinc-400 text-xs">
                      {bid.bidder_username?.trim() || 'Bidder'}
                    </span>
                    <time
                      className="w-full text-xs text-zinc-400 sm:w-auto"
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

        {/* RIGHT COLUMN: Sticky Bidding Panel + Countdown + Seller Info */}
        <aside className="space-y-5 lg:col-span-5 lg:sticky lg:top-20">
          {/* Title Header (for desktop & mobile) */}
          <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-2xl leading-snug">
              {getAuctionTitle(auction)}
            </h1>

            {/* Countdown Box */}
            <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
                  <span>{countdownHeading}</span>
                </span>
              </div>
              <div
                className="grid grid-cols-4 gap-2 text-center"
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
                    className="rounded-xl bg-zinc-50 px-2 py-2.5 dark:bg-zinc-800/80 border border-zinc-200/50 dark:border-zinc-700/50"
                  >
                    <div className="text-lg font-bold tabular-nums text-zinc-900 dark:text-white sm:text-xl">
                      {pad(unit.value)}
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {unit.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pricing & Bidding Panel */}
          <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {currentBid != null ? 'Current Highest Bid' : 'Starting Bid'}
              </p>
              {sortedHistory.length > 0 && (
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {sortedHistory.length} {sortedHistory.length === 1 ? 'bid' : 'bids'}
                </span>
              )}
            </div>

            <p className="mt-1.5 text-3xl font-extrabold tracking-tight tabular-nums text-amber-700 dark:text-amber-300 sm:text-4xl">
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
              <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                No bids placed yet. Be the first to bid!
              </p>
            ) : null}

            {/* Minimum increment & Next valid bid */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-800/60">
              <span className="text-zinc-600 dark:text-zinc-400">
                Min. Increment:{' '}
                <span className="font-semibold text-zinc-900 dark:text-white">
                  {Number.isFinite(minIncrement) && minIncrement > 0
                    ? formatAuctionMoney(minIncrement)
                    : '—'}
                </span>
              </span>
              {nextValid != null && displayState === 'LIVE' ? (
                <span className="text-zinc-600 dark:text-zinc-400">
                  Next Valid:{' '}
                  <span className="font-bold text-amber-700 dark:text-amber-400">
                    {formatAuctionMoney(nextValid)}
                  </span>
                </span>
              ) : null}
            </div>

            {reservePresentation.kind !== 'none' &&
            reservePresentation.kind !== 'closed_unmet' ? (
              <p
                className="mt-3 text-xs font-medium text-amber-800 dark:text-amber-300"
                aria-live="polite"
              >
                {reservePresentation.label}
              </p>
            ) : null}

            {viewerLabel ? (
              <div
                className="mt-3 rounded-xl bg-amber-500/10 p-2.5 text-xs font-semibold text-amber-800 dark:bg-amber-400/10 dark:text-amber-300 text-center"
                aria-live="polite"
              >
                {viewerLabel}
              </div>
            ) : null}

            {isBackendCancelled ? (
              <p className="mt-3 text-xs font-semibold text-rose-700 dark:text-rose-400">
                This auction was cancelled. No winner.
              </p>
            ) : null}

            {isBackendClosed ? (
              <p className="mt-3 text-xs text-zinc-700 dark:text-zinc-300">
                {winnerLabel ? (
                  <>
                    Winner:{' '}
                    <span className="font-bold text-zinc-900 dark:text-white">
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
              <p className="mt-3 text-xs font-medium text-amber-800 dark:text-amber-200">
                Finalizing auction… bidding is closed.
              </p>
            ) : null}

            {displayState === 'UPCOMING' ? (
              <p className="mt-3 text-xs font-medium text-sky-800 dark:text-sky-200">
                Auction has not started yet.
              </p>
            ) : null}

            {/* Bidding Form */}
            <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <div className="mb-3 flex items-center gap-2">
                <Gavel
                  className="h-4 w-4 text-amber-700 dark:text-amber-300"
                  aria-hidden
                />
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Place Your Bid
                </h2>
              </div>

              {biddingUnavailable ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {displayState === 'UPCOMING'
                    ? 'Bidding opens when the auction starts.'
                    : displayState === 'FINALIZING'
                      ? 'Finalizing auction…'
                      : displayState === 'CANCELLED'
                        ? 'This auction was cancelled.'
                        : 'Bidding is closed for this auction.'}
                </p>
              ) : isOwner ? (
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                  Sellers cannot bid on their own listings.
                </p>
              ) : (
                <form onSubmit={handlePlaceBid} className="space-y-4">
                  <div>
                    <label
                      htmlFor="bid-input-field"
                      className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                    >
                      Bid amount ($ USD)
                    </label>

                    {/* Quick increment buttons */}
                    {displayState === 'LIVE' && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-zinc-400">Quick add:</span>
                        {[10, 50, 100].map((inc) => {
                          const base = suggestedBid
                            ? Number(suggestedBid)
                            : currentBid != null
                            ? currentBid + minIncrement
                            : startingBid || 0;
                          return (
                            <button
                              key={inc}
                              type="button"
                              onClick={() => {
                                const cur = Number(bidAmount) || base;
                                setBidAmount((cur + inc).toFixed(2));
                              }}
                              className="inline-flex min-h-[28px] items-center rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 transition hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900 active:scale-95 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-amber-500"
                            >
                              +${inc}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="relative mt-2">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm font-bold text-zinc-400">
                        $
                      </span>
                      <input
                        id="bid-input-field"
                        name="bidAmount"
                        type="number"
                        min={suggestedBid || undefined}
                        step="0.01"
                        required
                        inputMode="decimal"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        placeholder={suggestedBid}
                        disabled={submitting}
                        className="min-h-[44px] w-full rounded-xl border border-zinc-300 bg-white pl-8 pr-4 py-2.5 text-base font-semibold text-zinc-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || authLoading || !isAuthenticated}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-3 text-sm font-bold text-white shadow-sm shadow-amber-600/20 transition hover:from-amber-500 hover:to-amber-400 active:scale-98 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? 'Placing bid…' : 'Place Bid'}
                  </button>

                  {!authLoading && !isAuthenticated ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
                      <Link
                        href={buildLoginHref(
                          auctionId
                            ? MARKETPLACE_ROUTES.auctionDetail(auctionId)
                            : MARKETPLACE_ROUTES.auctions,
                        )}
                        className="font-semibold text-amber-700 hover:underline dark:text-amber-400"
                      >
                        Sign in
                      </Link>{' '}
                      to place a competitive bid.
                    </p>
                  ) : null}
                </form>
              )}
            </div>
          </div>

          {/* Seller Listing Workspace Management Card (If Owner) */}
          {showSellerWorkspaceLink ? (
            <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="mb-2 flex items-center gap-2">
                <Shield
                  className="h-4 w-4 text-amber-700 dark:text-amber-300"
                  aria-hidden
                />
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Your Seller Listing
                </h2>
              </div>
              <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                You created this auction. Edit, upload photos, or manage bids from your dashboard.
              </p>
              <Link
                href={sellerAuctionDetailPath(auction.id)}
                className="inline-flex min-h-[38px] w-full items-center justify-center rounded-xl border border-amber-500/40 bg-amber-50/50 px-4 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-200 dark:hover:bg-amber-900/30"
              >
                Manage in Seller Workspace
              </Link>
            </div>
          ) : null}
        </aside>
      </div>

      {displayState === 'LIVE' && !biddingUnavailable && !isOwner ? (
        <aside
          aria-label="Quick mobile bid action"
          className="fixed bottom-14 left-0 right-0 z-30 border-t border-zinc-200 bg-white/95 p-3.5 backdrop-blur-md shadow-lg dark:border-zinc-800 dark:bg-zinc-950/95 md:hidden pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
        >
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {currentBid != null ? 'Current Bid' : 'Starting'}
              </div>
              <div className="text-lg font-extrabold text-amber-700 dark:text-amber-300">
                {formatAuctionDetailMoney(currentBid != null ? currentBid : startingBid)}
              </div>
            </div>
            <a
              href="#bid-input-field"
              onClick={(e) => {
                const el = document.getElementById('bid-input-field');
                if (el) {
                  e.preventDefault();
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.focus();
                }
              }}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-amber-600 px-5 text-sm font-bold text-white shadow-sm transition active:scale-95 hover:bg-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
            >
              Bid Now {nextValid ? `(${formatAuctionMoney(nextValid)})` : ''}
            </a>
          </div>
        </aside>
      ) : null}
    </main>
  );
}
