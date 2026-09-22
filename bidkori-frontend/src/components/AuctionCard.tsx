'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Clock3, Tag } from 'lucide-react';

import AuctionStatusBadge from '@/components/auctions/AuctionStatusBadge';
import { useAuctionTimer } from '@/hooks/useAuctionTimer';
import {
  formatAuctionMoney,
  getAuctionPriceLabel,
  getAuctionProduct,
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
 * Modern, touch-first public marketplace auction card.
 * Designed for mobile-first scanning (~360-430px) and desktop grids.
 */
export default function AuctionCard({ auction }: AuctionCardProps) {
  const [imgError, setImgError] = useState(false);
  const title = getAuctionTitle(auction);
  const product = getAuctionProduct(auction);
  const imageUrl = resolveMediaUrl(
    auction.images?.[0]?.image
    ?? (product as Record<string, unknown>)?.images?.[0]?.image as string | undefined
  );
  const price = getAuctionPriceLabel(auction);
  const timer = useAuctionTimer(auction.end_time, auction.server_time, {
    forceExpired:
      auction.status === 'CLOSED' || auction.status === 'CANCELLED',
  });
  const closed =
    timer.isClosed ||
    auction.status === 'CLOSED' ||
    auction.status === 'CANCELLED';

  const isEndingSoon = !closed && timer.days === 0 && timer.hours < 2;
  const categoryName = typeof (product as Record<string, unknown>)?.category_name === 'string'
    ? (product as Record<string, unknown>).category_name as string
    : typeof (auction as Record<string, unknown>)?.category_name === 'string'
      ? (auction as Record<string, unknown>).category_name as string
      : undefined;

  return (
    <Link
      href={MARKETPLACE_ROUTES.auctionDetail(auction.id)}
      aria-label={`View auction: ${title}. ${price.label} ${formatAuctionMoney(price.amount)}`}
      className="group relative flex h-full min-h-[300px] flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/40 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900/70 dark:hover:border-amber-500/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
    >
      {/* Thumbnail area */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800/80">
        {imageUrl && !imgError ? (
          <Image
            src={imageUrl}
            alt={`Photo of ${title}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs font-medium text-zinc-400">
            No image available
          </div>
        )}

        {/* Gradient overlay for badges readability */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/40 via-black/10 to-transparent"
        />

        {/* Top Badges */}
        <div className="absolute left-3 right-3 top-3 flex items-center justify-between pointer-events-none">
          <AuctionStatusBadge state={auction.status || 'CLOSED'} size="sm" />

          {isEndingSoon && (
            <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/85 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-rose-300 backdrop-blur-md shadow-xs">
              Ending Soon
            </span>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        {categoryName && (
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <Tag className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden />
            <span className="truncate">{categoryName}</span>
          </div>
        )}

        <h2 className="line-clamp-2 text-sm font-semibold text-zinc-900 transition-colors group-hover:text-amber-700 dark:text-zinc-100 dark:group-hover:text-amber-300 sm:text-base leading-snug">
          {title}
        </h2>

        {/* Price display */}
        <div className="mt-auto pt-3.5">
          <div className="flex flex-col border-t border-zinc-100 pt-3 dark:border-zinc-800/80">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {price.label}
            </span>
            <span className="text-lg font-bold tabular-nums text-zinc-900 dark:text-white sm:text-xl">
              {formatAuctionMoney(price.amount)}
            </span>
          </div>

          {/* Time & Action row */}
          <div className="mt-3 flex items-center justify-between text-xs">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                closed
                  ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  : isEndingSoon
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-300'
              }`}
            >
              <Clock3 className="h-3 w-3 shrink-0" aria-hidden />
              <span>
                {closed
                  ? auction.status === 'CANCELLED'
                    ? 'Cancelled'
                    : 'Ended'
                  : formatRemaining(timer)}
              </span>
            </span>

            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-amber-600">
              Bid <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
