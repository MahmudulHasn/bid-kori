/**
 * Seller Product image client validation and path helpers (IMG-F01).
 * Backend Pillow validation remains authoritative.
 */

import type { Product, ProductImage } from './types.ts';

export const PRODUCT_IMAGE_UPLOAD_METHOD = 'POST';
export const PRODUCT_IMAGE_DELETE_METHOD = 'DELETE';
export const PRODUCT_IMAGE_UPLOAD_FIELD = 'images';

/** Defaults mirrored from products/image_validation.py / settings. */
export const PRODUCT_IMAGE_MAX_COUNT = 5;
export const PRODUCT_IMAGE_MAX_PER_REQUEST = 5;
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif';

export const PRODUCT_IMAGE_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export function buildProductImagesApiPath(
  productId: string | number,
): string {
  return `/products/${productId}/images/`;
}

export function buildProductImageDeleteApiPath(
  productId: string | number,
  imageId: string | number,
): string {
  return `/products/${productId}/images/${imageId}/`;
}

export function productImageRemainingCapacity(
  product: Pick<Product, 'images'> | null | undefined,
): number {
  const existing = product?.images?.length ?? 0;
  return Math.max(0, PRODUCT_IMAGE_MAX_COUNT - existing);
}

export type ProductImageClientValidationResult = {
  ok: boolean;
  error?: string;
};

/**
 * UX-only file checks before upload. Does not mutate `files`.
 * One invalid file fails the whole batch (all-or-nothing).
 */
export function validateProductImageSelection(
  files: readonly File[],
  product: Pick<Product, 'images'> | null | undefined,
): ProductImageClientValidationResult {
  const selected = [...files];
  if (selected.length === 0) {
    return { ok: false, error: 'Choose at least one image to upload.' };
  }
  if (selected.length > PRODUCT_IMAGE_MAX_PER_REQUEST) {
    return {
      ok: false,
      error: `Upload at most ${PRODUCT_IMAGE_MAX_PER_REQUEST} images per request.`,
    };
  }
  const remaining = productImageRemainingCapacity(product);
  if (selected.length > remaining) {
    return {
      ok: false,
      error:
        remaining === 0
          ? `This product already has ${PRODUCT_IMAGE_MAX_COUNT} images (maximum).`
          : `This product can accept ${remaining} more image${remaining === 1 ? '' : 's'} (max ${PRODUCT_IMAGE_MAX_COUNT}).`,
    };
  }
  for (const file of selected) {
    if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
      return {
        ok: false,
        error: `"${file.name}" exceeds the ${PRODUCT_IMAGE_MAX_BYTES / (1024 * 1024)}MB size limit.`,
      };
    }
    const mime = (file.type || '').toLowerCase();
    if (
      mime &&
      !PRODUCT_IMAGE_ALLOWED_MIME_TYPES.includes(
        mime as (typeof PRODUCT_IMAGE_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      return {
        ok: false,
        error: `"${file.name}" is not a supported image type (JPEG, PNG, WEBP, GIF).`,
      };
    }
  }
  return { ok: true };
}

export function buildProductImagesFormData(
  files: readonly File[],
): FormData {
  const formData = new FormData();
  for (const file of files) {
    formData.append(PRODUCT_IMAGE_UPLOAD_FIELD, file);
  }
  return formData;
}

/** First image by backend order is the display / future-AI default. */
export function getDefaultProductImage(
  product: Pick<Product, 'images'> | null | undefined,
): ProductImage | null {
  const images = product?.images;
  if (!images?.length) return null;
  return images[0] ?? null;
}

export function isProductImageFreezeError(error: unknown): boolean {
  const data = (error as { response?: { data?: { error?: unknown } } })?.response
    ?.data;
  const raw = data?.error;
  const message =
    typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw.join(' ')
        : typeof raw === 'object' && raw
          ? JSON.stringify(raw)
          : '';
  const normalized = message.toLowerCase();
  return (
    normalized.includes('product images cannot be changed') ||
    (normalized.includes('can no longer be edited') &&
      normalized.includes('auction'))
  );
}

export function formatFileSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.ceil(bytes / 1024)} KB`;
}
