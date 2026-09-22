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
  const { data } = await api.post<AdminCategory>(
    ADMIN_CATEGORIES_API_PATH,
    input,
  );
  return data;
}

export async function updateAdminCategory(
  id: number,
  input: Partial<AdminCategoryInput>,
): Promise<AdminCategory> {
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
