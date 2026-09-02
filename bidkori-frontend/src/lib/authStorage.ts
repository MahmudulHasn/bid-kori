import {
  AUTH_EXPIRED_EVENT,
  LEGACY_TOKEN_COOKIE,
  SESSION_HINT_COOKIE,
  TOKEN_KEY,
  USER_KEY,
} from '@/lib/authRouting';

const SESSION_HINT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function canUseDom(): boolean {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

/** UX navigation hint only — does not store the API token. */
export function setSessionHintCookie(): void {
  if (!canUseDom()) return;
  document.cookie = [
    `${SESSION_HINT_COOKIE}=1`,
    'path=/',
    `Max-Age=${SESSION_HINT_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
  ].join('; ');
  // Drop the legacy token-bearing cookie so middleware cannot confuse it for auth.
  document.cookie = `${LEGACY_TOKEN_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`;
}

export function clearSessionHintCookie(): void {
  if (!canUseDom()) return;
  document.cookie = `${SESSION_HINT_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = `${LEGACY_TOKEN_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`;
}

export function clearClientAuthStorage(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  clearSessionHintCookie();
}

export function notifyAuthExpired(): void {
  if (!canUseDom()) return;
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}
