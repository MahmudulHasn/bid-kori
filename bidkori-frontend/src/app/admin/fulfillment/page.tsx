'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useCallback, type ReactNode, Suspense } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  DollarSign,
  FileText,
  Filter,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Sparkles,
  Unlock,
  XCircle,
} from 'lucide-react';
import useSWR from 'swr';

import {
  ADMIN_FULFILLMENT_API_PATH,
  ADMIN_FULFILLMENT_SUMMARY_API_PATH,
  FULFILLMENT_FILTER_OPTIONS,
  UNLOCK_FILTER_OPTIONS,
  adminFulfillmentDetailPath,
  formatFulfillmentMoney,
  getFulfillmentStatusBadge,
  getUnlockStatusLabel,
  isIntegrityWarning,
  type AdminFulfillmentListItem,
  type AdminFulfillmentPaginatedResponse,
  type AdminFulfillmentSummary,
} from '@/lib/adminFulfillment';
import {
  adminFulfillmentListFetcher,
  adminFulfillmentSummaryFetcher,
} from '@/lib/adminFulfillmentApi';
import { getApiErrorMessage } from '@/lib/apiErrors';

/* ── Summary Card ─────────────────────────────────────── */

function SummaryCard({
  label,
  value,
  icon,
  hint,
  loading,
  accent,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  hint: string;
  loading?: boolean;
  accent?: string;
}) {
  return (
    <article
      className="group relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/90"
      title={hint}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
        <div
          className={[
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            accent || 'bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300',
          ].join(' ')}
        >
          {icon}
        </div>
      </div>
      {loading ? (
        <div className="mt-3 h-8 w-20 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      ) : (
        <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">
          {value}
        </p>
      )}
    </article>
  );
}

/* ── Status Badge ─────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const badge = getFulfillmentStatusBadge(status);
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider',
        badge.className,
      ].join(' ')}
    >
      {badge.label}
    </span>
  );
}

function IntegrityBadge({ status }: { status: string }) {
  if (!isIntegrityWarning(status)) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-red-700 dark:bg-red-900/30 dark:text-red-300"
      title="Integrity warning detected"
    >
      <AlertTriangle className="h-3 w-3" />
      Warning
    </span>
  );
}

/* ── Table Row ────────────────────────────────────────── */

function FulfillmentRow({ item }: { item: AdminFulfillmentListItem }) {
  const router = useRouter();

  return (
    <tr
      className="cursor-pointer border-b border-zinc-100 transition hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40"
      onClick={() => router.push(adminFulfillmentDetailPath(item.auction_id))}
      tabIndex={0}
      role="link"
      aria-label={`View fulfillment details for auction ${item.auction_id}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(adminFulfillmentDetailPath(item.auction_id));
        }
      }}
    >
      <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        #{item.auction_id}
      </td>
      <td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
        <div className="max-w-[180px] truncate">{item.product_title}</div>
      </td>
      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
        {item.seller_username}
      </td>
      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
        {item.winner_username || '—'}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={item.fulfillment_status} />
      </td>
      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
        {getUnlockStatusLabel(item.unlock_status)}
      </td>
      <td className="px-4 py-3 text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
        {item.unlock_fee ? formatFulfillmentMoney(item.unlock_fee) : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
        {item.submitted_at ? format(new Date(item.submitted_at), 'dd MMM yyyy') : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
        {item.unlocked_at ? format(new Date(item.unlocked_at), 'dd MMM yyyy') : '—'}
      </td>
      <td className="px-4 py-3">
        <IntegrityBadge status={item.integrity_status} />
        {!isIntegrityWarning(item.integrity_status) && (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        )}
      </td>
    </tr>
  );
}

/* ── Mobile Card ──────────────────────────────────────── */

function FulfillmentCard({ item }: { item: AdminFulfillmentListItem }) {
  return (
    <Link
      href={adminFulfillmentDetailPath(item.auction_id)}
      className="block rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/90"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-zinc-900 dark:text-white">
            #{item.auction_id} — {item.product_title}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Seller: {item.seller_username} · Winner: {item.winner_username || '—'}
          </p>
        </div>
        <IntegrityBadge status={item.integrity_status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={item.fulfillment_status} />
        {item.unlock_status && (
          <span className="text-xs text-zinc-500">
            Unlock: {getUnlockStatusLabel(item.unlock_status)}
          </span>
        )}
        {item.unlock_fee && (
          <span className="text-xs font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
            {formatFulfillmentMoney(item.unlock_fee)}
          </span>
        )}
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-zinc-400">
        {item.submitted_at && (
          <span>Submitted: {format(new Date(item.submitted_at), 'dd MMM yyyy')}</span>
        )}
        {item.unlocked_at && (
          <span>Unlocked: {format(new Date(item.unlocked_at), 'dd MMM yyyy')}</span>
        )}
      </div>
    </Link>
  );
}

/* ── Main Content (uses useSearchParams) ──────────────── */

function AdminFulfillmentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState(
    searchParams.get('status') || '',
  );
  const [unlockFilter, setUnlockFilter] = useState(
    searchParams.get('unlock_status') || '',
  );
  const [searchQuery, setSearchQuery] = useState(
    searchParams.get('search') || '',
  );
  const [currentPage, setCurrentPage] = useState(
    Number(searchParams.get('page')) || 1,
  );

  // Build API URL with filters
  const buildApiUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (unlockFilter) params.set('unlock_status', unlockFilter);
    if (searchQuery) params.set('search', searchQuery);
    if (currentPage > 1) params.set('page', String(currentPage));
    const qs = params.toString();
    return `${ADMIN_FULFILLMENT_API_PATH}${qs ? `?${qs}` : ''}`;
  }, [statusFilter, unlockFilter, searchQuery, currentPage]);

  // SWR hooks
  const {
    data: listData,
    error: listError,
    isLoading: listLoading,
    mutate: mutateList,
  } = useSWR<AdminFulfillmentPaginatedResponse>(buildApiUrl(), adminFulfillmentListFetcher, {
    dedupingInterval: 5000,
  });

  const {
    data: summary,
    error: summaryError,
    isLoading: summaryLoading,
  } = useSWR<AdminFulfillmentSummary>(
    ADMIN_FULFILLMENT_SUMMARY_API_PATH,
    adminFulfillmentSummaryFetcher,
    { dedupingInterval: 10000 },
  );

  const results = listData?.results ?? [];
  const totalCount = listData?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 20));

  const handleFilterChange = (
    setter: (v: string) => void,
    value: string,
  ) => {
    setter(value);
    setCurrentPage(1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    void mutateList();
  };

  const error = listError || summaryError;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Fulfillment Audit
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Winner fulfillment status, seller unlock activity, and unlock revenue
          </p>
        </div>
        <button
          type="button"
          onClick={() => void mutateList()}
          className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          aria-label="Refresh fulfillment data"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          label="Fulfillment Required"
          value={summary?.total_requiring_fulfillment ?? '—'}
          icon={<FileText className="h-4 w-4" />}
          hint="Total won auctions requiring fulfillment"
          loading={summaryLoading}
          accent="bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300"
        />
        <SummaryCard
          label="In Progress"
          value={
            ((summary?.not_started ?? 0) + (summary?.draft ?? 0)).toString()
          }
          icon={<Clock className="h-4 w-4" />}
          hint="Not started + drafts"
          loading={summaryLoading}
          accent="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300"
        />
        <SummaryCard
          label="Ready to Unlock"
          value={summary?.completed_locked ?? '—'}
          icon={<Lock className="h-4 w-4" />}
          hint="Completed but not yet unlocked by seller"
          loading={summaryLoading}
          accent="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300"
        />
        <SummaryCard
          label="Unlocked"
          value={summary?.unlocked ?? '—'}
          icon={<Unlock className="h-4 w-4" />}
          hint="Sellers have paid and unlocked buyer details"
          loading={summaryLoading}
          accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
        />
        <SummaryCard
          label="Unlock Revenue"
          value={
            summary
              ? formatFulfillmentMoney(summary.unlock_revenue)
              : '—'
          }
          icon={<DollarSign className="h-4 w-4" />}
          hint={
            summary?.disclosure ||
            'Mock/internal unlock fee revenue (separate from sale platform fees)'
          }
          loading={summaryLoading}
          accent="bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-300"
        />
      </div>

      {/* Disclosure */}
      {summary?.disclosure && (
        <p className="rounded-xl bg-zinc-50 px-4 py-2 text-xs text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
          <Sparkles className="mr-1 inline h-3 w-3" />
          {summary.disclosure}
        </p>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          <Filter className="h-3.5 w-3.5" />
          Filters
        </div>

        <label className="flex flex-col gap-1" htmlFor="filter-status">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Status
          </span>
          <select
            id="filter-status"
            value={statusFilter}
            onChange={(e) =>
              handleFilterChange(setStatusFilter, e.target.value)
            }
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {FULFILLMENT_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1" htmlFor="filter-unlock">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Unlock
          </span>
          <select
            id="filter-unlock"
            value={unlockFilter}
            onChange={(e) =>
              handleFilterChange(setUnlockFilter, e.target.value)
            }
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {UNLOCK_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <form
          onSubmit={handleSearch}
          className="flex flex-1 items-end gap-2"
        >
          <label className="flex min-w-[180px] flex-1 flex-col gap-1" htmlFor="filter-search">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Search
            </span>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                id="filter-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Auction, product, seller, winner…"
                className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-sm text-zinc-700 shadow-sm placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              />
            </div>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700"
          >
            Search
          </button>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <XCircle className="h-4 w-4 shrink-0" />
          {getApiErrorMessage(error) || 'Failed to load fulfillment data.'}
          <button
            type="button"
            onClick={() => void mutateList()}
            className="ml-auto text-xs font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {listLoading && !listData && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          <span className="ml-2 text-sm text-zinc-500">Loading fulfillment data…</span>
        </div>
      )}

      {/* Empty */}
      {!listLoading && !error && results.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 py-16 dark:border-zinc-700 dark:bg-zinc-900/30">
          <ClipboardCheck className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
          <p className="mt-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            No fulfillment records found
          </p>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            {statusFilter || unlockFilter || searchQuery
              ? 'Try adjusting your filters'
              : 'Fulfillment records appear when auctions close with a winner'}
          </p>
        </div>
      )}

      {/* Desktop Table */}
      {!listLoading && results.length > 0 && (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Auction
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Product
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Seller
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Winner
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Unlock
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Fee
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Submitted
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Unlocked
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Integrity
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((item) => (
                  <FulfillmentRow key={item.auction_id} item={item} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {results.map((item) => (
              <FulfillmentCard key={item.auction_id} item={item} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-xl border border-zinc-200/80 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Showing page {currentPage} of {totalPages} ({totalCount} records)
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  aria-label="Previous page"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  aria-label="Next page"
                >
                  Next
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Page Export ───────────────────────────────────────── */

export default function AdminFulfillmentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
        </div>
      }
    >
      <AdminFulfillmentContent />
    </Suspense>
  );
}
