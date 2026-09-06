'use client';

import { useState, type FormEvent } from 'react';
import useSWR from 'swr';

import {
  buildCategorySelectOptions,
  categorySelectValue,
  CATEGORY_EMPTY_SELECT_VALUE,
  getCategoryCatalogStatus,
  parseCategoryValue,
} from '@/lib/categories';
import {
  CATEGORIES_API_PATH,
  categoriesFetcher,
} from '@/lib/categoriesApi';
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
  fieldsDisabled = false,
  onSubmit,
}: {
  initialValues: ProductFormValues;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  formError?: string;
  fieldErrors?: Partial<Record<keyof ProductFormValues, string>>;
  /** When true (e.g. frozen product), all fields including category stay disabled. */
  fieldsDisabled?: boolean;
  onSubmit: (values: ProductFormValues) => void;
}) {
  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [clientErrors, setClientErrors] = useState<
    Partial<Record<keyof ProductFormValues, string>>
  >({});

  const {
    data: categories,
    error: categoriesError,
    isLoading: categoriesLoading,
    mutate: retryCategories,
  } = useSWR(CATEGORIES_API_PATH, categoriesFetcher, {
    revalidateOnFocus: false,
  });

  const catalogStatus = getCategoryCatalogStatus(
    categories,
    categoriesError,
    categoriesLoading,
  );
  const categoryOptions = buildCategorySelectOptions(
    categories ?? [],
    values.category,
  );

  const titleError = fieldErrors?.title ?? clientErrors.title;
  const descriptionError = fieldErrors?.description ?? clientErrors.description;
  const conditionError = fieldErrors?.condition ?? clientErrors.condition;
  const categoryError = fieldErrors?.category ?? clientErrors.category;

  const controlsDisabled = submitting || fieldsDisabled;
  const categorySelectDisabled =
    controlsDisabled || catalogStatus === 'loading';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || fieldsDisabled) return;
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
          disabled={controlsDisabled}
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
          disabled={controlsDisabled}
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
          disabled={controlsDisabled}
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

      <div className="block space-y-1.5">
        <label
          htmlFor="product-category"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Category
        </label>
        <select
          id="product-category"
          name="category"
          value={categorySelectValue(values.category)}
          disabled={categorySelectDisabled}
          aria-invalid={Boolean(categoryError)}
          aria-describedby={
            [
              categoryError ? 'product-category-error' : null,
              'product-category-help',
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              category: parseCategoryValue(event.target.value),
            }))
          }
          className={fieldClassName}
        >
          <option value={CATEGORY_EMPTY_SELECT_VALUE}>
            No category
          </option>
          {categoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {categoryError ? (
          <p
            id="product-category-error"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {categoryError}
          </p>
        ) : null}
        <p
          id="product-category-help"
          className="text-xs text-zinc-500 dark:text-zinc-400"
        >
          {catalogStatus === 'loading'
            ? 'Loading categories…'
            : catalogStatus === 'error'
              ? 'Unable to load categories. You can continue without selecting one.'
              : catalogStatus === 'empty'
                ? 'No categories available.'
                : 'Optional. Auction pricing and dates are set later.'}
        </p>
        {catalogStatus === 'error' ? (
          <button
            type="button"
            onClick={() => void retryCategories()}
            className="text-xs font-medium text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
          >
            Retry loading categories
          </button>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={controlsDisabled}
        aria-busy={submitting}
        className="inline-flex items-center justify-center rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}
