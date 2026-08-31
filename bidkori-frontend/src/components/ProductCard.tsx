import Image from 'next/image';
import Link from 'next/link';

import type { Auction } from '@/lib/types';
import { resolveMediaUrl } from '@/lib/media';

type ProductCardProps = {
  auction: Auction;
};

export default function ProductCard({ auction }: ProductCardProps) {
  const title = auction.product?.title ?? 'Untitled listing';
  const bid = auction.current_highest_bid ?? auction.starting_bid ?? '0.00';
  const imageUrl = resolveMediaUrl(auction.images?.[0]?.image);

  return (
    <Link
      href={`/auctions/${auction.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
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
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="line-clamp-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        <p className="mt-auto text-sm text-zinc-500 dark:text-zinc-400">Current bid</p>
        <p className="text-lg font-semibold text-amber-700 dark:text-amber-300">
          ৳{Number(bid).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </p>
      </div>
    </Link>
  );
}
