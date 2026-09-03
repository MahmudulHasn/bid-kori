'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useAuth } from '@/context/AuthContext';
import {
  buildLoginHref,
  buildSafeNextPath,
  evaluateRoleAccess,
} from '@/lib/authRouting';
import type { UserRole } from '@/lib/types';

type RoleGuardProps = {
  allowedRoles: readonly UserRole[];
  children: ReactNode;
};

/**
 * Client-side workspace gate.
 * Relies on AuthContext.user.role from Django `/users/me/` — never cookies.
 */
export default function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading } = useAuth();

  const decision = evaluateRoleAccess({
    isLoading,
    isAuthenticated,
    userRole: user?.role,
    allowedRoles,
  });

  useEffect(() => {
    if (decision.status === 'loading') {
      return;
    }

    if (decision.status === 'unauthenticated') {
      const search = searchParams.toString();
      const next =
        buildSafeNextPath(pathname, search ? `?${search}` : '') ?? pathname;
      router.replace(buildLoginHref(next));
      return;
    }

    if (decision.status === 'forbidden') {
      router.replace('/unauthorized');
    }
  }, [decision, pathname, router, searchParams]);

  if (decision.status === 'loading') {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Checking your account…
        </p>
      </main>
    );
  }

  if (decision.status !== 'allowed') {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Redirecting…
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
