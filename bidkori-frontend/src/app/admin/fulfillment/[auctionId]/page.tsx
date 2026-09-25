'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Hash,
  Loader2,
  Lock,
  Shield,
  Unlock,
  User,
  XCircle,
} from 'lucide-react';
import useSWR from 'swr';

import {
  ADMIN_FULFILLMENT_PATH,
  adminFulfillmentDetailApiPath,
  formatFulfillmentMoney,
  getFulfillmentStatusBadge,
  getUnlockStatusLabel,
  isIntegrityWarning,
  type AdminFulfillmentDetail,
} from '@/lib/adminFulfillment';
import { adminFulfillmentDetailFetcher } from '@/lib/adminFulfillmentApi';
import { getApiErrorMessage } from '@/lib/apiErrors';

/* ── Section Card ─────────────────────────────────────── */

function Section({
  title,
  icon,
  children,
  accent,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800/60">
        <div
          className={[
            'flex h-7 w-7 items-center justify-center rounded-lg',
            accent || 'bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300',
          ].join(' ')}
        >
          {icon}
        </div>
        <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
          {title}
        </h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/* ── Meta Row ─────────────────────────────────────────── */

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-50 py-2 last:border-0 dark:border-zinc-800/40">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span
        className={[
          'text-right text-sm text-zinc-800 dark:text-zinc-200',
          mono ? 'font-mono' : '',
        ].join(' ')}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

/* ── Timestamp Helper ─────────────────────────────────── */

function formatTs(ts: string | null | undefined): string {
  if (!ts) return '—';
  return format(new Date(ts), 'dd MMM yyyy, HH:mm');
}

/* ── Status Badge ─────────────────────────────────────── */

function LargeStatusBadge({ status }: { status: string }) {
  const badge = getFulfillmentStatusBadge(status);
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider',
        badge.className,
      ].join(' ')}
    >
      {badge.label}
    </span>
  );
}

/* ── Notification Indicator ───────────────────────────── */

function NotifIndicator({
  sent,
  label,
}: {
  sent: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      {sent ? (
        <Bell className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <BellOff className="h-3.5 w-3.5 text-zinc-400" />
      )}
      <span
        className={[
          'text-sm',
          sent
            ? 'text-zinc-700 dark:text-zinc-300'
            : 'text-zinc-400 dark:text-zinc-500',
        ].join(' ')}
      >
        {label}: {sent ? 'Yes' : 'No'}
      </span>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────── */

export default function AdminFulfillmentDetailPage() {
  const params = useParams();
  const auctionId = params?.auctionId as string;
  const apiUrl = auctionId ? adminFulfillmentDetailApiPath(auctionId) : null;

  const {
    data,
    error,
    isLoading,
  } = useSWR<AdminFulfillmentDetail>(apiUrl, adminFulfillmentDetailFetcher, {
    dedupingInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
        <span className="ml-2 text-sm text-zinc-500">Loading fulfillment detail…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
        <Link
          href={ADMIN_FULFILLMENT_PATH}
          className="inline-flex items-center gap-1 text-sm text-violet-600 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Fulfillment Audit
        </Link>
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <XCircle className="h-4 w-4 shrink-0" />
          {getApiErrorMessage(error) || 'Failed to load fulfillment detail.'}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasIntegrityWarning = isIntegrityWarning(data.integrity_status);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <Link
        href={ADMIN_FULFILLMENT_PATH}
        className="inline-flex items-center gap-1 text-sm text-violet-600 hover:underline dark:text-violet-400"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Fulfillment Audit
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Fulfillment — Auction #{data.auction_id}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {data.product_title}
          </p>
        </div>
        <LargeStatusBadge status={data.fulfillment_status} />
      </div>

      {/* Integrity Alert */}
      {hasIntegrityWarning && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Integrity Warning
            </p>
            <ul className="mt-1 space-y-0.5">
              {data.integrity_issues.map((issue, i) => (
                <li
                  key={i}
                  className="text-sm text-amber-700 dark:text-amber-300"
                >
                  • {issue}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Auction & Participants */}
        <Section
          title="Auction & Participants"
          icon={<Hash className="h-3.5 w-3.5" />}
          accent="bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300"
        >
          <MetaRow label="Auction ID" value={`#${data.auction_id}`} mono />
          <MetaRow label="Product" value={data.product_title} />
          <MetaRow label="Auction Status" value={data.auction_status} />
          <MetaRow
            label="Seller"
            value={
              <span className="flex items-center gap-1">
                <User className="h-3 w-3 text-zinc-400" />
                {data.seller_username} (#{data.seller_id})
              </span>
            }
          />
          <MetaRow
            label="Winner"
            value={
              data.winner_username ? (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3 text-zinc-400" />
                  {data.winner_username} (#{data.winner_id})
                </span>
              ) : (
                '—'
              )
            }
          />
        </Section>

        {/* Fulfillment Lifecycle */}
        <Section
          title="Fulfillment Lifecycle"
          icon={<FileText className="h-3.5 w-3.5" />}
          accent="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300"
        >
          <MetaRow
            label="Status"
            value={<LargeStatusBadge status={data.fulfillment_status} />}
          />
          <MetaRow
            label="Record ID"
            value={data.fulfillment_id ? `#${data.fulfillment_id}` : '—'}
            mono
          />
          <MetaRow
            label="Completed Step"
            value={data.completed_step ?? '—'}
          />
          <MetaRow
            label="Submitted At"
            value={formatTs(data.submitted_at)}
          />
          <MetaRow
            label="Created At"
            value={formatTs(data.fulfillment_created_at)}
          />
          <MetaRow
            label="Updated At"
            value={formatTs(data.fulfillment_updated_at)}
          />
        </Section>

        {/* Unlock Record */}
        <Section
          title="Unlock Record"
          icon={
            data.unlock_status === 'PAID' ? (
              <Unlock className="h-3.5 w-3.5" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )
          }
          accent={
            data.unlock_status === 'PAID'
              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
          }
        >
          {data.unlock_id ? (
            <>
              <MetaRow
                label="Unlock ID"
                value={`#${data.unlock_id}`}
                mono
              />
              <MetaRow
                label="Payment Status"
                value={getUnlockStatusLabel(data.unlock_status)}
              />
              <MetaRow
                label="Payment Gateway"
                value={data.payment_method || 'SSLCOMMERZ'}
              />
              <MetaRow
                label="Fee Amount"
                value={formatFulfillmentMoney(data.fee_amount)}
              />
              <MetaRow label="Currency" value={data.currency} />
              <MetaRow
                label="Payment Reference"
                value={data.payment_reference}
                mono
              />
              {data.card_type ? (
                <MetaRow label="Channel / Card" value={data.card_type} />
              ) : null}
              {data.val_id ? (
                <MetaRow label="SSLCommerz Val ID" value={data.val_id} mono />
              ) : null}
              {data.bank_tran_id ? (
                <MetaRow label="Bank Tran ID" value={data.bank_tran_id} mono />
              ) : null}
              <MetaRow label="Paid At" value={formatTs(data.paid_at)} />
              <MetaRow
                label="Unlocked At"
                value={formatTs(data.unlocked_at)}
              />
            </>
          ) : (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">
              No unlock record. Seller has not initiated unlock.
            </p>
          )}
        </Section>

        {/* Notification Audit */}
        <Section
          title="Notification Audit"
          icon={<Bell className="h-3.5 w-3.5" />}
          accent="bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"
        >
          {data.notification_audit ? (
            <>
              <NotifIndicator
                sent={data.notification_audit.details_ready_notified}
                label="Seller notified (details ready)"
              />
              <NotifIndicator
                sent={data.notification_audit.unlock_notified}
                label="Buyer notified (unlock)"
              />
              <MetaRow
                label="Details Updated Count"
                value={data.notification_audit.details_updated_count}
              />
              <MetaRow
                label="Latest Update Notification"
                value={formatTs(
                  data.notification_audit.details_updated_latest,
                )}
              />
            </>
          ) : (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">
              No notification data available.
            </p>
          )}
        </Section>
      </div>

      {/* Integrity Summary */}
      <Section
        title="Integrity Status"
        icon={<Shield className="h-3.5 w-3.5" />}
        accent={
          hasIntegrityWarning
            ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300'
            : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300'
        }
      >
        <div className="flex items-center gap-2">
          {hasIntegrityWarning ? (
            <>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                {data.integrity_issues.length} issue(s) detected
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                All integrity checks passed
              </span>
            </>
          )}
        </div>
        {data.integrity_issues.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-3 dark:border-zinc-800/40">
            {data.integrity_issues.map((issue, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400"
              >
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                {issue}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
