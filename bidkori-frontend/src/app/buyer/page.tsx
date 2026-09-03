'use client';

import RoleWorkspaceLayout from '@/components/layout/RoleWorkspaceLayout';
import { useAuth } from '@/context/AuthContext';

const BUYER_NAV = [
  { label: 'Dashboard', href: '/buyer' },
  { label: 'My Bids', upcoming: true },
  { label: 'Won Auctions', upcoming: true },
  { label: 'Profile', upcoming: true },
] as const;

export default function BuyerHomePage() {
  const { user } = useAuth();

  return (
    <RoleWorkspaceLayout
      title="Buyer Dashboard"
      subtitle="Your buyer workspace is ready."
      navItems={BUYER_NAV}
    >
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
          Welcome, {user?.username ?? 'buyer'}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Your buyer workspace is ready. Bidding history and won auctions will
          appear here in a later update.
        </p>
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Future sections
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            <li>My Bids</li>
            <li>Won Auctions</li>
            <li>Profile</li>
          </ul>
        </div>
      </section>
    </RoleWorkspaceLayout>
  );
}
