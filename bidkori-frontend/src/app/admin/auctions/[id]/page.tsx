'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import useSWR from 'swr';
import type { ReactNode } from 'react';

import { getApiErrorMessage, getApiStatus } from '@/lib/apiErrors';
import {
  ADMIN_AUCTIONS_PATH,
  ADMIN_AUCTION_READONLY_COPY,
  buildAuctionBidHistoryApiPath,
  formatAdminAuctionFeaturedState,
  formatAdminAuctionPaidState,
  formatAdminAuctionStatusLabel,
  getAdminAuctionProductId,
  getAdminAuctionSellerLabel,
  getAdminAuctionTitle,
  getAdminWinnerDisplay,
  mapAdminBidHistory,
} from '@/lib/adminAuctions';
import { adminBidsPath } from '@/lib/adminBids';
import { adminProductDetailPath } from '@/lib/adminProducts';
import { formatAuctionMoney } from '@/lib/auctionDisplay';
import {
  auctionBidHistoryFetcher,
  auctionDetailFetcher,
  buildAuctionDetailApiPath,
} from '@/lib/auctionsApi';
import { resolveMediaUrl } from '@/lib/media';
import type { Auction } from '@/lib/types';

function formatTimestamp(
  value: string | undefined,
): { iso: string; label: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    iso: date.toISOString(),
    label: format(date, 'MMM d, yyyy, h:mm a'),
  };
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="text-sm font-medium text-zinc-900 dark:text-white">
        {children}
      </dd>
    </div>
  );
}

function money(value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return formatAuctionMoney(n);
}

function AuctionDetailBody({ auction }: { auction: Auction }) {
  const title = getAdminAuctionTitle(auction);
  const productId = getAdminAuctionProductId(auction);
  const start = formatTimestamp(auction.start_time);
  const end = formatTimestamp(auction.end_time);
  const winner = getAdminWinnerDisplay(auction);
  const historyKey = buildAuctionBidHistoryApiPath(auction.id);

  const {
    data: bids,
    error: historyError,
    isLoading: historyLoading,
    mutate: mutateHistory,
  } = useSWR(historyKey, auctionBidHistoryFetcher);

  const historyRows = mapAdminBidHistory(bids ?? []);
  const imageUrls = (auction.images ?? [])
    .map((image) => resolveMediaUrl(image.image))
    .filter((url): url is string => Boolean(url));

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          <Link
            href={ADMIN_AUCTIONS_PATH}
            className="font-medium text-violet-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300"
          >
            ← Auctions
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Read-only auction record from the platform catalog.
        </p>
        {productId != null ? (
          <p className="mt-3">
            <Link
              href={adminProductDetailPath(productId)}
              className="inline-flex text-sm font-semibold text-violet-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300"
            >
              View Product #{productId}
            </Link>
          </p>
        ) : null}
      </header>

      <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        {ADMIN_AUCTION_READONLY_COPY}
      </p>

      <section
        aria-labelledby="auction-details-heading"
        className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 shadow-sm sm:px-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="auction-details-heading"
          className="pt-3 text-base font-semibold text-zinc-900 dark:text-white"
        >
          Auction Details
        </h2>
        <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
          <DetailRow label="Auction ID">#{auction.id}</DetailRow>
          <DetailRow label="Product">{title}</DetailRow>
          <DetailRow label="Seller">
            {getAdminAuctionSellerLabel(auction)}
          </DetailRow>
          <DetailRow label="Status">
            {formatAdminAuctionStatusLabel(auction.status)}
          </DetailRow>
          <DetailRow label="Starting Bid">
            {money(auction.starting_bid)}
          </DetailRow>
          <DetailRow label="Current Highest Bid">
            {money(auction.current_highest_bid)}
          </DetailRow>
          <DetailRow label="Minimum Increment">
            {money(auction.min_increment)}
          </DetailRow>
          <DetailRow label="Start Time">
            {start ? <time dateTime={start.iso}>{start.label}</time> : '—'}
          </DetailRow>
          <DetailRow label="End Time">
            {end ? <time dateTime={end.iso}>{end.label}</time> : '—'}
          </DetailRow>
          <DetailRow label="Paid">
            {formatAdminAuctionPaidState(auction.is_paid)}
          </DetailRow>
          <DetailRow label="Featured">
            {formatAdminAuctionFeaturedState(auction.is_featured)}
          </DetailRow>
          {winner.kind === 'no_winner' ? (
            <DetailRow label="Winning Bidder">{winner.label}</DetailRow>
          ) : null}
          {winner.kind === 'winner' ? (
            <DetailRow label="Winning Bidder">{winner.label}</DetailRow>
          ) : null}
        </dl>
      </section>

      <section
        aria-labelledby="auction-images-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="auction-images-heading"
          className="text-base font-semibold text-zinc-900 dark:text-white"
        >
          Images
        </h2>
        {imageUrls.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No images for this auction.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {imageUrls.map((url, index) => (
              <li
                key={`${url}-${index}`}
                className="relative aspect-square overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <Image
                  src={url}
                  alt={`${title} image ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, 25vw"
                  unoptimized
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="bid-history-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="bid-history-heading"
          className="text-base font-semibold text-zinc-900 dark:text-white"
        >
          Bid History
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Auction-specific visibility only — not a full Admin Bids console.
        </p>
        <p className="mt-2">
          <Link
            href={adminBidsPath(auction.id)}
            className="text-sm font-medium text-violet-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-violet-300"
          >
            View bid activity
          </Link>
        </p>

        {historyLoading ? (
          <div
            className="mt-4 h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"
            aria-busy="true"
          />
        ) : null}

        {historyError ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
          >
            <p>
              {getApiErrorMessage(
                historyError,
                'Could not load bid history for this auction.',
              )}
            </p>
            <button
              type="button"
              onClick={() => void mutateHistory()}
              className="mt-2 inline-flex rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-amber-800 dark:hover:bg-amber-900/40"
            >
              Retry history
            </button>
          </div>
        ) : null}

        {!historyLoading && !historyError && historyRows.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            No bids placed on this auction yet.
          </p>
        ) : null}

        {!historyLoading && !historyError && historyRows.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Bidder
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Amount
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    When
                  </th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => {
                  const when = formatTimestamp(row.timestamp);
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-100">
                        {row.bidderUsername}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-zinc-900 dark:text-zinc-100">
                        {row.amount}
                      </td>
                      <td className="py-2 text-zinc-600 dark:text-zinc-400">
                        {when ? (
                          <time dateTime={when.iso}>{when.label}</time>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function AdminAuctionDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const detailKey =
    id != null && String(id).trim() !== ''
      ? buildAuctionDetailApiPath(id)
      : null;

  const { data: auction, error, isLoading, mutate } = useSWR(
    detailKey,
    auctionDetailFetcher,
  );

  if (!detailKey) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">
          Auction not found
        </h1>
        <Link
          href={ADMIN_AUCTIONS_PATH}
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          Back to Auctions
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <p className="sr-only">Loading auction</p>
        <div className="h-10 w-2/3 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-48 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
      </div>
    );
  }

  if (error) {
    const status = getApiStatus(error);
    const notFound = status === 404;
    return (
      <div
        role="alert"
        className="space-y-4 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      >
        <h1 className="text-lg font-semibold">
          {notFound ? 'Auction not found' : 'Could not load auction'}
        </h1>
        <p>
          {getApiErrorMessage(
            error,
            notFound
              ? 'This auction does not exist or is no longer available.'
              : 'Please try again in a moment.',
          )}
        </p>
        <div className="flex flex-wrap gap-3">
          {!notFound ? (
            <button
              type="button"
              onClick={() => void mutate()}
              className="inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-red-800 dark:hover:bg-red-950"
            >
              Try Again
            </button>
          ) : null}
          <Link
            href={ADMIN_AUCTIONS_PATH}
            className="inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium transition hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-950"
          >
            Back to Auctions
          </Link>
        </div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">
          Auction not found
        </h1>
        <Link
          href={ADMIN_AUCTIONS_PATH}
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          Back to Auctions
        </Link>
      </div>
    );
  }

  return <AuctionDetailBody auction={auction} />;
}
