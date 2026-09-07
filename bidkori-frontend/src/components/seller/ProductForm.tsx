'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import toast from 'react-hot-toast';
import useSWR from 'swr';

import {
  AI_DRAFT_DISCLOSURE,
  AI_IMAGE_NOT_AUTO_UPLOADED_HELP,
  AI_LISTING_IMAGE_ACCEPT,
  canGenerateAiListingDescription,
  descriptionNeedsOverwriteConfirmation,
  getAiListingErrorMessage,
  shouldApplyAiDraftDirectly,
  validateAiListingImage,
} from '@/lib/aiListing';
import { generateProductDescription } from '@/lib/aiListingApi';
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
import { formatFileSizeLabel } from '@/lib/productImageSafety';
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

  const aiFileInputRef = useRef<HTMLInputElement>(null);
  const [aiImage, setAiImage] = useState<File | null>(null);
  const [aiPreviewUrl, setAiPreviewUrl] = useState<string | null>(null);
  const [aiImageError, setAiImageError] = useState<string>();
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiStatusError, setAiStatusError] = useState<string>();
  const [pendingAiDraft, setPendingAiDraft] = useState<string | null>(null);
  const [showAiDraftDisclosure, setShowAiDraftDisclosure] = useState(false);

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
  const formEditable = !controlsDisabled;
  const categorySelectDisabled =
    controlsDisabled || catalogStatus === 'loading';

  const canGenerate = canGenerateAiListingDescription({
    title: values.title,
    image: aiImage,
    generating: aiGenerating,
    formEditable,
  });

  useEffect(() => {
    return () => {
      if (aiPreviewUrl) {
        URL.revokeObjectURL(aiPreviewUrl);
      }
    };
  }, [aiPreviewUrl]);

  const clearAiImage = () => {
    setAiImage(null);
    setAiPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setAiImageError(undefined);
    if (aiFileInputRef.current) {
      aiFileInputRef.current.value = '';
    }
  };

  const handleAiImageSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setAiStatusError(undefined);
    setPendingAiDraft(null);
    if (!file) {
      clearAiImage();
      return;
    }
    const validation = validateAiListingImage(file);
    if (!validation.ok) {
      clearAiImage();
      setAiImageError(validation.error);
      return;
    }
    setAiImageError(undefined);
    setAiImage(file);
    setAiPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  };

  const applyAiDraft = (draft: string) => {
    setValues((current) => ({ ...current, description: draft }));
    setPendingAiDraft(null);
    setShowAiDraftDisclosure(true);
    setAiStatusError(undefined);
  };

  const handleGenerate = async () => {
    if (!canGenerate || !aiImage || aiGenerating) return;
    setAiStatusError(undefined);
    setPendingAiDraft(null);

    const validation = validateAiListingImage(aiImage);
    if (!validation.ok) {
      setAiImageError(validation.error);
      return;
    }

    setAiGenerating(true);
    try {
      const result = await generateProductDescription({
        title: values.title.trim(),
        image: aiImage,
        condition: values.condition,
        category: values.category,
      });
      if (shouldApplyAiDraftDirectly(values.description)) {
        applyAiDraft(result.description);
      } else {
        setPendingAiDraft(result.description);
      }
    } catch (error: unknown) {
      const message = getAiListingErrorMessage(error);
      setAiStatusError(message);
      toast.error(message);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || fieldsDisabled) return;
    const nextErrors = validateProductForm(values);
    setClientErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit(values);
  };

  const titleHelpId = !values.title.trim()
    ? 'product-ai-title-help'
    : undefined;
  const imageHelpId = !aiImage ? 'product-ai-image-help' : undefined;

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
          aria-describedby={
            [
              descriptionError ? 'product-description-error' : null,
              showAiDraftDisclosure ? 'product-ai-draft-disclosure' : null,
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          onChange={(event) => {
            setShowAiDraftDisclosure(false);
            setValues((current) => ({
              ...current,
              description: event.target.value,
            }));
          }}
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
        {showAiDraftDisclosure ? (
          <p
            id="product-ai-draft-disclosure"
            className="text-xs text-zinc-500 dark:text-zinc-400"
          >
            {AI_DRAFT_DISCLOSURE}
          </p>
        ) : null}
      </label>

      {!fieldsDisabled ? (
        <section
          aria-labelledby="product-ai-assistant-heading"
          className="space-y-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-950/40"
        >
          <div className="space-y-1">
            <h2
              id="product-ai-assistant-heading"
              className="text-sm font-semibold text-zinc-800 dark:text-zinc-200"
            >
              Generate description with AI
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Optional assistant. Uses your title, photo, and optional
              condition/category. You can still write the description manually.
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {AI_IMAGE_NOT_AUTO_UPLOADED_HELP}
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="product-ai-image"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Product photo for AI
            </label>
            <input
              ref={aiFileInputRef}
              id="product-ai-image"
              type="file"
              accept={AI_LISTING_IMAGE_ACCEPT}
              disabled={controlsDisabled || aiGenerating}
              onChange={handleAiImageSelect}
              aria-describedby={
                [imageHelpId, aiImageError ? 'product-ai-image-error' : null]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-200 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-800 hover:file:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-200 dark:hover:file:bg-zinc-700"
            />
            {!aiImage ? (
              <p
                id="product-ai-image-help"
                className="text-xs text-zinc-500 dark:text-zinc-400"
              >
                Select a product photo first.
              </p>
            ) : null}
            {aiImageError ? (
              <p
                id="product-ai-image-error"
                role="alert"
                className="text-sm text-red-700 dark:text-red-300"
              >
                {aiImageError}
              </p>
            ) : null}
          </div>

          {aiImage && aiPreviewUrl ? (
            <div className="flex flex-wrap items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img
                src={aiPreviewUrl}
                alt="Selected product photo for AI description"
                className="h-20 w-20 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm text-zinc-700 dark:text-zinc-300">
                  {aiImage.name}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatFileSizeLabel(aiImage.size)}
                </p>
                <button
                  type="button"
                  onClick={clearAiImage}
                  disabled={aiGenerating}
                  className="text-xs font-medium text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-sky-300"
                >
                  Remove photo
                </button>
              </div>
            </div>
          ) : null}

          {!values.title.trim() ? (
            <p
              id="product-ai-title-help"
              className="text-xs text-zinc-500 dark:text-zinc-400"
            >
              Add a product title first.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={!canGenerate}
              aria-busy={aiGenerating}
              aria-describedby={
                [titleHelpId, imageHelpId].filter(Boolean).join(' ') ||
                undefined
              }
              className="inline-flex items-center justify-center rounded-lg border border-sky-700 bg-white px-4 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-400 dark:bg-transparent dark:text-sky-200 dark:hover:bg-sky-950/40"
            >
              {aiGenerating ? 'Generating…' : 'Generate with AI'}
            </button>
          </div>

          {aiStatusError ? (
            <p
              role="alert"
              className="text-sm text-red-700 dark:text-red-300"
            >
              {aiStatusError}
            </p>
          ) : null}

          {pendingAiDraft &&
          descriptionNeedsOverwriteConfirmation(values.description) ? (
            <div
              role="region"
              aria-labelledby="product-ai-overwrite-heading"
              className="space-y-3 rounded-lg border border-zinc-300 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-900"
            >
              <div className="space-y-1">
                <h3
                  id="product-ai-overwrite-heading"
                  className="text-sm font-semibold text-zinc-900 dark:text-white"
                >
                  Replace your current description with the AI-generated draft?
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  AI-generated draft
                </p>
                <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                  {pendingAiDraft}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyAiDraft(pendingAiDraft)}
                  className="inline-flex rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setPendingAiDraft(null)}
                  className="inline-flex rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Keep current
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

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
