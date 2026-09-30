'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Camera, Clock3, Flame, Tag, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
import { MOTION_DURATIONS, MOTION_EASINGS } from '@/lib/motionTokens';
import type { Auction } from '@/lib/types';

export type AuctionCardProps = {
  auction: Auction;
  index?: number;
  priority?: boolean;
};

function formatRemaining(timer: ReturnType<typeof useAuctionTimer>): string {
  if (timer.isClosed) return 'Ended';
  if (timer.days > 0) return `${timer.days}d ${timer.hours}h left`;
  if (timer.hours > 0) return `${timer.hours}h ${timer.minutes}m left`;
  return `${timer.minutes}m ${timer.seconds}s left`;
}

/**
 * Authoritative BidKori AuctionCard
 * Integrates Framer Motion micro-interactions, shadcn Badge primitives,
 * real product media resolution, and accessible countdown cues.
 */
export default function AuctionCard({
  auction,
  index = 0,
  priority = false,
}: AuctionCardProps) {
  const [imgError, setImgError] = useState(false);
  const [catImgError, setCatImgError] = useState(false);
  const prefersReduced = useReducedMotion();

  const title = getAuctionTitle(auction);
  const product = getAuctionProduct(auction);
  const imageUrl = resolveMediaUrl(
    auction.images?.[0]?.image ??
      (product as { images?: { image?: string }[] } | null)?.images?.[0]?.image
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
    (Number.isFinite(parsedServerMs) ? parsedServerMs : 0);

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

  const isEndingSoon =
    displayState === 'LIVE' && timer.days === 0 && timer.hours < 2;

  const rawCategory =
    typeof (product as Record<string, unknown>)?.category_name === 'string'
      ? ((product as Record<string, unknown>).category_name as string)
      : typeof (auction as Record<string, unknown>)?.category_name === 'string'
        ? ((auction as Record<string, unknown>).category_name as string)
        : 'AUCTION';
  const categoryName = rawCategory.toUpperCase();

  const rawCatImage =
    typeof (product as Record<string, unknown>)?.category_image === 'string'
      ? ((product as Record<string, unknown>).category_image as string)
      : typeof (auction as Record<string, unknown>)?.category_image === 'string'
        ? ((auction as Record<string, unknown>).category_image as string)
        : null;
  const categoryImageUrl = resolveMediaUrl(rawCatImage);

  const bidCount = typeof auction.bid_count === 'number' ? auction.bid_count : null;

  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: MOTION_DURATIONS.normal,
        delay: prefersReduced ? 0 : Math.min(index * 0.04, 0.24),
        ease: MOTION_EASINGS.easeOutCubic,
      }}
      whileHover={
        prefersReduced
          ? undefined
          : {
              y: -4,
              transition: {
                duration: MOTION_DURATIONS.fast,
                ease: MOTION_EASINGS.easeOutCubic,
              },
            }
      }
      className="h-full"
    >
      <Link
        href={MARKETPLACE_ROUTES.auctionDetail(auction.id)}
        aria-label={`View auction: ${title}. ${price.label} ${formatAuctionMoney(price.amount)}`}
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#0c1017] p-3.5 sm:p-4 shadow-xl transition-all duration-300 hover:border-amber-500/40 hover:shadow-2xl hover:shadow-amber-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
      >
        {/* Thumbnail Box */}
        <div className="relative aspect-[16/11] sm:aspect-[4/3] w-full overflow-hidden rounded-xl sm:rounded-2xl border border-zinc-800/60 bg-[#070a0f] flex items-center justify-center">
          {/* Subtle radial emerald/amber ambient glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.08),transparent_70%)]"
          />

          {imageUrl && !imgError ? (
            <Image
              src={imageUrl}
              alt={`Photo of ${title}`}
              fill
              priority={priority}
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

          {/* Top Status Badges */}
          <div className="absolute left-3 right-3 top-3 flex items-center justify-between pointer-events-none">
            {displayState === 'LIVE' ? (
              <Badge variant="live" className="backdrop-blur-md bg-black/60 shadow-xs">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <Flame className="h-3 w-3 text-emerald-400 fill-emerald-400/20" aria-hidden />
                <span>Live</span>
              </Badge>
            ) : displayState === 'UPCOMING' ? (
              <Badge variant="info" className="backdrop-blur-md bg-black/60 shadow-xs">
                <span className="h-2 w-2 rounded-full bg-sky-400" />
                <span>Upcoming</span>
              </Badge>
            ) : (
              <Badge variant="secondary" className="backdrop-blur-md bg-black/60 shadow-xs">
                <span>{auction.status === 'CANCELLED' ? 'Cancelled' : 'Ended'}</span>
              </Badge>
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
          <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs font-bold tracking-wider text-zinc-400 uppercase">
            <div className="flex items-center gap-1.5 truncate">
              {categoryImageUrl && !catImgError ? (
                <img
                  src={categoryImageUrl}
                  alt=""
                  aria-hidden
                  className="h-3.5 w-3.5 rounded-full object-cover shrink-0 border border-zinc-700/80"
                  onError={() => setCatImgError(true)}
                />
              ) : (
                <Tag className="h-3.5 w-3.5 text-amber-500 fill-amber-500/10 shrink-0" aria-hidden />
              )}
              <span className="truncate">{categoryName}</span>
            </div>

            {bidCount !== null && bidCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-400 tabular-nums lowercase shrink-0">
                <Users className="h-3 w-3 text-zinc-500" />
                <span>{bidCount} bids</span>
              </span>
            )}
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
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  isEndingSoon
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    : 'border-zinc-800/90 bg-zinc-900/80 text-zinc-300'
                }`}
              >
                <Clock3
                  className={`h-3.5 w-3.5 shrink-0 ${
                    isEndingSoon ? 'text-rose-400' : 'text-zinc-400'
                  }`}
                  aria-hidden
                />
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
                <ArrowRight
                  className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
