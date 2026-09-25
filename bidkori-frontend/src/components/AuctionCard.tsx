'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Camera, Clock3, Flame, Tag } from 'lucide-react';

import { useAuctionTimer } from '@/hooks/useAuctionTimer';
import { getAuctionDisplayState } from '@/lib/auctionDetailUx';
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
 * Modern, touch-first public marketplace auction card matching Stitch AI design:
 * - Inset media box with ambient glow & Live badge
 * - Uppercase category header with Tag icon
 * - Prominent title with divider line
 * - STARTING PRICE / CURRENT BID display with Bangladeshi Taka (৳)
 * - Timer pill & amber "Bid →" action button
 */
export default function AuctionCard({ auction }: AuctionCardProps) {
  const [imgError, setImgError] = useState(false);
  const title = getAuctionTitle(auction);
  const product = getAuctionProduct(auction);
  const imageUrl = resolveMediaUrl(
    auction.images?.[0]?.image
    ?? (product as { images?: { image?: string }[] } | null)?.images?.[0]?.image
  );
  const price = getAuctionPriceLabel(auction);
  const timer = useAuctionTimer(auction.end_time, auction.server_time, {
    forceExpired:
      auction.status === 'CLOSED' || auction.status === 'CANCELLED',
    startTime: auction.start_time,
  });

  const parsedServerMs = auction.server_time
    ? Date.parse(auction.server_time)
    : Number.NaN;
  const nowMs =
    timer.estimatedNowMs ??
    (Number.isFinite(parsedServerMs) ? parsedServerMs : Date.now());

  const displayState = getAuctionDisplayState({
    status: auction.status,
    startTime: auction.start_time,
    endTime: auction.end_time,
    nowMs,
  });

  const closed =
    displayState === 'CLOSED' ||
    displayState === 'CANCELLED' ||
    timer.isClosed;

  const isEndingSoon = displayState === 'LIVE' && timer.days === 0 && timer.hours < 2;

  const rawCategory =
    typeof (product as Record<string, unknown>)?.category_name === 'string'
      ? (product as Record<string, unknown>).category_name as string
      : typeof (auction as Record<string, unknown>)?.category_name === 'string'
        ? (auction as Record<string, unknown>).category_name as string
        : 'AUCTION';
  const categoryName = rawCategory.toUpperCase();

  return (
    <Link
      href={MARKETPLACE_ROUTES.auctionDetail(auction.id)}
      aria-label={`View auction: ${title}. ${price.label} ${formatAuctionMoney(price.amount)}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#0c1017] p-3.5 sm:p-4 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/40 hover:shadow-2xl hover:shadow-amber-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
    >
      {/* Thumbnail / Media Box */}
      <div className="relative aspect-[16/11] sm:aspect-[4/3] w-full overflow-hidden rounded-xl sm:rounded-2xl border border-zinc-800/60 bg-[#070a0f] flex items-center justify-center">
        {/* Soft emerald ambient spotlight in the center */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.12),transparent_70%)]"
        />

        {imageUrl && !imgError ? (
          <Image
            src={imageUrl}
            alt={`Photo of ${title}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-contain p-3 sm:p-4 transition-transform duration-500 ease-out group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800/80 bg-zinc-900/60 text-zinc-500 mb-2">
              <Camera className="h-6 w-6 stroke-[1.5]" aria-hidden />
            </div>
            <span className="text-xs font-medium text-zinc-500">
              No image available
            </span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute left-3 right-3 top-3 flex items-center justify-between pointer-events-none">
          {displayState === 'LIVE' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-black/60 px-2.5 py-1 text-xs font-semibold text-emerald-400 backdrop-blur-md shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <Flame className="h-3 w-3 text-emerald-400 fill-emerald-400/20" aria-hidden />
              <span>Live</span>
            </span>
          ) : displayState === 'UPCOMING' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-black/60 px-2.5 py-1 text-xs font-semibold text-sky-400 backdrop-blur-md shadow-xs">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              <span>Upcoming</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/50 bg-black/60 px-2.5 py-1 text-xs font-semibold text-zinc-400 backdrop-blur-md shadow-xs">
              <span>{auction.status === 'CANCELLED' ? 'Cancelled' : 'Ended'}</span>
            </span>
          )}

          {isEndingSoon && (
            <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/80 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-rose-300 backdrop-blur-md">
              Ending Soon
            </span>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 flex-col pt-3.5 sm:pt-4">
        {/* Category Header */}
        <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold tracking-wider text-zinc-400 uppercase">
          <Tag className="h-3.5 w-3.5 text-amber-500 fill-amber-500/10 shrink-0" aria-hidden />
          <span className="truncate">{categoryName}</span>
        </div>

        {/* Listing Title */}
        <h2 className="mt-1.5 text-base sm:text-lg font-bold tracking-tight text-white line-clamp-1 transition-colors group-hover:text-amber-400">
          {title}
        </h2>

        {/* Divider */}
        <div className="my-3.5 border-t border-zinc-800/80" />

        {/* Price display & Action row pinned to bottom */}
        <div className="mt-auto">
          <div className="flex flex-col">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              {price.label.toUpperCase()}
            </span>
            <span className="mt-0.5 text-xl sm:text-2xl font-black tracking-tight text-white tabular-nums">
              {formatAuctionMoney(price.amount)}
            </span>
          </div>

          {/* Time & Action row */}
          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800/90 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-300">
              <Clock3 className="h-3.5 w-3.5 text-zinc-400 shrink-0" aria-hidden />
              <span>
                {closed
                  ? auction.status === 'CANCELLED'
                    ? 'Cancelled'
                    : 'Ended'
                  : formatRemaining(timer)}
              </span>
            </span>

            <span className="inline-flex items-center justify-center gap-1 rounded-xl border border-amber-500/40 bg-[#251a0e] px-4 py-1.5 text-xs sm:text-sm font-bold text-amber-400 shadow-xs transition-all duration-200 group-hover:bg-amber-500 group-hover:text-zinc-950 group-hover:border-amber-400">
              <span>Bid</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
