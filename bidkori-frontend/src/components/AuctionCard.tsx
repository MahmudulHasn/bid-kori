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
  const timer = useAuctionTimer(auction.end_time);
  const statusLabel = formatAuctionStatus(auction.status);
  const closed =
    timer.isClosed ||
    auction.status === 'CLOSED' ||
    auction.status === 'CANCELLED';

  return (
    <Link
      href={MARKETPLACE_ROUTES.auctionDetail(auction.id)}
      aria-label={`View auction: ${title}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            No image
          </div>
        )}
        {statusLabel ? (
          <span
            className={[
              'absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
              auction.status === 'ACTIVE'
                ? 'bg-emerald-600 text-white'
                : auction.status === 'CANCELLED'
                  ? 'bg-zinc-700 text-white'
                  : 'bg-zinc-900/80 text-white',
            ].join(' ')}
          >
            {statusLabel}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="line-clamp-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        <p className="mt-auto text-sm text-zinc-500 dark:text-zinc-400">
          {price.label}
        </p>
        <p className="text-lg font-semibold text-amber-700 dark:text-amber-300">
          {formatAuctionMoney(price.amount)}
        </p>
        <p className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <Clock3 className="h-3.5 w-3.5" aria-hidden />
          {closed ? (auction.status === 'CANCELLED' ? 'Cancelled' : 'Auction ended') : formatRemaining(timer)}
        </p>
      </div>
    </Link>
  );
}
