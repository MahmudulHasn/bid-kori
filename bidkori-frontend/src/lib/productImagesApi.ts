import api from '@/lib/api';
import {
  buildProductImageDeleteApiPath,
  buildProductImagesApiPath,
  buildProductImagesFormData,
} from '@/lib/productImageSafety';
import type { ProductImage } from '@/lib/types';

export {
  buildProductImageDeleteApiPath,
  buildProductImagesApiPath,
  PRODUCT_IMAGE_UPLOAD_FIELD,
} from '@/lib/productImageSafety';

/** SWR-compatible fetcher for GET /products/<id>/images/. */
export async function productImagesFetcher(
  url: string,
): Promise<ProductImage[]> {
  const { data } = await api.get<unknown>(url);
  return Array.isArray(data) ? (data as ProductImage[]) : [];
}

export async function fetchProductImages(
  productId: string | number,
): Promise<ProductImage[]> {
  const { data } = await api.get<unknown>(buildProductImagesApiPath(productId));
  return Array.isArray(data) ? (data as ProductImage[]) : [];
}

/**
 * Upload Product images via multipart POST.
 * Field name must be `images`. Response is a ProductImage list.
 * Does not mutate `files`.
 */
export async function uploadProductImages(
  productId: string | number,
  files: readonly File[],
): Promise<ProductImage[]> {
  const formData = buildProductImagesFormData(files);
  const { data } = await api.post<ProductImage[]>(
    buildProductImagesApiPath(productId),
    formData,
  );
  return Array.isArray(data) ? data : [];
}

export async function deleteProductImage(
  productId: string | number,
  imageId: string | number,
): Promise<void> {
  await api.delete(buildProductImageDeleteApiPath(productId, imageId));
}
