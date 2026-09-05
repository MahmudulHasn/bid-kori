'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '@/context/AuthContext';
import { buildLoginHref } from '@/lib/authRouting';
import {
  LEGACY_DASHBOARD_PATH,
  resolveLegacyDashboardRedirect,
} from '@/lib/workspaceNavigation';

/**
 * Compatibility shim for legacy `/dashboard`.
 * Canonical homes are `/buyer`, `/seller`, and `/admin`.
 */
export default function LegacyDashboardRedirectPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || !user) {
      router.replace(buildLoginHref(pathname || LEGACY_DASHBOARD_PATH));
      return;
    }

    router.replace(resolveLegacyDashboardRedirect(user.role));
  }, [isAuthenticated, isLoading, pathname, router, user]);

  return (
    <main className="mx-auto flex min-h-[40vh] w-full max-w-lg flex-1 items-center justify-center px-4 py-16">
      <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
        {isLoading
          ? 'Checking your session…'
          : 'Redirecting to your workspace…'}
      </p>
    </main>
  );
}
