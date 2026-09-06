'use client';

import Image from 'next/image';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import toast from 'react-hot-toast';

import { getApiErrorMessage } from '@/lib/apiErrors';
import { resolveMediaUrl } from '@/lib/media';
import {
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_MAX_COUNT,
  PRODUCT_IMAGE_MAX_PER_REQUEST,
  formatFileSizeLabel,
  getDefaultProductImage,
  isProductImageFreezeError,
  productImageRemainingCapacity,
  validateProductImageSelection,
} from '@/lib/productImageSafety';
import {
  deleteProductImage,
  uploadProductImages,
} from '@/lib/productImagesApi';
import type { Product, ProductImage } from '@/lib/types';

type UploadPhase = 'idle' | 'selected' | 'uploading' | 'error';

type PreviewItem = {
  key: string;
  file: File;
  url: string;
};

function revokePreviews(items: readonly PreviewItem[]) {
  for (const item of items) {
    URL.revokeObjectURL(item.url);
  }
}

export default function ProductPhotosSection({
  product,
  canMutate,
  onChanged,
}: {
  product: Product;
  /** Owner + unfrozen Product — mirrors metadata edit eligibility. */
  canMutate: boolean;
  onChanged: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [error, setError] = useState<string>();
  const [frozenByRace, setFrozenByRace] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const images = product.images ?? [];
  const editable = canMutate && !frozenByRace;
  const remaining = productImageRemainingCapacity(product);
  const defaultImage = getDefaultProductImage(product);
  const title = product.title.trim() ? product.title : 'Product';
  const mainUrl = resolveMediaUrl(defaultImage?.image);

  useEffect(() => {
    return () => {
      revokePreviews(previews);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke only on unmount
  }, []);

  const clearSelection = () => {
    setPreviews((current) => {
      revokePreviews(current);
      return [];
    });
    setPhase('idle');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []);
    setError(undefined);
    if (nextFiles.length === 0) {
      clearSelection();
      return;
    }
    const validation = validateProductImageSelection(nextFiles, product);
    if (!validation.ok) {
      setError(validation.error);
      setPhase('error');
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      return;
    }
    setPreviews((current) => {
      revokePreviews(current);
      return nextFiles.map((file, index) => ({
        key: `${file.name}-${file.size}-${file.lastModified}-${index}`,
        file,
        url: URL.createObjectURL(file),
      }));
    });
    setPhase('selected');
  };

  const removePreview = (key: string) => {
    setPreviews((current) => {
      const target = current.find((item) => item.key === key);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      const next = current.filter((item) => item.key !== key);
      if (next.length === 0) {
        setPhase('idle');
        if (inputRef.current) {
          inputRef.current.value = '';
        }
      }
      return next;
    });
    setError(undefined);
  };

  const handleUpload = async () => {
    if (!editable || phase === 'uploading' || previews.length === 0) return;
    const files = previews.map((item) => item.file);
    const validation = validateProductImageSelection(files, product);
    if (!validation.ok) {
      setError(validation.error);
      setPhase('error');
      return;
    }
    setPhase('uploading');
    setError(undefined);
    try {
      await uploadProductImages(product.id, files);
      await onChanged();
      toast.success(
        files.length === 1 ? 'Photo uploaded.' : 'Photos uploaded.',
      );
      clearSelection();
    } catch (err: unknown) {
      if (isProductImageFreezeError(err)) {
        setFrozenByRace(true);
        setError(
          getApiErrorMessage(
            err,
            'Product images cannot be changed after the linked auction has started or received bids.',
          ),
        );
        await onChanged();
        setPhase('error');
        return;
      }
      setError(getApiErrorMessage(err, 'We could not upload these photos.'));
      setPhase('error');
    }
  };

  const handleDelete = async (image: ProductImage) => {
    if (!editable || deletingId != null) return;
    setDeletingId(image.id);
    setError(undefined);
    try {
      await deleteProductImage(product.id, image.id);
      await onChanged();
      toast.success('Photo deleted.');
      setConfirmDeleteId(null);
    } catch (err: unknown) {
      if (isProductImageFreezeError(err)) {
        setFrozenByRace(true);
        setError(
          getApiErrorMessage(
            err,
            'Product images cannot be changed after the linked auction has started or received bids.',
          ),
        );
        await onChanged();
      } else {
        setError(getApiErrorMessage(err, 'We could not delete this photo.'));
      }
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section
      aria-labelledby="product-photos-heading"
      className="space-y-4"
    >
      <div
        className="relative flex min-h-40 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
      >
        {mainUrl ? (
          <Image
            src={mainUrl}
            alt={`${title} main photo`}
            width={960}
            height={540}
            unoptimized
            className="h-auto max-h-72 w-full object-contain"
          />
        ) : (
          <p
            className="px-4 text-center text-sm text-zinc-500 dark:text-zinc-400"
            role="img"
            aria-label="No product photos yet"
          >
            No product photos yet.
            {editable ? ' Upload up to 5 photos.' : null}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="product-photos-heading"
            className="text-base font-semibold text-zinc-900 dark:text-white"
          >
            Product Photos
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {images.length} of {PRODUCT_IMAGE_MAX_COUNT} photos
            {editable
              ? remaining > 0
                ? ` · ${remaining} remaining`
                : ' · capacity reached'
              : null}
          </p>
        </div>

        {!editable ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Photos are locked once the linked auction starts or receives bids.
          </p>
        ) : null}

        {images.length > 0 ? (
          <ul
            className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"
            aria-label="Product photo gallery"
          >
            {images.map((image, index) => {
              const url = resolveMediaUrl(image.image);
              const isMain = index === 0;
              return (
                <li
                  key={image.id}
                  className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {url ? (
                    <Image
                      src={url}
                      alt={`${title} photo ${index + 1}`}
                      width={320}
                      height={240}
                      unoptimized
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center text-xs text-zinc-500">
                      Unavailable
                    </div>
                  )}
                  {isMain ? (
                    <span className="absolute left-2 top-2 rounded bg-zinc-950/70 px-2 py-0.5 text-xs font-medium text-white">
                      Main photo
                    </span>
                  ) : null}
                  {editable ? (
                    <div className="p-2">
                      {confirmDeleteId === image.id ? (
                        <div
                          role="group"
                          aria-label={`Confirm delete photo ${index + 1}`}
                          className="space-y-2"
                        >
                          <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            Delete this photo permanently?
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={deletingId === image.id}
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-800 transition hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-zinc-700 dark:text-zinc-100"
                            >
                              Keep
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === image.id}
                              aria-busy={deletingId === image.id}
                              aria-label={`Confirm delete photo ${index + 1} of ${title}`}
                              onClick={() => void handleDelete(image)}
                              className="rounded-lg bg-red-700 px-2 py-1 text-xs font-semibold text-white transition hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:opacity-60"
                            >
                              {deletingId === image.id
                                ? 'Deleting…'
                                : 'Delete'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={deletingId != null}
                          aria-label={`Delete photo ${index + 1} of ${title}`}
                          onClick={() => setConfirmDeleteId(image.id)}
                          className="w-full rounded-lg border border-red-300 px-2 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            {editable
              ? 'No product photos yet. Upload up to 5 photos.'
              : 'No product photos yet.'}
          </p>
        )}

        {editable ? (
          <div className="mt-5 space-y-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900">
                <span>Choose Photos</span>
                <input
                  ref={inputRef}
                  type="file"
                  name="product_images"
                  accept={PRODUCT_IMAGE_ACCEPT}
                  multiple
                  disabled={phase === 'uploading' || remaining === 0}
                  className="sr-only"
                  onChange={handleSelect}
                />
              </label>
              <button
                type="button"
                disabled={
                  phase === 'uploading' ||
                  previews.length === 0 ||
                  remaining === 0
                }
                aria-busy={phase === 'uploading'}
                onClick={() => void handleUpload()}
                className="inline-flex items-center justify-center rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {phase === 'uploading' ? 'Uploading…' : 'Upload Photos'}
              </button>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              JPEG, PNG, WEBP, or GIF. Up to {PRODUCT_IMAGE_MAX_PER_REQUEST}{' '}
              files per upload, 5MB each. MIME checks are for convenience only —
              the server validates files.
            </p>

            {previews.length > 0 ? (
              <ul
                className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                aria-label="Selected photos ready to upload"
              >
                {previews.map((item) => (
                  <li
                    key={item.key}
                    className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                    <img
                      src={item.url}
                      alt={`Preview of ${item.file.name}`}
                      className="aspect-[4/3] w-full object-cover"
                    />
                    <div className="space-y-2 p-2">
                      <p className="truncate text-xs text-zinc-700 dark:text-zinc-300">
                        {item.file.name}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatFileSizeLabel(item.file.size)}
                      </p>
                      <button
                        type="button"
                        disabled={phase === 'uploading'}
                        aria-label={`Remove ${item.file.name} from selection`}
                        onClick={() => removePreview(item.key)}
                        className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-4 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
