'use client';

import { useId, useState } from 'react';

import {
  MODERATION_REASON_MAX_LENGTH,
  normalizeModerationReason,
} from '@/lib/adminModeration';

type ModerationConfirmPanelProps = {
  title: string;
  points: readonly string[];
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  tone?: 'amber' | 'red' | 'emerald';
  allowReason?: boolean;
  reasonLabel?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  ariaLabel: string;
};

export default function ModerationConfirmPanel({
  title,
  points,
  confirmLabel,
  pendingLabel,
  pending,
  tone = 'amber',
  allowReason = false,
  reasonLabel = 'Reason (optional)',
  onCancel,
  onConfirm,
  ariaLabel,
}: ModerationConfirmPanelProps) {
  const reasonId = useId();
  const [reason, setReason] = useState('');

  const toneClasses =
    tone === 'red'
      ? 'border-red-200 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/20'
      : tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/20'
        : 'border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/20';

  const confirmTone =
    tone === 'red'
      ? 'bg-red-700 hover:bg-red-800 focus-visible:outline-red-500'
      : tone === 'emerald'
        ? 'bg-emerald-700 hover:bg-emerald-800 focus-visible:outline-emerald-500'
        : 'bg-amber-700 hover:bg-amber-800 focus-visible:outline-amber-500';

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`rounded-xl border px-3 py-3 sm:px-4 ${toneClasses}`}
    >
      <p className="text-sm font-semibold text-zinc-900 dark:text-white">
        {title}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-zinc-600 dark:text-zinc-400">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      {allowReason ? (
        <label className="mt-3 block space-y-1.5" htmlFor={reasonId}>
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {reasonLabel}
          </span>
          <textarea
            id={reasonId}
            value={reason}
            maxLength={MODERATION_REASON_MAX_LENGTH}
            disabled={pending}
            rows={3}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500/40 focus:ring-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
            {normalizeModerationReason(reason).length}/
            {MODERATION_REASON_MAX_LENGTH}
          </span>
        </label>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Back
        </button>
        <button
          type="button"
          disabled={pending}
          aria-busy={pending}
          onClick={() => onConfirm(normalizeModerationReason(reason))}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${confirmTone}`}
        >
          {pending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </div>
  );
}
