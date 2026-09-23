'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Lock, ShieldCheck, X } from 'lucide-react';
import { formatUnlockFee } from '@/lib/sellerWinnerDetails';

export interface SellerWinnerDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  auctionTitle: string;
  unlockFee: string;
  totalAmount?: string;
  unlockFeePercent?: string;
  currency?: string;
  loading?: boolean;
  error?: string | null;
}

export default function SellerWinnerDetailsModal({
  isOpen,
  onClose,
  onConfirm,
  auctionTitle,
  unlockFee,
  totalAmount,
  unlockFeePercent = '2.00',
  currency = 'BDT',
  loading = false,
  error = null,
}: SellerWinnerDetailsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      // Focus confirm button when dialog opens
      setTimeout(() => {
        confirmButtonRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formattedFee = formatUnlockFee(unlockFee, currency);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlock-dialog-title"
      aria-describedby="unlock-dialog-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="unlock-dialog-title"
                className="text-lg font-semibold text-zinc-900 dark:text-white"
              >
                Unlock Winner Details
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-xs sm:max-w-sm">
                {auctionTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div id="unlock-dialog-desc" className="mt-4 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Unlocking grants persistent access to the winning buyer&apos;s fulfillment
            information for shipping and delivery.
          </p>

          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-800/50">
            <p className="font-medium text-zinc-700 dark:text-zinc-200 mb-2">
              What will become available:
            </p>
            <ul className="space-y-1.5 text-zinc-600 dark:text-zinc-400">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Buyer full name and verified phone number</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Delivery address (division, district, area, street)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Preferred contact method &amp; delivery instructions</span>
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Mock / Internal Payment Mode</p>
                <p>
                  This development version uses BidKori&apos;s internal mock payment
                  flow. Confirming will unlock the winner details for a fixed {Number(unlockFeePercent)}% fee of{' '}
                  <span className="font-bold tabular-nums">{formattedFee}</span>
                  {totalAmount ? ` (calculated from winning amount ${formatUnlockFee(totalAmount, currency)})` : ''}.
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            <span>Use the winner&apos;s contact and delivery information only for fulfilling this auction.</span>
          </p>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={() => void onConfirm()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-sky-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-500 dark:hover:bg-sky-400"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Unlocking...
              </span>
            ) : (
              `Confirm Unlock — ${formattedFee}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
