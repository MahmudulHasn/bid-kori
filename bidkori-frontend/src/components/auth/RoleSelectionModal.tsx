'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Gavel, Store, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PublicRegistrationRole } from '@/lib/types';
import { MOTION_DURATIONS, MOTION_EASINGS } from '@/lib/motionTokens';

interface RoleSelectionModalProps {
  email?: string;
  name?: string;
  isOpen: boolean;
  onSelectRole: (role: PublicRegistrationRole) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function RoleSelectionModal({
  email,
  name,
  isOpen,
  onSelectRole,
  onCancel,
  isLoading = false,
}: RoleSelectionModalProps) {
  const [selectedRole, setSelectedRole] = useState<PublicRegistrationRole>('BUYER');
  const prefersReduced = useReducedMotion();

  if (!isOpen) return null;

  const handleSubmit = async () => {
    await onSelectRole(selectedRole);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-modal-title"
      aria-describedby="role-modal-desc"
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={prefersReduced ? false : { opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{
          duration: MOTION_DURATIONS.normal,
          ease: MOTION_EASINGS.easeOutCubic,
        }}
        className="relative w-full max-w-md rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#0B0F1A] sm:p-8"
      >
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
            <ShieldCheck className="h-6 w-6" aria-hidden />
          </div>
          <h2
            id="role-modal-title"
            className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-2xl"
          >
            How will you use BidKori?
          </h2>
          <p
            id="role-modal-desc"
            className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400"
          >
            {name ? `Welcome, ${name}! ` : ''}Select your account type to complete registration with {email || 'Google'}.
          </p>
        </div>

        {/* Role options: Buyer or Seller (strictly no Admin) */}
        <div className="mt-6 space-y-3">
          {/* Buyer option */}
          <button
            type="button"
            role="radio"
            aria-checked={selectedRole === 'BUYER'}
            onClick={() => setSelectedRole('BUYER')}
            disabled={isLoading}
            className={`group flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-all ${
              selectedRole === 'BUYER'
                ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30 dark:bg-amber-500/15'
                : 'border-zinc-200 bg-zinc-50/50 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700'
            }`}
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                selectedRole === 'BUYER'
                  ? 'bg-amber-500 text-zinc-950 font-bold'
                  : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              <Gavel className="h-5 w-5" aria-hidden />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-zinc-900 dark:text-white">
                  Buyer Account
                </span>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    selectedRole === 'BUYER' ? 'bg-amber-500' : 'bg-transparent'
                  }`}
                />
              </div>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Browse auctions, place live bids, and win verified products.
              </p>
            </div>
          </button>

          {/* Seller option */}
          <button
            type="button"
            role="radio"
            aria-checked={selectedRole === 'SELLER'}
            onClick={() => setSelectedRole('SELLER')}
            disabled={isLoading}
            className={`group flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-all ${
              selectedRole === 'SELLER'
                ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30 dark:bg-amber-500/15'
                : 'border-zinc-200 bg-zinc-50/50 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700'
            }`}
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                selectedRole === 'SELLER'
                  ? 'bg-amber-500 text-zinc-950 font-bold'
                  : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              <Store className="h-5 w-5" aria-hidden />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-zinc-900 dark:text-white">
                  Seller Account
                </span>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    selectedRole === 'SELLER' ? 'bg-amber-500' : 'bg-transparent'
                  }`}
                />
              </div>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                List catalog items, launch live auctions, and manage payouts.
              </p>
            </div>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleSubmit}
            isLoading={isLoading}
            loadingText="Creating account..."
            className="w-full sm:w-auto gap-2 font-bold"
          >
            <span>Continue as {selectedRole === 'BUYER' ? 'Buyer' : 'Seller'}</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
