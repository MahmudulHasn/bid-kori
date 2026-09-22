'use client';

import { Suspense, type ReactNode } from 'react';

import RoleGuard from '@/components/auth/RoleGuard';
import AdminWorkspaceLayout from '@/components/admin/AdminWorkspaceLayout';

function GuardFallback() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Checking your account…
      </p>
    </main>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<GuardFallback />}>
      <RoleGuard allowedRoles={['ADMIN']}>
        <AdminWorkspaceLayout>{children}</AdminWorkspaceLayout>
      </RoleGuard>
    </Suspense>
  );
}
