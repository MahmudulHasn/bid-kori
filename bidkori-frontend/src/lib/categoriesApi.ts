import api from '@/lib/api';
import {
  CATEGORIES_API_PATH,
  unwrapCategoryList,
} from '@/lib/categories';
import type { Category } from '@/lib/types';

export { CATEGORIES_API_PATH };

/** Fetch the public Category catalog (read-only). */
export async function fetchCategories(): Promise<Category[]> {
  const { data } = await api.get<unknown>(CATEGORIES_API_PATH);
  return unwrapCategoryList(data);
}

/** SWR-compatible fetcher for `GET /categories/`. */
export async function categoriesFetcher(url: string): Promise<Category[]> {
  const { data } = await api.get<unknown>(url);
  return unwrapCategoryList(data);
}
