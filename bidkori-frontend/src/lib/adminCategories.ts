/**
 * Pure models, routes, and validation for Admin Category Management.
 */

export const ADMIN_CATEGORIES_API_PATH = '/admin/categories/';
export const ADMIN_CATEGORIES_PATH = '/admin/categories';

export type AdminCategory = {
  id: number;
  name: string;
  slug: string;
  image?: string | null;
  product_count: number;
};

export type AdminCategoryInput = {
  name: string;
  slug?: string;
  image?: File | null;
};

export function buildAdminCategoryDetailApiPath(id: number): string {
  return `${ADMIN_CATEGORIES_API_PATH}${id}/`;
}

export function validateCategoryInput(input: AdminCategoryInput): {
  valid: boolean;
  error?: string;
} {
  const name = input.name.trim();
  if (!name) {
    return { valid: false, error: 'Category name is required.' };
  }
  if (name.length > 100) {
    return { valid: false, error: 'Category name must be 100 characters or fewer.' };
  }
  if (input.slug !== undefined) {
    const slug = input.slug.trim();
    if (slug && !/^[a-z0-9-]+$/.test(slug)) {
      return {
        valid: false,
        error: 'Slug may only contain lowercase letters, numbers, and hyphens.',
      };
    }
  }
  if (input.image instanceof File) {
    const maxBytes = 5 * 1024 * 1024;
    if (input.image.size > maxBytes) {
      return {
        valid: false,
        error: 'Category image must not exceed 5MB.',
      };
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (input.image.type && !allowedTypes.includes(input.image.type)) {
      return {
        valid: false,
        error: 'Category image must be JPEG, PNG, WEBP, or GIF.',
      };
    }
  }
  return { valid: true };
}

export function filterAdminCategories(
  categories: AdminCategory[],
  search: string,
): AdminCategory[] {
  const query = search.trim().toLowerCase();
  if (!query) return categories;
  return categories.filter(
    (cat) =>
      cat.name.toLowerCase().includes(query) ||
      cat.slug.toLowerCase().includes(query),
  );
}
