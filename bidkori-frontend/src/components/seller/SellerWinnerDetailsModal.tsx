'use client';

import { AlertCircle, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  const formattedFee = formatUnlockFee(unlockFee, currency);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className="max-w-lg p-6 sm:rounded-3xl">
        <DialogHeader className="text-left">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500 shadow-2xs">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                Unlock Winner Details
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-xs sm:max-w-sm">
                {auctionTitle}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Unlocking grants persistent access to the winning buyer&apos;s fulfillment
            information for shipping and delivery.
          </p>

          <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
              What will become available:
            </p>
            <ul className="space-y-2 text-zinc-600 dark:text-zinc-400">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Buyer full name and verified phone number</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Delivery address (division, district, area, street)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Preferred contact method &amp; delivery instructions</span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-200">
            <div className="flex gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-sm text-amber-900 dark:text-amber-300">
                    SSLCOMMERZ Payment Gateway (Sandbox)
                  </p>
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    2% Fee
                  </span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  You will be securely redirected to the SSLCOMMERZ Sandbox payment gateway to complete the {Number(unlockFeePercent)}% unlock fee of{' '}
                  <span className="font-bold tabular-nums text-zinc-900 dark:text-white">{formattedFee}</span>
                  {totalAmount ? ` (calculated from winning bid ${formatUnlockFee(totalAmount, currency)})` : ''}.
                </p>
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Channels:</span>
                  <span className="rounded-md bg-white/80 dark:bg-zinc-800 px-1.5 py-0.5 border border-zinc-200/60 dark:border-zinc-700">bKash</span>
                  <span className="rounded-md bg-white/80 dark:bg-zinc-800 px-1.5 py-0.5 border border-zinc-200/60 dark:border-zinc-700">Nagad</span>
                  <span className="rounded-md bg-white/80 dark:bg-zinc-800 px-1.5 py-0.5 border border-zinc-200/60 dark:border-zinc-700">Cards (Visa/Mastercard)</span>
                  <span className="rounded-md bg-white/80 dark:bg-zinc-800 px-1.5 py-0.5 border border-zinc-200/60 dark:border-zinc-700">Internet Banking</span>
                </div>
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
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={() => void onConfirm()}
            disabled={loading}
            isLoading={loading}
            loadingText="Connecting to SSLCOMMERZ…"
            className="font-bold gap-2"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Pay {formattedFee} via SSLCOMMERZ</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
