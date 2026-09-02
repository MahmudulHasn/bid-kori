/**
 * Pure helpers for UX-only route protection.
 * Backend Token auth remains the source of truth for authorization.
 */

export const TOKEN_KEY = 'token';
export const USER_KEY = 'user';

/** Presence-only cookie for middleware navigation hints — not an auth credential. */
export const SESSION_HINT_COOKIE = 'bidkori_session';

/** Legacy cookie that previously mirrored the API token; cleared on session write. */
export const LEGACY_TOKEN_COOKIE = 'token';

export const AUTH_EXPIRED_EVENT = 'bidkori:auth-expired';

const PROTECTED_PREFIXES = ['/dashboard', '/auctions/create'] as const;

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
