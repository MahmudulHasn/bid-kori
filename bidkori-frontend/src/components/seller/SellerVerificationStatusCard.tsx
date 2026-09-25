'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  Clock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { SellerVerificationRecord, SellerVerificationStatus } from '@/lib/types';
import SellerVerificationModal from './SellerVerificationModal';

type SellerVerificationStatusCardProps = {
  status: SellerVerificationStatus;
  verificationRecord?: SellerVerificationRecord | null;
  onRefresh?: () => void;
  className?: string;
};

export default function SellerVerificationStatusCard({
  status,
  verificationRecord,
  onRefresh,
  className = '',
}: SellerVerificationStatusCardProps) {
  const [modalOpen, setModalOpen] = useState(false);

  if (status === 'APPROVED') {
    return (
      <div
        className={`rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 dark:border-emerald-900/40 dark:bg-emerald-950/20 ${className}`}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
              Verified Seller Account
            </h3>
            <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
              Your identity has been verified. You have full access to list products and host auctions.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'PENDING') {
    return (
      <div
        className={`rounded-2xl border border-amber-200 bg-amber-50/70 p-6 dark:border-amber-900/40 dark:bg-amber-950/20 ${className}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-amber-900 dark:text-amber-200">
                  Verification Under Review
                </h3>
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                  PENDING
                </span>
              </div>
              <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-300/80">
                Your NID/Passport documents have been submitted and are being reviewed by the administration team.
                You will be notified once approved so you can begin publishing listings.
              </p>
              {verificationRecord?.submitted_at && (
                <p className="mt-2 text-xs text-amber-700/70 dark:text-amber-400/70">
                  Submitted: {new Date(verificationRecord.submitted_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex shrink-0 items-center gap-1.5 self-start sm:self-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 shadow-sm transition hover:bg-amber-50 dark:border-amber-700 dark:bg-zinc-800 dark:text-amber-200 dark:hover:bg-zinc-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Check Status
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status === 'REJECTED') {
    return (
      <>
        <div
          className={`rounded-2xl border border-rose-200 bg-rose-50/70 p-6 dark:border-rose-900/40 dark:bg-rose-950/20 ${className}`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-rose-900 dark:text-rose-200">
                    Verification Not Approved
                  </h3>
                  <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[11px] font-semibold text-rose-800 dark:text-rose-300">
                    REJECTED
                  </span>
                </div>
                <p className="mt-1 text-sm text-rose-800/80 dark:text-rose-300/80">
                  Your verification documents were not approved by the admin team.
                </p>
                {verificationRecord?.admin_note && (
                  <div className="mt-2 rounded-lg bg-rose-100/60 p-2.5 text-xs text-rose-900 dark:bg-rose-900/30 dark:text-rose-200">
                    <span className="font-semibold">Reason from Admin:</span>{' '}
                    {verificationRecord.admin_note}
                  </div>
                )}
                <p className="mt-2 text-xs text-rose-700/70 dark:text-rose-400/70">
                  Please update your information or upload a clearer photo of your official document.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 self-start sm:self-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-rose-500 active:scale-95"
            >
              <ShieldAlert className="h-4 w-4" />
              Resubmit Verification
            </button>
          </div>
        </div>

        <SellerVerificationModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            setModalOpen(false);
            if (onRefresh) onRefresh();
          }}
          initialWhatsapp={verificationRecord?.whatsapp_number || ''}
          initialLocation={verificationRecord?.location || ''}
        />
      </>
    );
  }

  // Unverified (never submitted)
  return (
    <>
      <div
        className={`rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                  Seller Verification Required
                </h3>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  ACTION REQUIRED
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                To keep BidKori safe and trustworthy, new sellers must complete a quick verification
                with their NID/Passport, WhatsApp, and location before adding their first product.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 self-start sm:self-center rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-zinc-900 shadow-md transition hover:bg-amber-400 active:scale-95 dark:bg-amber-400 dark:hover:bg-amber-300"
          >
            <ShieldCheck className="h-4 w-4" />
            Verify Account Now
          </button>
        </div>
      </div>

      <SellerVerificationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setModalOpen(false);
          if (onRefresh) onRefresh();
        }}
      />
    </>
  );
}
