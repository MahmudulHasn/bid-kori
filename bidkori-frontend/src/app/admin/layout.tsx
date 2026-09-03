'use client';

import { Suspense, type ReactNode } from 'react';

import RoleGuard from '@/components/auth/RoleGuard';

function GuardFallback() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Checking your account…
      </p>
    </main>
  );
}

/**
 * Frontend admin workspace layout.
 *
 * Note: Django's HTML admin remains at backend `/admin/` (typically :8000).
 * This Next.js `/admin` tree is the BidKori frontend admin workspace only.
 * Reverse-proxy coexistence is out of scope for this foundation task.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<GuardFallback />}>
      <RoleGuard allowedRoles={['ADMIN']}>{children}</RoleGuard>
    </Suspense>
  );
}
