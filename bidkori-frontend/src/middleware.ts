import { NextRequest, NextResponse } from 'next/server';

import {
  hasSessionHintCookie,
  isProtectedPath,
} from '@/lib/authRouting';

/**
 * UX / navigation guard only.
 *
 * Presence of a session-hint cookie (or legacy `token` cookie) only steers
 * browsers toward login. It is NOT authentication. Django validates
 * `Authorization: Token …` on every protected API request; AuthProvider
 * verifies the token via `GET /users/me/` before treating the user as signed in.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (!hasSessionHintCookie(request.cookies)) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Explicit roots + nested paths so /dashboard and /auctions/create always match.
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/auctions/create',
    '/auctions/create/:path*',
  ],
};
