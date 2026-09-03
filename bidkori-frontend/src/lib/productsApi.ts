import api from '@/lib/api';
import type { Product } from '@/lib/types';

/** SWR key / path for GET /api/products/my-listings/. */
export const MY_LISTINGS_API_PATH = '/products/my-listings/';

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

/** SWR-compatible fetcher for `/products/my-listings/`. */
export async function myListingsFetcher(url: string): Promise<Product[]> {
  const { data } = await api.get<unknown>(url);
  return unwrapProductList(data);
}
