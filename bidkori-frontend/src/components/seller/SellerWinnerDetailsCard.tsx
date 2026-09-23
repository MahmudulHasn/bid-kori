'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Unlock,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useSWR from 'swr';

import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  buildSellerWinnerDetailsPath,
  buildSellerWinnerDetailsStatusPath,
  canUnlockWinnerDetails,
  formatUnlockFee,
  isWinnerDetailsInProgress,
  isWinnerDetailsUnlocked,
  isWinnerDetailsWaitingForBuyer,
} from '@/lib/sellerWinnerDetails';
import {
  sellerUnlockedWinnerDetailsFetcher,
  sellerWinnerDetailsStatusFetcher,
  unlockSellerWinnerDetails,
} from '@/lib/sellerWinnerDetailsApi';
import SellerWinnerDetailsModal from './SellerWinnerDetailsModal';

export interface SellerWinnerDetailsCardProps {
  auctionId: number;
  auctionTitle?: string;
  compact?: boolean;
}

export default function SellerWinnerDetailsCard({
  auctionId,
  auctionTitle = 'Auction',
}: SellerWinnerDetailsCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  // SWR status fetcher (Zero PII)
  const statusKey = auctionId ? buildSellerWinnerDetailsStatusPath(auctionId) : null;
  const {
    data: status,
    error: statusError,
    isLoading: statusLoading,
    mutate: mutateStatus,
  } = useSWR(statusKey, sellerWinnerDetailsStatusFetcher);

  const isUnlocked = isWinnerDetailsUnlocked(status);

  // SWR details fetcher (Only executed after entitlement is verified)
  const detailsKey =
    auctionId && isUnlocked ? buildSellerWinnerDetailsPath(auctionId) : null;
  const {
    data: details,
    error: detailsError,
    isLoading: detailsLoading,
    mutate: mutateDetails,
  } = useSWR(detailsKey, sellerUnlockedWinnerDetailsFetcher);

  const handleUnlockConfirm = async () => {
    setUnlocking(true);
    setUnlockError(null);

    try {
      const response = await unlockSellerWinnerDetails(auctionId);
      setModalOpen(false);
      await mutateStatus();
      if (response.already_unlocked) {
        toast.success('Winner details already unlocked.');
      } else {
        toast.success('Winner details unlocked successfully.');
      }
    } catch (err: unknown) {
      const message = getApiErrorMessage(
        err,
        'Unable to complete unlock. Please try again.',
      );
      setUnlockError(message);
      toast.error(message);
      // Revalidate status in case backend state changed
      void mutateStatus();
    } finally {
      setUnlocking(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'phone' | 'address') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'phone') {
        setCopiedPhone(true);
        setTimeout(() => setCopiedPhone(false), 2000);
        toast.success('Phone number copied.');
      } else {
        setCopiedAddress(true);
        setTimeout(() => setCopiedAddress(false), 2000);
        toast.success('Address copied.');
      }
    } catch {
      toast.error('Failed to copy to clipboard.');
    }
  };

  // Loading state
  if (statusLoading && !status) {
    return (
      <div
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        aria-busy="true"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          <div className="space-y-1.5 flex-1">
            <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        </div>
      </div>
    );
  }

  // Error loading status
  if (statusError) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
      >
        <div className="flex items-center justify-between gap-3">
          <p>
            {getApiErrorMessage(
              statusError,
              'Unable to load winner-details status.',
            )}
          </p>
          <button
            type="button"
            onClick={() => void mutateStatus()}
            className="rounded-lg border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // No winner state
  if (!status?.winner_exists) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
        <p className="font-medium text-zinc-700 dark:text-zinc-300">Winner Details</p>
        <p className="mt-0.5 text-xs">No winning bidder for this auction.</p>
      </div>
    );
  }

  // State A: NOT_STARTED
  if (isWinnerDetailsWaitingForBuyer(status)) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <Clock className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Winner Fulfillment
                </h3>
                <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  Waiting for Buyer
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                The winning Buyer has not started their fulfillment details yet.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // State B: DRAFT
  if (isWinnerDetailsInProgress(status)) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
              <RefreshCw className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Winner Fulfillment
                </h3>
                <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                  In Progress
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Winner details are being completed by the Buyer and are not ready to unlock yet.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // State C: COMPLETED + LOCKED
  if (canUnlockWinnerDetails(status)) {
    const feeDisplay = formatUnlockFee(status.unlock_fee, status.currency);

    return (
      <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-white to-sky-50/30 p-5 shadow-sm dark:border-sky-950/60 dark:from-zinc-900 dark:to-sky-950/10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Winner Fulfillment
                </h3>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" />
                  Ready to Unlock
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-md">
                Buyer completed fulfillment details. Pay the fixed 2% unlock fee ({feeDisplay}) to reveal their contact and delivery address to arrange shipping.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-1.5 shrink-0">
            <div className="text-left sm:text-right">
              <span className="text-[11px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Unlock Fee (2% Fixed)
              </span>
              <p className="text-base font-semibold tabular-nums text-zinc-900 dark:text-white">
                {feeDisplay}
              </p>
              {status.total_amount ? (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                  2% of {formatUnlockFee(status.total_amount, status.currency)} winning bid
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => {
                setUnlockError(null);
                setModalOpen(true);
              }}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:bg-sky-500 dark:hover:bg-sky-400"
            >
              <Unlock className="h-3.5 w-3.5" />
              <span>Unlock Winner Details</span>
            </button>
          </div>
        </div>

        <SellerWinnerDetailsModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onConfirm={handleUnlockConfirm}
          auctionTitle={auctionTitle}
          unlockFee={status.unlock_fee}
          totalAmount={status.total_amount}
          unlockFeePercent={status.unlock_fee_percent}
          currency={status.currency}
          loading={unlocking}
          error={unlockError}
        />
      </div>
    );
  }

  // State D: COMPLETED + UNLOCKED
  if (isUnlocked) {
    if (detailsLoading && !details) {
      return (
        <div
          className="rounded-2xl border border-emerald-200/80 bg-white p-5 shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900"
          aria-busy="true"
        >
          <div className="h-6 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800 mb-4" />
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        </div>
      );
    }

    if (detailsError) {
      return (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <div className="flex items-center justify-between gap-3">
            <p>
              {getApiErrorMessage(
                detailsError,
                'Unable to load unlocked winner details.',
              )}
            </p>
            <button
              type="button"
              onClick={() => void mutateDetails()}
              className="rounded-lg border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    if (!details) return null;

    const fullAddress = [
      details.address_line,
      details.area,
      details.district,
      details.division,
      details.postal_code ? `Postal: ${details.postal_code}` : null,
    ]
      .filter(Boolean)
      .join(', ');

    return (
      <article className="rounded-2xl border border-emerald-200/80 bg-emerald-50/20 p-5 shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900/80">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 pb-3.5 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Winner Fulfillment
                </h3>
                <span className="inline-flex items-center rounded-md bg-emerald-100/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Unlocked ✓
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Buyer fulfillment information for delivery and contact.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void mutateDetails()}
            title="Refresh fulfillment details"
            aria-label="Refresh fulfillment details"
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <RefreshCw className="h-3 w-3" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </header>

        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Contact Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              <User className="h-3.5 w-3.5" />
              <span>Contact Information</span>
            </div>

            <div className="rounded-xl border border-zinc-200/80 bg-white p-3.5 space-y-2 dark:border-zinc-800 dark:bg-zinc-900">
              <div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Full Name</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {details.full_name}
                  {details.buyer_username ? (
                    <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      (@{details.buyer_username})
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="pt-1 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">Phone</p>
                  <a
                    href={`tel:${details.phone}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300 tabular-nums"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    <span>{details.phone}</span>
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => void copyToClipboard(details.phone, 'phone')}
                  aria-label="Copy phone number"
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  {copiedPhone ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>

              {details.email ? (
                <div className="pt-1">
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">Email</p>
                  <a
                    href={`mailto:${details.email}`}
                    className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline dark:text-sky-300 break-all"
                  >
                    <Mail className="h-3 w-3" />
                    <span>{details.email}</span>
                  </a>
                </div>
              ) : null}

              <div className="pt-1">
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Preferred Contact</p>
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 capitalize">
                  {details.preferred_contact_method.toLowerCase()}
                </p>
              </div>
            </div>
          </div>

          {/* Delivery Address Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              <MapPin className="h-3.5 w-3.5" />
              <span>Delivery Address</span>
            </div>

            <div className="rounded-xl border border-zinc-200/80 bg-white p-3.5 space-y-2 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">
                    {details.address_line}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                    {[details.area, details.district, details.division]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  {details.postal_code ? (
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">
                      Postal Code: {details.postal_code}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void copyToClipboard(fullAddress, 'address')}
                  aria-label="Copy full delivery address"
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  {copiedAddress ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>

              {details.delivery_note ? (
                <div className="mt-3 rounded-lg bg-zinc-50 p-2.5 text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
                  <p className="font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-1 mb-1">
                    <MessageSquare className="h-3 w-3" />
                    Delivery Note:
                  </p>
                  <p className="italic">&ldquo;{details.delivery_note}&rdquo;</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <footer className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
          <span>
            {details.updated_at
              ? `Last updated: ${format(new Date(details.updated_at), 'MMM d, yyyy, h:mm a')}`
              : 'Details verified'}
          </span>
          <span className="text-zinc-400">Read-only authorized access</span>
        </footer>
      </article>
    );
  }

  return null;
}
