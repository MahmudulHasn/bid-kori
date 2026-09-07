'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  ADMIN_PROTECTED_ACCOUNT_COPY,
  ADMIN_USER_REACTIVATE_CONFIRM_POINTS,
  ADMIN_USER_REACTIVATE_CONFIRM_TITLE,
  ADMIN_USER_SUSPEND_CONFIRM_POINTS,
  ADMIN_USER_SUSPEND_CONFIRM_TITLE,
  getAdminUserAccountAction,
} from '@/lib/adminUsers';
import {
  reactivateAdminUser,
  suspendAdminUser,
} from '@/lib/adminUsersApi';
import type { AdminUser } from '@/lib/types';

type AdminUserStatusActionProps = {
  user: AdminUser;
  onUpdated: (user: AdminUser) => void | Promise<void>;
  /** Compact layout for table rows. */
  compact?: boolean;
};

export default function AdminUserStatusAction({
  user,
  onUpdated,
  compact = false,
}: AdminUserStatusActionProps) {
  const { user: currentUser } = useAuth();
  const action = getAdminUserAccountAction(user, currentUser);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  if (action == null) {
    if (compact) return null;
    return (
      <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        {ADMIN_PROTECTED_ACCOUNT_COPY}
      </p>
    );
  }

  const isSuspend = action === 'suspend';
  const title = isSuspend
    ? ADMIN_USER_SUSPEND_CONFIRM_TITLE
    : ADMIN_USER_REACTIVATE_CONFIRM_TITLE;
  const points = isSuspend
    ? ADMIN_USER_SUSPEND_CONFIRM_POINTS
    : ADMIN_USER_REACTIVATE_CONFIRM_POINTS;
  const triggerLabel = isSuspend ? 'Suspend' : 'Reactivate';
  const pendingLabel = isSuspend ? 'Suspending…' : 'Reactivating…';
  const confirmLabel = isSuspend ? 'Confirm suspend' : 'Confirm reactivate';

  const runAction = async () => {
    if (pending) return;
    setPending(true);
    try {
      const updated = isSuspend
        ? await suspendAdminUser(user.id)
        : await reactivateAdminUser(user.id);
      await onUpdated(updated);
      setConfirming(false);
      toast.success(
        isSuspend
          ? `${updated.username} is suspended.`
          : `${updated.username} is active again.`,
      );
    } catch (err: unknown) {
      toast.error(
        getApiErrorMessage(
          err,
          isSuspend
            ? 'Unable to suspend this user.'
            : 'Unable to reactivate this user.',
        ),
      );
    } finally {
      setPending(false);
    }
  };

  if (confirming) {
    return (
      <div
        role="group"
        aria-label={`${triggerLabel} confirmation for ${user.username}`}
        className={[
          'rounded-xl border px-3 py-3',
          isSuspend
            ? 'border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/20'
            : 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/20',
          compact ? 'max-w-xs text-left' : '',
        ].join(' ')}
      >
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
          {title}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-zinc-600 dark:text-zinc-400">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            aria-busy={pending}
            aria-label={`${confirmLabel} ${user.username}`}
            onClick={() => void runAction()}
            className={[
              'rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60',
              isSuspend
                ? 'bg-amber-700 hover:bg-amber-800 focus-visible:outline-amber-500'
                : 'bg-emerald-700 hover:bg-emerald-800 focus-visible:outline-emerald-500',
            ].join(' ')}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`${triggerLabel} ${user.username}`}
      onClick={() => setConfirming(true)}
      className={[
        'inline-flex rounded-lg px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60',
        isSuspend
          ? 'border border-amber-300 text-amber-800 hover:bg-amber-50 focus-visible:outline-amber-500 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/40'
          : 'border border-emerald-300 text-emerald-800 hover:bg-emerald-50 focus-visible:outline-emerald-500 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/40',
        compact ? '' : 'px-3 py-2 text-sm',
      ].join(' ')}
    >
      {triggerLabel}
    </button>
  );
}
