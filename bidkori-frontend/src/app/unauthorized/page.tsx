'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { getRoleHome } from '@/lib/authRouting';

export default function UnauthorizedPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const roleHome =
    isAuthenticated && user?.role ? getRoleHome(user.role) : null;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300">
            <ShieldAlert className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
              Access unavailable
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              You do not have permission to open that workspace.
            </p>
          </div>
        </div>

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Continue browsing the marketplace, or return to the area that matches
          your account.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500"
          >
            Go to marketplace
          </Link>

          {!isLoading && roleHome ? (
            <Link
              href={roleHome}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Back to my workspace
            </Link>
          ) : null}

          {!isLoading && !isAuthenticated ? (
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Sign in
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
