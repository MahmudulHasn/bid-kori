/**
 * Admin Users directory helpers (ADM-F09).
 * Account control is Suspend/Reactivate only — no edit/delete/role mutation.
 */

import type { AdminUser, AuthUser, UserRole } from './types.ts';

export const ADMIN_USERS_PATH = '/admin/users';
export const ADMIN_USERS_API_PATH = '/admin/users/';
export const ADMIN_USERS_PAGE_SIZE = 20;

export const ADMIN_USERS_READONLY_IDENTITY_COPY =
  'User identity fields are read-only. Suspend and Reactivate control marketplace access only.';

export const ADMIN_PROTECTED_ACCOUNT_COPY =
  'Admin accounts are managed outside marketplace user controls.';

export const ADMIN_USER_SUSPEND_CONFIRM_TITLE = 'Suspend this user?';

export const ADMIN_USER_SUSPEND_CONFIRM_POINTS = [
  'They will lose access to authenticated BidKori features.',
  'Their existing login token will be revoked.',
  'Their Products, Auctions, and Bids will remain.',
] as const;

export const ADMIN_USER_REACTIVATE_CONFIRM_TITLE = 'Reactivate this user?';

export const ADMIN_USER_REACTIVATE_CONFIRM_POINTS = [
  'They will regain account access but must log in again.',
] as const;

/** Documented Admin Users HTTP surface for this phase. */
export const ADMIN_USER_ALLOWED_METHODS = ['GET', 'POST'] as const;

export type AdminUserRoleFilter = 'all' | UserRole;
export type AdminUserStatusFilter = 'all' | 'active' | 'suspended';
export type AdminUserAccountAction = 'suspend' | 'reactivate' | null;

export const ADMIN_USER_ROLE_OPTIONS: {
  id: AdminUserRoleFilter;
  label: string;
}[] = [
  { id: 'all', label: 'All roles' },
  { id: 'BUYER', label: 'Buyer' },
  { id: 'SELLER', label: 'Seller' },
  { id: 'ADMIN', label: 'Admin' },
];

export const ADMIN_USER_STATUS_OPTIONS: {
  id: AdminUserStatusFilter;
  label: string;
}[] = [
  { id: 'all', label: 'All statuses' },
  { id: 'active', label: 'Active' },
  { id: 'suspended', label: 'Suspended' },
];

export type AdminUsersListQuery = {
  page?: number;
  search?: string | null;
  role?: AdminUserRoleFilter;
  status?: AdminUserStatusFilter;
};

export function adminUserDetailPath(id: string | number): string {
  return `${ADMIN_USERS_PATH}/${id}`;
}

export function buildAdminUserDetailApiPath(id: string | number): string {
  return `${ADMIN_USERS_API_PATH}${id}/`;
}

export function buildAdminUserSuspendApiPath(id: string | number): string {
  return `${ADMIN_USERS_API_PATH}${id}/suspend/`;
}

export function buildAdminUserReactivateApiPath(id: string | number): string {
  return `${ADMIN_USERS_API_PATH}${id}/reactivate/`;
}

export function parseAdminUsersPageParam(
  raw: string | null | undefined,
): number {
  if (raw == null || raw === '') return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

export function parseAdminUserRoleFilter(
  raw: string | null | undefined,
): AdminUserRoleFilter {
  const value = (raw ?? '').trim().toUpperCase();
  if (value === 'BUYER' || value === 'SELLER' || value === 'ADMIN') {
    return value;
  }
  return 'all';
}

export function parseAdminUserStatusFilter(
  raw: string | null | undefined,
): AdminUserStatusFilter {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'active' || value === 'true' || value === '1') return 'active';
  if (value === 'suspended' || value === 'false' || value === '0') {
    return 'suspended';
  }
  return 'all';
}

/**
 * Build GET /admin/users/ with supported query params only.
 * Omits empty filters so the URL stays clean.
 */
export function buildAdminUsersApiPath(
  options: AdminUsersListQuery = {},
): string {
  const params = new URLSearchParams();
  const page =
    options.page != null && Number.isFinite(options.page) && options.page > 1
      ? Math.floor(options.page)
      : 1;
  if (page > 1) {
    params.set('page', String(page));
  }

  const search = (options.search ?? '').trim();
  if (search) {
    params.set('search', search);
  }

  const role = options.role ?? 'all';
  if (role !== 'all') {
    params.set('role', role);
  }

  const status = options.status ?? 'all';
  if (status === 'active') {
    params.set('is_active', 'true');
  } else if (status === 'suspended') {
    params.set('is_active', 'false');
  }

  const query = params.toString();
  return query ? `${ADMIN_USERS_API_PATH}?${query}` : ADMIN_USERS_API_PATH;
}

/** Frontend route href for the Users list with the same filters. */
export function buildAdminUsersPageHref(
  options: AdminUsersListQuery = {},
): string {
  const params = new URLSearchParams();
  const page =
    options.page != null && Number.isFinite(options.page) && options.page > 1
      ? Math.floor(options.page)
      : 1;
  if (page > 1) {
    params.set('page', String(page));
  }
  const search = (options.search ?? '').trim();
  if (search) {
    params.set('search', search);
  }
  const role = options.role ?? 'all';
  if (role !== 'all') {
    params.set('role', role);
  }
  const status = options.status ?? 'all';
  if (status === 'active') {
    params.set('is_active', 'true');
  } else if (status === 'suspended') {
    params.set('is_active', 'false');
  }
  const query = params.toString();
  return query ? `${ADMIN_USERS_PATH}?${query}` : ADMIN_USERS_PATH;
}

export function adminUsersFiltersAreActive(
  options: Pick<AdminUsersListQuery, 'search' | 'role' | 'status'>,
): boolean {
  return (
    Boolean((options.search ?? '').trim()) ||
    (options.role != null && options.role !== 'all') ||
    (options.status != null && options.status !== 'all')
  );
}

export function formatAdminUserRole(role: AdminUser['role']): string {
  switch (role) {
    case 'BUYER':
      return 'Buyer';
    case 'SELLER':
      return 'Seller';
    case 'ADMIN':
      return 'Admin';
    default:
      return 'Unknown';
  }
}

export function formatAdminUserStatus(isActive: boolean): 'Active' | 'Suspended' {
  return isActive ? 'Active' : 'Suspended';
}

export function formatAdminUserYesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

export function isProtectedAdminAccount(
  user: Pick<AdminUser, 'role' | 'is_staff' | 'is_superuser'>,
): boolean {
  return (
    user.role === 'ADMIN' ||
    user.is_staff === true ||
    user.is_superuser === true
  );
}

export function isCurrentAdminSelf(
  user: Pick<AdminUser, 'id'>,
  currentUser: Pick<AuthUser, 'id'> | null | undefined,
): boolean {
  if (!currentUser) return false;
  return user.id === currentUser.id;
}

/**
 * Which Suspend/Reactivate control to show.
 * Backend remains authority; this only drives UX visibility.
 */
export function getAdminUserAccountAction(
  user: Pick<
    AdminUser,
    'id' | 'role' | 'is_active' | 'is_staff' | 'is_superuser'
  >,
  currentUser: Pick<AuthUser, 'id'> | null | undefined,
): AdminUserAccountAction {
  if (isProtectedAdminAccount(user)) return null;
  if (isCurrentAdminSelf(user, currentUser)) return null;
  if (user.role !== 'BUYER' && user.role !== 'SELLER') return null;
  return user.is_active ? 'suspend' : 'reactivate';
}

/** Static guard: Admin Users UI must never expose delete/edit helpers. */
export function adminUserAllowsDeleteUi(): boolean {
  return false;
}

export function adminUserAllowsGenericEditUi(): boolean {
  return false;
}

export function canGoToPreviousAdminUsersPage(page: number): boolean {
  return page > 1;
}

export function canGoToNextAdminUsersPage(
  response: { next: string | null } | null | undefined,
): boolean {
  return Boolean(response?.next);
}
