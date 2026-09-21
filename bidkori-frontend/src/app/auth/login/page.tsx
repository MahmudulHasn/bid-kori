'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { LogIn } from 'lucide-react';
import toast from 'react-hot-toast';

import { useAuth } from '@/context/AuthContext';
import { resolvePostAuthPath } from '@/lib/authRouting';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, isLoading, user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const nextPath = searchParams.get('next');

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      router.replace(resolvePostAuthPath(nextPath, user.role));
    }
  }, [isAuthenticated, isLoading, nextPath, router, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const authenticatedUser = await login(username.trim(), password);
      toast.success('Logged in successfully.');
      router.push(resolvePostAuthPath(nextPath, authenticatedUser.role));
    } catch (error: unknown) {
      const data = (error as { response?: { data?: Record<string, unknown> } })
        ?.response?.data;
      const message =
        (typeof data?.error === 'string' && data.error) ||
        (typeof data?.detail === 'string' && data.detail) ||
        'Login failed. Check your credentials.';
      toast.error(String(message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] w-full flex-1 items-center justify-center px-4 py-12">
      {/* Subtle ambient light */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 left-1/2 -z-10 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/10 blur-3xl dark:bg-amber-500/5"
      />

      <div className="w-full max-w-md rounded-3xl border border-zinc-200/90 bg-white/95 p-8 shadow-xl shadow-zinc-950/5 backdrop-blur-sm dark:border-zinc-800/90 dark:bg-zinc-900/90 sm:p-10">
        <div className="mb-6 flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 shadow-2xs dark:bg-amber-500/20 dark:text-amber-300">
            <LogIn className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Welcome Back
            </h1>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Sign in to manage bids, listings, and payouts.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Username
            </span>
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="min-h-[46px] w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-2.5 text-base sm:text-sm text-zinc-900 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-white dark:focus:bg-zinc-900"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Password
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="min-h-[46px] w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-2.5 text-base sm:text-sm text-zinc-900 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-white dark:focus:bg-zinc-900"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-3 text-sm font-bold text-white shadow-sm shadow-amber-600/20 transition hover:from-amber-500 hover:to-amber-400 active:scale-98 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          Don&apos;t have an account yet?{' '}
          <Link
            href="/auth/register"
            className="font-bold text-amber-700 hover:underline dark:text-amber-400"
          >
            Create account &rarr;
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
          <p className="text-sm text-zinc-500">Loading…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
