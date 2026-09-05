import api from '@/lib/api';
import {
  PRODUCT_CREATE_API_PATH,
  productUpdateApiPath,
  type ProductWritePayload,
} from '@/lib/seller';
import type { Product } from '@/lib/types';

/** SWR key / path for GET /api/products/my-listings/. */
export const MY_LISTINGS_API_PATH = '/products/my-listings/';

/** Collection path for GET list / POST create. */
export const PRODUCTS_COLLECTION_API_PATH = PRODUCT_CREATE_API_PATH;

export function unwrapProductList(data: unknown): Product[] {
  if (Array.isArray(data)) {
    return data as Product[];
  }
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { results?: unknown }).results)
  ) {
    return (data as { results: Product[] }).results;
  }
  return [];
}

export async function fetchMyProducts(): Promise<Product[]> {
  const { data } = await api.get<unknown>(MY_LISTINGS_API_PATH);
  return unwrapProductList(data);
}

export function buildProductDetailApiPath(id: string | number): string {
  return productUpdateApiPath(id);
}

export function buildProductUpdateApiPath(id: string | number): string {
  return buildProductDetailApiPath(id);
}

export async function fetchProduct(id: string | number): Promise<Product> {
  const { data } = await api.get<Product>(buildProductDetailApiPath(id));
  return data;
}

/** SWR-compatible fetcher for a product detail URL. */
export async function productDetailFetcher(url: string): Promise<Product> {
  const { data } = await api.get<Product>(url);
  return data;
}

/** SWR-compatible fetcher for `/products/my-listings/`. */
export async function myListingsFetcher(url: string): Promise<Product[]> {
  const { data } = await api.get<unknown>(url);
  return unwrapProductList(data);
}

/** SWR-compatible fetcher for `GET /products/` (full catalog; unpaginated MVP). */
export async function productListFetcher(url: string): Promise<Product[]> {
  const { data } = await api.get<unknown>(url);
  return unwrapProductList(data);
}

export async function createProduct(
  payload: ProductWritePayload,
): Promise<Product> {
  const { data } = await api.post<Product>(PRODUCT_CREATE_API_PATH, payload);
  return data;
}

export async function updateProduct(
  id: string | number,
  payload: ProductWritePayload,
): Promise<Product> {
  const { data } = await api.patch<Product>(productUpdateApiPath(id), payload);
  return data;
}

/**
 * Delete a Product that has no linked Auction (backend BE-A03).
 * Linked Products return a clean 400 — do not assume client eligibility.
 */
export async function deleteProduct(id: string | number): Promise<void> {
  await api.delete(productUpdateApiPath(id));
}
