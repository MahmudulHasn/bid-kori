import Link from 'next/link';
import { format } from 'date-fns';

import { formatSellerProductCondition } from '@/lib/seller';
import { sellerProductDetailPath, sellerProductEditPath } from '@/lib/workspaceNavigation';
import type { Product } from '@/lib/types';

function formatCreatedAt(
  value: string | undefined,
): { iso: string; label: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), label: format(date, 'MMM d, yyyy') };
}

export default function SellerProductItem({ product }: { product: Product }) {
  const title = product.title.trim() ? product.title : 'Untitled product';
  const created = formatCreatedAt(product.created_at);
  const href = sellerProductDetailPath(product.id);

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
              <dt>Condition</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {formatSellerProductCondition(product.condition)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt>Created</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {created ? (
                  <time dateTime={created.iso}>{created.label}</time>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Link
            href={href}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            View
            <span className="sr-only"> details for {title}</span>
          </Link>
          <Link
            href={sellerProductEditPath(product.id)}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Edit
            <span className="sr-only"> {title}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

export function SellerProductTableRow({ product }: { product: Product }) {
  const title = product.title.trim() ? product.title : 'Untitled product';
  const created = formatCreatedAt(product.created_at);
  const href = sellerProductDetailPath(product.id);

  return (
    <tr className="border-t border-zinc-200 dark:border-zinc-800">
      <th scope="row" className="px-4 py-3 text-left font-medium">
        <Link
          href={href}
          className="text-zinc-900 hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-white dark:hover:text-sky-300"
        >
          {title}
        </Link>
      </th>
      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
        {formatSellerProductCondition(product.condition)}
      </td>
      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
        {created ? <time dateTime={created.iso}>{created.label}</time> : '—'}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={href}
            className="inline-flex rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            View
            <span className="sr-only"> details for {title}</span>
          </Link>
          <Link
            href={sellerProductEditPath(product.id)}
            className="inline-flex rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Edit
            <span className="sr-only"> {title}</span>
          </Link>
        </div>
      </td>
    </tr>
  );
}
