'use client';

import RoleWorkspaceLayout from '@/components/layout/RoleWorkspaceLayout';
import { useAuth } from '@/context/AuthContext';

const SELLER_NAV = [
  { label: 'Dashboard', href: '/seller' },
  { label: 'Products', upcoming: true },
  { label: 'Auctions', upcoming: true },
] as const;

export default function SellerHomePage() {
  const { user } = useAuth();

  return (
    <RoleWorkspaceLayout
      title="Seller Dashboard"
      subtitle="Manage your BidKori selling activity from here."
      navItems={SELLER_NAV}
    >
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
          Welcome, {user?.username ?? 'seller'}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Manage your BidKori selling activity from here. Product and auction
          management tools will arrive in a later update.
        </p>
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Future sections
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            <li>Products</li>
            <li>Auctions</li>
          </ul>
        </div>
      </section>
    </RoleWorkspaceLayout>
  );
}
