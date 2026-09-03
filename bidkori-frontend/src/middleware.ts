import { NextRequest, NextResponse } from 'next/server';

import {
  buildSafeNextPath,
  hasSessionHintCookie,
  isProtectedPath,
} from '@/lib/authRouting';

/**
 * UX / navigation guard only.
 *
 * Presence of a session-hint cookie (or legacy `token` cookie) only steers
 * browsers toward login. It is NOT authentication and is NOT a role authority.
 * Django validates `Authorization: Token …` on every protected API request;
 * AuthProvider verifies the token via `GET /users/me/` (including authoritative
 * `role` / `is_staff`) before treating the user as signed in.
 *
 * Role allow/deny for /buyer, /seller, and /admin is enforced by RoleGuard after
 * hydration — never by reading a client-writable role cookie here.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (!hasSessionHintCookie(request.cookies)) {
    const loginUrl = new URL('/auth/login', request.url);
    const next = buildSafeNextPath(pathname, search) ?? pathname;
    loginUrl.searchParams.set('next', next);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/auctions/create',
    '/auctions/create/:path*',
    '/buyer',
    '/buyer/:path*',
    '/seller',
    '/seller/:path*',
    '/admin',
    '/admin/:path*',
  ],
};
