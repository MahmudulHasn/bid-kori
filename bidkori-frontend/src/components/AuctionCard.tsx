'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Clock3 } from 'lucide-react';

import { useAuctionTimer } from '@/hooks/useAuctionTimer';
import {
  formatAuctionMoney,
  formatAuctionStatus,
  getAuctionPriceLabel,
  getAuctionTitle,
} from '@/lib/auctionDisplay';
import { MARKETPLACE_ROUTES } from '@/lib/marketplace';
import { resolveMediaUrl } from '@/lib/media';
import type { Auction } from '@/lib/types';

type AuctionCardProps = {
  auction: Auction;
};

function formatRemaining(timer: ReturnType<typeof useAuctionTimer>): string {
  if (timer.isClosed) return 'Ended';
  if (timer.days > 0) return `${timer.days}d ${timer.hours}h left`;
  if (timer.hours > 0) return `${timer.hours}h ${timer.minutes}m left`;
  return `${timer.minutes}m ${timer.seconds}s left`;
}

/**
 * Public marketplace auction card (formerly ProductCard).
 * Links to `/auctions/[id]` and uses only fields returned by the API.
 */
export default function AuctionCard({ auction }: AuctionCardProps) {
  const title = getAuctionTitle(auction);
  const imageUrl = resolveMediaUrl(auction.images?.[0]?.image);
  const price = getAuctionPriceLabel(auction);
  const timer = useAuctionTimer(auction.end_time, auction.server_time, {
    forceExpired:
      auction.status === 'CLOSED' || auction.status === 'CANCELLED',
  });
  const statusLabel = formatAuctionStatus(auction.status);
  const closed =
    timer.isClosed ||
    auction.status === 'CLOSED' ||
    auction.status === 'CANCELLED';

  const isEndingSoon = !closed && timer.days === 0 && timer.hours < 2;

  return (
    <Link
      href={MARKETPLACE_ROUTES.auctionDetail(auction.id)}
      aria-label={`View auction: ${title}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/40 hover:shadow-xl dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:hover:border-amber-500/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800/60">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs font-medium text-zinc-400">
            No image available
          </div>
        )}

        {/* Top badges */}
        <div className="absolute left-3 top-3 right-3 flex items-center justify-between pointer-events-none">
          {statusLabel ? (
            <span
              className={[
                'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide backdrop-blur-md shadow-xs',
                auction.status === 'ACTIVE'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                  : auction.status === 'CANCELLED'
                    ? 'bg-zinc-900/85 text-zinc-300 border border-zinc-700/50'
                    : 'bg-zinc-900/85 text-zinc-300 border border-zinc-700/50',
              ].join(' ')}
            >
              {auction.status === 'ACTIVE' ? (
                <span className="relative mr-1.5 flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
              ) : null}
              {statusLabel}
            </span>
          ) : <span />}

          {isEndingSoon ? (
            <span className="inline-flex items-center rounded-full bg-rose-950/85 px-2.5 py-1 text-[11px] font-semibold text-rose-300 border border-rose-500/30 backdrop-blur-md">
              Ending Soon
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h2 className="line-clamp-2 text-base font-semibold text-zinc-900 transition-colors group-hover:text-amber-600 dark:text-zinc-100 dark:group-hover:text-amber-400">
          {title}
        </h2>

        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {price.label}
          </span>
          <span className="text-xl font-bold tracking-tight text-amber-700 dark:text-amber-400">
            {formatAuctionMoney(price.amount)}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span className={[
            'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium',
            closed
              ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-400'
              : isEndingSoon
                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300',
          ].join(' ')}>
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            {closed
              ? auction.status === 'CANCELLED'
                ? 'Cancelled'
                : 'Auction ended'
              : formatRemaining(timer)}
          </span>

          <span className="font-semibold text-amber-600 dark:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity">
            View &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}
