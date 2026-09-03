'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import AccountInfo from '@/components/account/AccountInfo';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/lib/apiErrors';

type LogoutUiStatus = 'idle' | 'submitting' | 'error';

export default function BuyerSettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [logoutStatus, setLogoutStatus] = useState<LogoutUiStatus>('idle');
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleSignOut = async () => {
    if (logoutStatus === 'submitting') return;
    setLogoutStatus('submitting');
    setLogoutError(null);
    try {
      await logout();
      router.push('/');
    } catch (error: unknown) {
      const message = getApiErrorMessage(
        error,
        'We could not sign you out. Please try again.',
      );
      setLogoutError(message);
      setLogoutStatus('error');
      toast.error(message);
    }
  };

  const submitting = logoutStatus === 'submitting';

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Account Settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Session and account controls that BidKori currently supports.
        </p>
      </header>

      <section
        aria-labelledby="session-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="session-heading"
          className="text-base font-semibold text-zinc-900 dark:text-white"
        >
          Session
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Sign out of this browser. You can sign in again at any time.
        </p>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={submitting}
          aria-busy={submitting}
          className="mt-4 inline-flex rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {submitting ? 'Signing out…' : 'Sign Out'}
        </button>
        {logoutStatus === 'error' && logoutError ? (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
            {logoutError}
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="settings-account-heading"
        className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 shadow-sm sm:px-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="settings-account-heading"
          className="pt-3 text-base font-semibold text-zinc-900 dark:text-white"
        >
          Account
        </h2>
        <AccountInfo user={user} />
      </section>

      <section
        aria-labelledby="security-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="security-heading"
          className="text-base font-semibold text-zinc-900 dark:text-white"
        >
          Security
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Password-management tools are not currently available in BidKori.
          Password changes are not available from the web app yet.
        </p>
      </section>
    </div>
  );
}
