/**
 * Pure Category helpers for Seller Product forms (CAT-F01).
 * REST returns category as PK; catalog is a separate public list.
 */

import type { Category } from './types.ts';

export const CATEGORIES_API_PATH = '/categories/';

/** Empty select value meaning null category on write. */
export const CATEGORY_EMPTY_SELECT_VALUE = '';

export type CategoryCatalogStatus =
  | 'loading'
  | 'error'
  | 'empty'
  | 'ready';

export function unwrapCategoryList(data: unknown): Category[] {
  if (Array.isArray(data)) {
    return data.filter(isCategoryRow);
  }
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { results?: unknown }).results)
  ) {
    return (data as { results: unknown[] }).results.filter(isCategoryRow);
  }
  return [];
}

function isCategoryRow(value: unknown): value is Category {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'number' &&
    Number.isFinite(row.id) &&
    typeof row.name === 'string' &&
    typeof row.slug === 'string'
  );
}

/**
 * Parse a `<select>` value into a Product.category PK or null.
 * Empty / invalid → null (category is optional).
 */
export function parseCategoryValue(
  raw: string | null | undefined,
): number | null {
  if (raw == null || raw === CATEGORY_EMPTY_SELECT_VALUE) {
    return null;
  }
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return null;
  }
  return n;
}

/** Select value for the current form category (empty string = null). */
export function categorySelectValue(
  categoryId: number | null | undefined,
): string {
  if (categoryId == null || !Number.isFinite(categoryId) || categoryId <= 0) {
    return CATEGORY_EMPTY_SELECT_VALUE;
  }
  return String(Math.trunc(categoryId));
}

export function resolveCategoryLabel(
  categoryId: number | null | undefined,
  categories: readonly Category[],
): string {
  if (categoryId == null || !Number.isFinite(categoryId) || categoryId <= 0) {
    return 'None';
  }
  const found = categories.find((row) => row.id === categoryId);
  if (found?.name?.trim()) {
    return found.name.trim();
  }
  return `Category #${Math.trunc(categoryId)}`;
}

export function getCategoryCatalogStatus(
  categories: readonly Category[] | undefined,
  error: unknown,
  isLoading: boolean,
): CategoryCatalogStatus {
  if (isLoading && categories == null) return 'loading';
  if (error && categories == null) return 'error';
  if (Array.isArray(categories) && categories.length === 0) return 'empty';
  if (Array.isArray(categories) && categories.length > 0) return 'ready';
  if (isLoading) return 'loading';
  if (error) return 'error';
  return 'empty';
}

/**
 * Options for the category `<select>`, including a fallback for a product
 * category missing from the live catalog (stale ID — do not invent names).
 */
export function buildCategorySelectOptions(
  categories: readonly Category[],
  selectedId: number | null | undefined,
): { value: string; label: string }[] {
  const options = categories.map((row) => ({
    value: String(row.id),
    label: row.name,
  }));
  if (
    selectedId != null &&
    Number.isFinite(selectedId) &&
    selectedId > 0 &&
    !categories.some((row) => row.id === selectedId)
  ) {
    options.unshift({
      value: String(Math.trunc(selectedId)),
      label: `Category #${Math.trunc(selectedId)} (unavailable)`,
    });
  }
  return options;
}

/** True when the Product form may offer category edits (matches other fields). */
export function isProductCategoryFieldEditable(productEditable: boolean): boolean {
  return productEditable;
}
