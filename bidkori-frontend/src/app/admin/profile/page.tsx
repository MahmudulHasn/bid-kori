'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

import AccountInfo from '@/components/account/AccountInfo';
import { useAuth } from '@/context/AuthContext';
import {
  ADMIN_PROFILE_LIMITATION_COPY,
  formatAdminStaffStatus,
} from '@/lib/adminAccount';

export default function AdminProfilePage() {
  const { user, refreshUser } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const next = await refreshUser();
      if (next) {
        toast.success('Account information is up to date.');
      } else {
        toast.error('We could not refresh your account information.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          My Profile
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Your BidKori admin account identity from the current signed-in
          session.
        </p>
      </header>

      <section
        aria-labelledby="account-information-heading"
        className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 shadow-sm sm:px-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="account-information-heading"
          className="pt-3 text-base font-semibold text-zinc-900 dark:text-white"
        >
          Account Information
        </h2>
        <AccountInfo user={user} />
        <dl className="divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Staff Status
            </dt>
            <dd className="text-sm font-medium text-zinc-900 dark:text-white">
              Staff access: {formatAdminStaffStatus(user?.is_staff)}
            </dd>
          </div>
        </dl>
      </section>

      <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        {ADMIN_PROFILE_LIMITATION_COPY}
      </p>

      <button
        type="button"
        onClick={() => void handleRefresh()}
        disabled={refreshing}
        aria-busy={refreshing}
        className="text-sm font-medium text-violet-700 underline-offset-4 transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-violet-300"
      >
        {refreshing
          ? 'Refreshing account information…'
          : 'Refresh account information'}
      </button>
    </div>
  );
}
