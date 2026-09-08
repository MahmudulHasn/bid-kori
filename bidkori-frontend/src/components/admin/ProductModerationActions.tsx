'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSWRConfig } from 'swr';
import { format } from 'date-fns';

import ModerationConfirmPanel from '@/components/admin/ModerationConfirmPanel';
import ModerationVisibilityBadge from '@/components/admin/ModerationVisibilityBadge';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  PRODUCT_HIDE_CONFIRM_POINTS,
  PRODUCT_HIDE_CONFIRM_TITLE,
  PRODUCT_RESTORE_CONFIRM_POINTS,
  PRODUCT_RESTORE_CONFIRM_TITLE,
  getProductModerationAction,
} from '@/lib/adminModeration';
import {
  hideAdminProduct,
  restoreAdminProduct,
} from '@/lib/adminModerationApi';
import { PRODUCTS_COLLECTION_API_PATH } from '@/lib/productsApi';
import type { Product } from '@/lib/types';

type ProductModerationActionsProps = {
  product: Product;
  detailKey: string;
  onProductPatched: (next: Product) => void | Promise<void>;
};

function formatModeratedAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'MMM d, yyyy, h:mm a');
}

export default function ProductModerationActions({
  product,
  detailKey,
  onProductPatched,
}: ProductModerationActionsProps) {
  const { mutate } = useSWRConfig();
  const action = getProductModerationAction(product);
  const [phase, setPhase] = useState<'idle' | 'confirm'>('idle');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const revalidateCatalog = async () => {
    await mutate(PRODUCTS_COLLECTION_API_PATH);
    await mutate(detailKey);
  };

  const applyModerationState = async (state: {
    is_hidden: boolean;
    moderation_reason: string;
    moderated_at: string | null;
  }) => {
    const next: Product = {
      ...product,
      is_hidden: state.is_hidden,
      moderation_reason: state.moderation_reason,
      moderated_at: state.moderated_at,
    };
    await onProductPatched(next);
    await revalidateCatalog();
  };

  const runHide = async (reason: string) => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const state = await hideAdminProduct(product.id, reason);
      await applyModerationState(state);
      setPhase('idle');
      toast.success('Product hidden from public marketplace.');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Unable to hide this product.'));
      await revalidateCatalog();
    } finally {
      setPending(false);
    }
  };

  const runRestore = async () => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const state = await restoreAdminProduct(product.id);
      await applyModerationState(state);
      setPhase('idle');
      toast.success('Product restored.');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Unable to restore this product.'));
      await revalidateCatalog();
    } finally {
      setPending(false);
    }
  };

  const moderatedAtLabel = formatModeratedAt(product.moderated_at);
  const reason = product.moderation_reason?.trim();

  return (
    <section
      aria-labelledby="product-moderation-heading"
      className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="product-moderation-heading"
          className="text-base font-semibold text-zinc-900 dark:text-white"
        >
          Moderation
        </h2>
        <ModerationVisibilityBadge isHidden={product.is_hidden} />
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
          <dt className="text-zinc-500 dark:text-zinc-400">Visibility</dt>
          <dd className="font-medium text-zinc-900 dark:text-white">
            {product.is_hidden === true ? 'Hidden' : 'Visible'}
          </dd>
        </div>
        {reason ? (
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">Reason</dt>
            <dd className="max-w-md text-right font-medium text-zinc-900 dark:text-white sm:text-left">
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

      <div className="mt-4">
        {phase === 'confirm' ? (
          action === 'hide' ? (
            <ModerationConfirmPanel
              title={PRODUCT_HIDE_CONFIRM_TITLE}
              points={PRODUCT_HIDE_CONFIRM_POINTS}
              confirmLabel="Confirm hide"
              pendingLabel="Hiding…"
              pending={pending}
              tone="amber"
              allowReason
              ariaLabel={`Hide product ${product.id} confirmation`}
              onCancel={() => setPhase('idle')}
              onConfirm={(r) => void runHide(r)}
            />
          ) : (
            <ModerationConfirmPanel
              title={PRODUCT_RESTORE_CONFIRM_TITLE}
              points={PRODUCT_RESTORE_CONFIRM_POINTS}
              confirmLabel="Confirm restore"
              pendingLabel="Restoring…"
              pending={pending}
              tone="emerald"
              ariaLabel={`Restore product ${product.id} confirmation`}
              onCancel={() => setPhase('idle')}
              onConfirm={() => void runRestore()}
            />
          )
        ) : (
          <button
            type="button"
            disabled={pending}
            aria-label={
              action === 'hide'
                ? `Hide product ${product.title}`
                : `Restore product ${product.title}`
            }
            onClick={() => {
              setError(undefined);
              setPhase('confirm');
            }}
            className={[
              'inline-flex rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60',
              action === 'hide'
                ? 'border border-amber-300 text-amber-800 hover:bg-amber-50 focus-visible:outline-amber-500 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/40'
                : 'border border-emerald-300 text-emerald-800 hover:bg-emerald-50 focus-visible:outline-emerald-500 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/40',
            ].join(' ')}
          >
            {action === 'hide' ? 'Hide Product' : 'Restore Product'}
          </button>
        )}
      </div>
    </section>
  );
}
