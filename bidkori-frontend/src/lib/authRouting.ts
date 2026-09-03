/**
 * Pure helpers for UX-only route protection and post-auth redirects.
 * Backend Token auth remains the source of truth for authorization.
 * Django `user.role` is the authoritative role — never infer from cookies/URL.
 */

import type { AuthUser, PublicRegistrationRole, UserRole } from './types.ts';

export const TOKEN_KEY = 'token';
export const USER_KEY = 'user';

/** Presence-only cookie for middleware navigation hints — not an auth credential. */
export const SESSION_HINT_COOKIE = 'bidkori_session';

/** Legacy cookie that previously mirrored the API token; cleared on session write. */
export const LEGACY_TOKEN_COOKIE = 'token';

export const AUTH_EXPIRED_EVENT = 'bidkori:auth-expired';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/auctions/create',
  '/buyer',
  '/seller',
  '/admin',
] as const;

/** Public registration may only send these roles (never ADMIN). */
export const PUBLIC_REGISTRATION_ROLES = ['BUYER', 'SELLER'] as const satisfies readonly PublicRegistrationRole[];

export const PUBLIC_ACCOUNT_TYPE_OPTIONS = [
  {
    role: 'BUYER' as const,
    label: 'Buyer',
    description: 'Participate in auctions and place bids.',
  },
  {
    role: 'SELLER' as const,
    label: 'Seller',
    description: 'List products and create auctions.',
  },
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Allow only same-origin relative paths for post-login redirects. */
export function isSafeNextPath(value: string | null | undefined): value is string {
  if (!value) return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  if (value.includes('\\')) return false;
  return true;
}

export function hasSessionHintCookie(
  cookies: { get: (name: string) => { value: string } | undefined },
): boolean {
  const hint = cookies.get(SESSION_HINT_COOKIE)?.value;
  if (hint) return true;
  // Legacy UX cookie — presence only; value is never treated as proof of auth.
  const legacy = cookies.get(LEGACY_TOKEN_COOKIE)?.value;
  return Boolean(legacy);
}

/** Role home paths for future role layouts (pages may not exist yet). */
export function getRoleHome(role: UserRole): string {
  switch (role) {
    case 'BUYER':
      return '/buyer';
    case 'SELLER':
      return '/seller';
    case 'ADMIN':
      return '/admin';
  }
}

export function isBuyer(
  user: Pick<AuthUser, 'role'> | null | undefined,
): boolean {
  return user?.role === 'BUYER';
}

export function isSeller(
  user: Pick<AuthUser, 'role'> | null | undefined,
): boolean {
  return user?.role === 'SELLER';
}

export function isAdmin(
  user: Pick<AuthUser, 'role'> | null | undefined,
): boolean {
  return user?.role === 'ADMIN';
}

/** True when the authenticated role is in the workspace allow-list. */
export function isRoleAllowed(
  role: UserRole | null | undefined,
  allowedRoles: readonly UserRole[],
): boolean {
  if (!role) return false;
  return allowedRoles.includes(role);
}

export type RoleAccessDecision =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'forbidden'; role: UserRole }
  | { status: 'allowed'; role: UserRole };

/**
 * Pure role-workspace access decision.
 * Uses only backend-hydrated `user.role` — never cookies, routes, or ownership.
 */
export function evaluateRoleAccess(input: {
  isLoading: boolean;
  isAuthenticated: boolean;
  userRole: UserRole | null | undefined;
  allowedRoles: readonly UserRole[];
}): RoleAccessDecision {
  if (input.isLoading) {
    return { status: 'loading' };
  }
  if (!input.isAuthenticated || !input.userRole) {
    return { status: 'unauthenticated' };
  }
  if (!isRoleAllowed(input.userRole, input.allowedRoles)) {
    return { status: 'forbidden', role: input.userRole };
  }
  return { status: 'allowed', role: input.userRole };
}

/**
 * Build a safe relative `next` value from the current location.
 * Returns null when the combined path is not a safe same-origin redirect.
 */
export function buildSafeNextPath(
  pathname: string,
  search: string = '',
): string | null {
  const normalizedSearch =
    !search || search === '?'
      ? ''
      : search.startsWith('?')
        ? search
        : `?${search}`;
  const candidate = `${pathname}${normalizedSearch}`;
  return isSafeNextPath(candidate) ? candidate : null;
}

/** Login URL that preserves a safe return path for post-auth redirect. */
export function buildLoginHref(nextPath: string | null | undefined): string {
  if (!isSafeNextPath(nextPath)) {
    return '/auth/login';
  }
  return `/auth/login?next=${encodeURIComponent(nextPath)}`;
}

/** Paths that use a role workspace chrome instead of the public Navbar. */
export function isRoleWorkspacePath(pathname: string): boolean {
  return (
    pathname === '/buyer' ||
    pathname.startsWith('/buyer/') ||
    pathname === '/seller' ||
    pathname.startsWith('/seller/') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/')
  );
}

/**
 * Prefer a safe `?next=` path; otherwise send the user to their role home.
 * Role homes are intentional destinations even if those routes are added later.
 */
export function resolvePostAuthPath(
  next: string | null | undefined,
  role: UserRole,
): string {
  if (isSafeNextPath(next)) {
    return next;
  }
  return getRoleHome(role);
}

export function isPublicRegistrationRole(
  value: string | null | undefined,
): value is PublicRegistrationRole {
  return value === 'BUYER' || value === 'SELLER';
}

/** Normalize / default public registration role (safe default: BUYER). */
export function normalizePublicRegistrationRole(
  value: string | null | undefined,
): PublicRegistrationRole {
  if (isPublicRegistrationRole(value)) {
    return value;
  }
  return 'BUYER';
}

/** Build the register API body — never includes is_staff or ADMIN. */
export function buildRegisterPayload(input: {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  role?: string | null;
}): {
  username: string;
  email: string;
  password: string;
  confirm_password: string;
  role: PublicRegistrationRole;
} {
  const role = normalizePublicRegistrationRole(input.role);
  return {
    username: input.username,
    email: input.email,
    password: input.password,
    confirm_password: input.confirmPassword,
    role,
  };
}
