'use client';

import { useAuth } from '@/context/AuthContext';

/**
 * Frontend admin landing shell only.
 * Django HTML admin at backend `/admin/` is a separate surface.
 */
export default function AdminHomePage() {
  const { user } = useAuth();

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
        Admin Dashboard
      </h1>
      <p className="mt-3 text-base text-zinc-800 dark:text-zinc-200">
        Welcome back, {user?.username ?? 'admin'}.
      </p>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Use the administration workspace to manage BidKori.
      </p>
    </section>
  );
}
