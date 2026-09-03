'use client';

import { useState, type FormEvent } from 'react';

import {
  PRODUCT_CONDITION_OPTIONS,
  validateProductForm,
  type ProductFormValues,
} from '@/lib/seller';

const fieldClassName =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-sky-500/40 focus:ring-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900';

export default function ProductForm({
  initialValues,
  submitting,
  submitLabel,
  submittingLabel,
  formError,
  fieldErrors,
  onSubmit,
}: {
  initialValues: ProductFormValues;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  formError?: string;
  fieldErrors?: Partial<Record<keyof ProductFormValues, string>>;
  onSubmit: (values: ProductFormValues) => void;
}) {
  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [clientErrors, setClientErrors] = useState<
    Partial<Record<keyof ProductFormValues, string>>
  >({});

  const titleError = fieldErrors?.title ?? clientErrors.title;
  const descriptionError = fieldErrors?.description ?? clientErrors.description;
  const conditionError = fieldErrors?.condition ?? clientErrors.condition;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const nextErrors = validateProductForm(values);
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

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Title
        </span>
        <input
          type="text"
          name="title"
          value={values.title}
          maxLength={255}
          disabled={submitting}
          aria-invalid={Boolean(titleError)}
          aria-describedby={titleError ? 'product-title-error' : undefined}
          onChange={(event) =>
            setValues((current) => ({ ...current, title: event.target.value }))
          }
          className={fieldClassName}
        />
        {titleError ? (
          <p id="product-title-error" className="text-sm text-red-700 dark:text-red-300">
            {titleError}
          </p>
        ) : null}
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Description
        </span>
        <textarea
          name="description"
          rows={5}
          value={values.description}
          disabled={submitting}
          aria-invalid={Boolean(descriptionError)}
          aria-describedby={descriptionError ? 'product-description-error' : undefined}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
          className={fieldClassName}
        />
        {descriptionError ? (
          <p
            id="product-description-error"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {descriptionError}
          </p>
        ) : null}
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Condition
        </span>
        <select
          name="condition"
          value={values.condition}
          disabled={submitting}
          aria-invalid={Boolean(conditionError)}
          aria-describedby={conditionError ? 'product-condition-error' : undefined}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              condition: event.target.value as ProductFormValues['condition'],
            }))
          }
          className={fieldClassName}
        >
          {PRODUCT_CONDITION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {conditionError ? (
          <p
            id="product-condition-error"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {conditionError}
          </p>
        ) : null}
      </label>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Auction pricing and dates are set later. Category is omitted until a
        category list API exists.
      </p>

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="inline-flex items-center justify-center rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}
