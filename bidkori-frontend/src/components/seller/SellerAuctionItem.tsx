import Link from 'next/link';
import { format } from 'date-fns';

import {
  formatAuctionMoney,
  getAuctionPriceLabel,
  getAuctionTitle,
} from '@/lib/auctionDisplay';
import { getSellerAuctionDisplayStatus } from '@/lib/seller';
import { sellerAuctionDetailPath } from '@/lib/workspaceNavigation';
import type { Auction } from '@/lib/types';

function formatWhen(
  value: string | undefined,
): { iso: string; label: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), label: format(date, 'MMM d, yyyy, h:mm a') };
}

export default function SellerAuctionItem({ auction }: { auction: Auction }) {
  const title = getAuctionTitle(auction);
  const href = sellerAuctionDetailPath(auction.id);
  const starts = formatWhen(auction.start_time);
  const ends = formatWhen(auction.end_time);
  const price = getAuctionPriceLabel(auction);
  const statusLabel = getSellerAuctionDisplayStatus(auction);

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-white">
            <Link
              href={href}
              className="hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:hover:text-sky-300"
            >
              {title}
            </Link>
          </h2>
          <dl className="mt-2 grid gap-1 text-sm text-zinc-500 dark:text-zinc-400 sm:grid-cols-2">
            <div className="flex justify-between gap-3 sm:block">
              <dt>Status</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">{statusLabel}</dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt>{price.label}</dt>
              <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">
                {formatAuctionMoney(price.amount)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt>Starts</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {starts ? <time dateTime={starts.iso}>{starts.label}</time> : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt>Ends</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {ends ? <time dateTime={ends.iso}>{ends.label}</time> : '—'}
              </dd>
            </div>
          </dl>
        </div>
        <Link
          href={href}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          View details
          <span className="sr-only"> for {title}</span>
        </Link>
      </div>
    </article>
  );
}

export function SellerAuctionTableRow({ auction }: { auction: Auction }) {
  const title = getAuctionTitle(auction);
  const href = sellerAuctionDetailPath(auction.id);
  const starts = formatWhen(auction.start_time);
  const ends = formatWhen(auction.end_time);
  const price = getAuctionPriceLabel(auction);
  const statusLabel = getSellerAuctionDisplayStatus(auction);

  return (
    <tr className="border-t border-zinc-200 dark:border-zinc-800">
      <th scope="row" className="max-w-[12rem] px-4 py-3 text-left font-medium">
        <Link
          href={href}
          className="block truncate text-zinc-900 hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-white dark:hover:text-sky-300"
        >
          {title}
        </Link>
      </th>
      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{statusLabel}</td>
      <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
        <span className="block text-xs text-zinc-500">{price.label}</span>
        {formatAuctionMoney(price.amount)}
      </td>
      <td className="hidden px-4 py-3 text-zinc-700 lg:table-cell dark:text-zinc-300">
        {starts ? <time dateTime={starts.iso}>{starts.label}</time> : '—'}
      </td>
      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
        {ends ? <time dateTime={ends.iso}>{ends.label}</time> : '—'}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={href}
          className="inline-flex rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          View
          <span className="sr-only"> details for {title}</span>
        </Link>
      </td>
    </tr>
  );
}
