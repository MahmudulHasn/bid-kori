import api from '@/lib/api';
import {
  buildAdminUserDetailApiPath,
  buildAdminUserReactivateApiPath,
  buildAdminUserSuspendApiPath,
  buildAdminUsersApiPath,
  type AdminUsersListQuery,
} from '@/lib/adminUsers';
import type { AdminUser, PaginatedAdminUsers } from '@/lib/types';

export async function fetchAdminUsers(
  params: AdminUsersListQuery = {},
): Promise<PaginatedAdminUsers> {
  const { data } = await api.get<PaginatedAdminUsers>(
    buildAdminUsersApiPath(params),
  );
  return data;
}

export async function fetchAdminUser(id: string | number): Promise<AdminUser> {
  const { data } = await api.get<AdminUser>(buildAdminUserDetailApiPath(id));
  return data;
}

/** SWR-compatible fetcher for Admin Users list keys. */
export async function adminUsersListFetcher(
  url: string,
): Promise<PaginatedAdminUsers> {
  const { data } = await api.get<PaginatedAdminUsers>(url);
  return data;
}

/** SWR-compatible fetcher for Admin User detail keys. */
export async function adminUserDetailFetcher(url: string): Promise<AdminUser> {
  const { data } = await api.get<AdminUser>(url);
  return data;
}

export async function suspendAdminUser(id: string | number): Promise<AdminUser> {
  const { data } = await api.post<AdminUser>(
    buildAdminUserSuspendApiPath(id),
    {},
  );
  return data;
}

export async function reactivateAdminUser(
  id: string | number,
): Promise<AdminUser> {
  const { data } = await api.post<AdminUser>(
    buildAdminUserReactivateApiPath(id),
    {},
  );
  return data;
}
