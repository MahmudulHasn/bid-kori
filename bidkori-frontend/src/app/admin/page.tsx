'use client';

import RoleWorkspaceLayout from '@/components/layout/RoleWorkspaceLayout';
import { useAuth } from '@/context/AuthContext';

/**
 * Frontend admin landing shell only.
 * Django HTML admin at backend `/admin/` is a separate surface.
 */
const ADMIN_NAV = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Users', upcoming: true },
  { label: 'Listings', upcoming: true },
] as const;

export default function AdminHomePage() {
  const { user } = useAuth();

  return (
    <RoleWorkspaceLayout
      title="Admin Dashboard"
      subtitle="BidKori administration workspace."
      navItems={ADMIN_NAV}
    >
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
          Welcome, {user?.username ?? 'admin'}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          BidKori administration workspace. Management tools will be added in a
          later update. This page is the Next.js frontend admin area — not the
          Django HTML admin.
        </p>
      </section>
    </RoleWorkspaceLayout>
  );
}
