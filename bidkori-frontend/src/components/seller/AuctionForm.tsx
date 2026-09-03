'use client';

import { useState, type FormEvent } from 'react';

import {
  validateAuctionForm,
  type AuctionFormField,
  type AuctionFormValues,
} from '@/lib/auctionCreateContract';
import { formatSellerProductCondition } from '@/lib/seller';
import type { Product } from '@/lib/types';

const fieldClassName =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-sky-500/40 focus:ring-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900';

export default function AuctionForm({
  selectedProduct,
  initialValues,
  submitting,
  submitLabel,
  submittingLabel,
  formError,
  fieldErrors,
  onSubmit,
}: {
  selectedProduct: Product | null;
  initialValues: AuctionFormValues;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  formError?: string;
  fieldErrors?: Partial<Record<AuctionFormField, string>>;
  onSubmit: (values: AuctionFormValues) => void;
}) {
  const [values, setValues] = useState<AuctionFormValues>(initialValues);
  const [clientErrors, setClientErrors] = useState<
    Partial<Record<AuctionFormField, string>>
  >({});

  const errorFor = (field: AuctionFormField) =>
    fieldErrors?.[field] ?? clientErrors[field];

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const nextErrors = validateAuctionForm(
      values,
      selectedProduct?.id ?? null,
    );
    setClientErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {formError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {formError}
        </div>
      ) : null}

      <section
        aria-labelledby="auction-product-context-heading"
        className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2
          id="auction-product-context-heading"
          className="text-sm font-semibold text-zinc-900 dark:text-white"
        >
          Selected product
        </h2>
        {selectedProduct ? (
          <dl className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            <div className="flex justify-between gap-3">
              <dt>Title</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                {selectedProduct.title.trim()
                  ? selectedProduct.title
                  : 'Untitled product'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Condition</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {formatSellerProductCondition(selectedProduct.condition)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Choose a product above before configuring auction terms.
          </p>
        )}
        {errorFor('product') ? (
          <p
            id="auction-product-error"
            className="mt-2 text-sm text-red-700 dark:text-red-300"
            role="alert"
          >
            {errorFor('product')}
          </p>
        ) : null}
      </section>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Starting Bid
        </span>
        <input
          type="text"
          name="starting_bid"
          inputMode="decimal"
          autoComplete="off"
          value={values.starting_bid}
          disabled={submitting}
          aria-invalid={Boolean(errorFor('starting_bid'))}
          aria-describedby={
            errorFor('starting_bid') ? 'auction-starting-bid-error' : undefined
          }
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              starting_bid: event.target.value,
            }))
          }
          className={fieldClassName}
        />
        {errorFor('starting_bid') ? (
          <p
            id="auction-starting-bid-error"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {errorFor('starting_bid')}
          </p>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Amount in your marketplace currency (for example 1000.00).
          </p>
        )}
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Minimum Bid Increment
        </span>
        <input
          type="text"
          name="min_increment"
          inputMode="decimal"
          autoComplete="off"
          value={values.min_increment}
          disabled={submitting}
          aria-invalid={Boolean(errorFor('min_increment'))}
          aria-describedby={
            errorFor('min_increment') ? 'auction-min-increment-error' : undefined
          }
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              min_increment: event.target.value,
            }))
          }
          className={fieldClassName}
        />
        {errorFor('min_increment') ? (
          <p
            id="auction-min-increment-error"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {errorFor('min_increment')}
          </p>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Prefills the platform default of 100.00.
          </p>
        )}
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Reserve Price{' '}
          <span className="font-normal text-zinc-500">(optional)</span>
        </span>
        <input
          type="text"
          name="reserve_price"
          inputMode="decimal"
          autoComplete="off"
          value={values.reserve_price}
          disabled={submitting}
          aria-invalid={Boolean(errorFor('reserve_price'))}
          aria-describedby={
            errorFor('reserve_price')
              ? 'auction-reserve-error'
              : 'auction-reserve-help'
          }
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              reserve_price: event.target.value,
            }))
          }
          className={fieldClassName}
        />
        {errorFor('reserve_price') ? (
          <p
            id="auction-reserve-error"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {errorFor('reserve_price')}
          </p>
        ) : (
          <p
            id="auction-reserve-help"
            className="text-xs text-zinc-500 dark:text-zinc-400"
          >
            Optional minimum final bid required for the auction to result in a
            winner. Not shown on public marketplace pages.
          </p>
        )}
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Start Time
          </span>
          <input
            type="datetime-local"
            name="start_time"
            value={values.start_time}
            disabled={submitting}
            aria-invalid={Boolean(errorFor('start_time'))}
            aria-describedby={
              errorFor('start_time') ? 'auction-start-error' : undefined
            }
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                start_time: event.target.value,
              }))
            }
            className={fieldClassName}
          />
          {errorFor('start_time') ? (
            <p
              id="auction-start-error"
              className="text-sm text-red-700 dark:text-red-300"
            >
              {errorFor('start_time')}
            </p>
          ) : null}
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            End Time
          </span>
          <input
            type="datetime-local"
            name="end_time"
            value={values.end_time}
            disabled={submitting}
            aria-invalid={Boolean(errorFor('end_time'))}
            aria-describedby={
              errorFor('end_time') ? 'auction-end-error' : undefined
            }
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                end_time: event.target.value,
              }))
            }
            className={fieldClassName}
          />
          {errorFor('end_time') ? (
            <p
              id="auction-end-error"
              className="text-sm text-red-700 dark:text-red-300"
            >
              {errorFor('end_time')}
            </p>
          ) : null}
        </label>
      </div>

      <button
        type="submit"
        disabled={submitting || !selectedProduct}
        aria-busy={submitting}
        className="inline-flex items-center justify-center rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}
