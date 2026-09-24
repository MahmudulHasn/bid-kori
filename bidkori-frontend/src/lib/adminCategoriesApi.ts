import api from '@/lib/api';
import {
  ADMIN_CATEGORIES_API_PATH,
  buildAdminCategoryDetailApiPath,
  type AdminCategory,
  type AdminCategoryInput,
} from './adminCategories';

export async function adminCategoriesListFetcher(
  url: string = ADMIN_CATEGORIES_API_PATH,
): Promise<AdminCategory[]> {
  const { data } = await api.get<AdminCategory[]>(url);
  return Array.isArray(data) ? data : [];
}

export async function createAdminCategory(
  input: AdminCategoryInput,
): Promise<AdminCategory> {
  if (input.image instanceof File) {
    const formData = new FormData();
    formData.append('name', input.name.trim());
    if (input.slug?.trim()) {
      formData.append('slug', input.slug.trim());
    }
    formData.append('image', input.image);
    const { data } = await api.post<AdminCategory>(
      ADMIN_CATEGORIES_API_PATH,
      formData,
    );
    return data;
  }
  const payload: Record<string, string> = { name: input.name.trim() };
  if (input.slug?.trim()) {
    payload.slug = input.slug.trim();
  }
  const { data } = await api.post<AdminCategory>(
    ADMIN_CATEGORIES_API_PATH,
    payload,
  );
  return data;
}

export async function updateAdminCategory(
  id: number,
  input: Partial<AdminCategoryInput>,
): Promise<AdminCategory> {
  if (input.image !== undefined) {
    const formData = new FormData();
    if (input.name !== undefined) {
      formData.append('name', input.name.trim());
    }
    if (input.slug !== undefined) {
      formData.append('slug', input.slug.trim());
    }
    if (input.image instanceof File) {
      formData.append('image', input.image);
    } else if (input.image === null) {
      formData.append('image', '');
    }
    const { data } = await api.patch<AdminCategory>(
      buildAdminCategoryDetailApiPath(id),
      formData,
    );
    return data;
  }
  const { data } = await api.patch<AdminCategory>(
    buildAdminCategoryDetailApiPath(id),
    input,
  );
  return data;
}

export async function deleteAdminCategory(
  id: number,
): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>(
    buildAdminCategoryDetailApiPath(id),
  );
  return data;
}
