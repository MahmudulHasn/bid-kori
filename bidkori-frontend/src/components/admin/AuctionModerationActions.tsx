'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSWRConfig } from 'swr';
import { format } from 'date-fns';

import ModerationConfirmPanel from '@/components/admin/ModerationConfirmPanel';
import ModerationVisibilityBadge from '@/components/admin/ModerationVisibilityBadge';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  AUCTION_CANCEL_CONFIRM_POINTS,
  AUCTION_CANCEL_CONFIRM_TITLE,
  AUCTION_HIDE_CONFIRM_POINTS,
  AUCTION_HIDE_CONFIRM_TITLE,
  AUCTION_RESTORE_CONFIRM_POINTS,
  AUCTION_RESTORE_CONFIRM_TITLE,
  CANCELLED_AUCTION_TERMINAL_COPY,
  CLOSED_AUCTION_CANCEL_BLOCKED_COPY,
  PAID_AUCTION_CANCEL_BLOCKED_COPY,
  canOfferAdminAuctionCancel,
  formatAuctionPublicVisibilityNote,
  getAuctionCancelBlockedReason,
  getAuctionPublicVisibilityState,
  getAuctionVisibilityAction,
} from '@/lib/adminModeration';
import {
  cancelAdminAuction,
  hideAdminAuction,
  restoreAdminAuction,
} from '@/lib/adminModerationApi';
import { formatAdminAuctionStatusLabel } from '@/lib/adminAuctions';
import { AUCTIONS_LIST_API_PATH } from '@/lib/auctionsApi';
import type { Auction } from '@/lib/types';

type AuctionModerationActionsProps = {
  auction: Auction;
  detailKey: string;
  onAuctionPatched: (next: Auction) => void | Promise<void>;
};

function formatModeratedAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'MMM d, yyyy, h:mm a');
}

export default function AuctionModerationActions({
  auction,
  detailKey,
  onAuctionPatched,
}: AuctionModerationActionsProps) {
  const { mutate } = useSWRConfig();
  const visibilityAction = getAuctionVisibilityAction(auction);
  const canCancel = canOfferAdminAuctionCancel(auction);
  const cancelBlocked = getAuctionCancelBlockedReason(auction);
  const publicNote = formatAuctionPublicVisibilityNote(
    getAuctionPublicVisibilityState(auction),
  );

  const [phase, setPhase] = useState<'idle' | 'hide' | 'restore' | 'cancel'>(
    'idle',
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const revalidateRelated = async () => {
    await mutate(detailKey);
    await mutate(
      (key) =>
        typeof key === 'string' &&
        (key === AUCTIONS_LIST_API_PATH || key.startsWith('/auctions/')),
    );
  };

  const applyVisibilityState = async (state: {
    is_hidden: boolean;
    moderation_reason: string;
    moderated_at: string | null;
  }) => {
    const next: Auction = {
      ...auction,
      is_hidden: state.is_hidden,
      moderation_reason: state.moderation_reason,
      moderated_at: state.moderated_at,
    };
    await onAuctionPatched(next);
    await revalidateRelated();
  };

  const runHide = async (reason: string) => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const state = await hideAdminAuction(auction.id, reason);
      await applyVisibilityState(state);
      setPhase('idle');
      toast.success('Auction hidden from public marketplace.');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Unable to hide this auction.'));
      await revalidateRelated();
    } finally {
      setPending(false);
    }
  };

  const runRestore = async () => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const state = await restoreAdminAuction(auction.id);
      await applyVisibilityState(state);
      setPhase('idle');
      toast.success('Auction restored.');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Unable to restore this auction.'));
      await revalidateRelated();
    } finally {
      setPending(false);
    }
  };

  const runCancel = async (reason: string) => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const next = await cancelAdminAuction(auction.id, reason);
      await onAuctionPatched(next);
      await revalidateRelated();
      setPhase('idle');
      toast.success('Auction cancelled.');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Unable to cancel this auction.'));
      await revalidateRelated();
    } finally {
      setPending(false);
    }
  };

  const moderatedAtLabel = formatModeratedAt(auction.moderated_at);
  const reason = auction.moderation_reason?.trim();

  return (
    <section
      aria-labelledby="auction-moderation-heading"
      className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="auction-moderation-heading"
          className="text-base font-semibold text-zinc-900 dark:text-white"
        >
          Moderation
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <ModerationVisibilityBadge isHidden={auction.is_hidden} />
          <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
            <span className="sr-only">Lifecycle: </span>
            {formatAdminAuctionStatusLabel(auction.status)}
          </span>
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
          <dt className="text-zinc-500 dark:text-zinc-400">Visibility</dt>
          <dd className="font-medium text-zinc-900 dark:text-white">
            {auction.is_hidden === true ? 'Hidden' : 'Visible'}
          </dd>
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
          <dt className="text-zinc-500 dark:text-zinc-400">Lifecycle</dt>
          <dd className="font-medium text-zinc-900 dark:text-white">
            {formatAdminAuctionStatusLabel(auction.status)}
          </dd>
        </div>
        {publicNote ? (
          <div className="flex flex-col gap-1">
            <dt className="text-zinc-500 dark:text-zinc-400">
              Public eligibility
            </dt>
            <dd className="text-xs text-zinc-600 dark:text-zinc-400">
              {publicNote}
            </dd>
          </div>
        ) : null}
        {reason ? (
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">Reason</dt>
            <dd className="max-w-md font-medium text-zinc-900 dark:text-white">
              {reason}
            </dd>
          </div>
        ) : null}
        {moderatedAtLabel ? (
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">Moderated at</dt>
            <dd className="font-medium text-zinc-900 dark:text-white">
              {moderatedAtLabel}
            </dd>
          </div>
        ) : null}
      </dl>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {phase === 'hide' ? (
          <ModerationConfirmPanel
            title={AUCTION_HIDE_CONFIRM_TITLE}
            points={AUCTION_HIDE_CONFIRM_POINTS}
            confirmLabel="Confirm hide"
            pendingLabel="Hiding…"
            pending={pending}
            tone="amber"
            allowReason
            ariaLabel={`Hide auction ${auction.id} confirmation`}
            onCancel={() => setPhase('idle')}
            onConfirm={(r) => void runHide(r)}
          />
        ) : null}
        {phase === 'restore' ? (
          <ModerationConfirmPanel
            title={AUCTION_RESTORE_CONFIRM_TITLE}
            points={AUCTION_RESTORE_CONFIRM_POINTS}
            confirmLabel="Confirm restore"
            pendingLabel="Restoring…"
            pending={pending}
            tone="emerald"
            ariaLabel={`Restore auction ${auction.id} confirmation`}
            onCancel={() => setPhase('idle')}
            onConfirm={() => void runRestore()}
          />
        ) : null}
        {phase === 'cancel' ? (
          <ModerationConfirmPanel
            title={AUCTION_CANCEL_CONFIRM_TITLE}
            points={AUCTION_CANCEL_CONFIRM_POINTS}
            confirmLabel="Confirm cancel"
            pendingLabel="Cancelling…"
            pending={pending}
            tone="red"
            allowReason
            ariaLabel={`Cancel auction ${auction.id} confirmation`}
            onCancel={() => setPhase('idle')}
            onConfirm={(r) => void runCancel(r)}
          />
        ) : null}

        {phase === 'idle' ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              aria-label={
                visibilityAction === 'hide'
                  ? `Hide auction ${auction.id}`
                  : `Restore auction ${auction.id}`
              }
              onClick={() => {
                setError(undefined);
                setPhase(visibilityAction === 'hide' ? 'hide' : 'restore');
              }}
              className={[
                'inline-flex rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60',
                visibilityAction === 'hide'
                  ? 'border border-amber-300 text-amber-800 hover:bg-amber-50 focus-visible:outline-amber-500 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/40'
                  : 'border border-emerald-300 text-emerald-800 hover:bg-emerald-50 focus-visible:outline-emerald-500 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/40',
              ].join(' ')}
            >
              {visibilityAction === 'hide' ? 'Hide Auction' : 'Restore Auction'}
            </button>

            {canCancel ? (
              <button
                type="button"
                disabled={pending}
                aria-label={`Cancel auction ${auction.id}`}
                onClick={() => {
                  setError(undefined);
                  setPhase('cancel');
                }}
                className="inline-flex rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
              >
                Cancel Auction
              </button>
            ) : null}
          </div>
        ) : null}

        {!canCancel && phase === 'idle' ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {cancelBlocked === 'paid'
              ? PAID_AUCTION_CANCEL_BLOCKED_COPY
              : cancelBlocked === 'closed'
                ? CLOSED_AUCTION_CANCEL_BLOCKED_COPY
                : cancelBlocked === 'cancelled'
                  ? CANCELLED_AUCTION_TERMINAL_COPY
                  : null}
          </p>
        ) : null}
      </div>
    </section>
  );
}
