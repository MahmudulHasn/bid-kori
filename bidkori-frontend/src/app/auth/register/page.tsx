'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';

import { useAuth } from '@/context/AuthContext';
import {
  PUBLIC_ACCOUNT_TYPE_OPTIONS,
  resolvePostAuthPath,
} from '@/lib/authRouting';
import type { PublicRegistrationRole } from '@/lib/types';

export default function RegisterPage() {
  const router = useRouter();
  const { register, isAuthenticated, user, isLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<PublicRegistrationRole>('BUYER');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      router.replace(resolvePostAuthPath(null, user.role));
    }
  }, [isAuthenticated, isLoading, router, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const authenticatedUser = await register(
        username.trim(),
        email.trim(),
        password,
        confirmPassword,
        role,
      );
      toast.success('Registration successful.');
      router.push(resolvePostAuthPath(null, authenticatedUser.role));
    } catch (error: unknown) {
      const data = (error as { response?: { data?: Record<string, unknown> } })
        ?.response?.data;
      let message = 'Registration failed. Please check your details.';
      if (typeof data?.error === 'string') {
        message = data.error;
      } else if (typeof data?.detail === 'string') {
        message = data.detail;
      } else if (data?.error && typeof data.error === 'object') {
        const values = Object.values(data.error);
        if (values.length > 0) {
          const first = values[0];
          message = Array.isArray(first) && first.length > 0 ? String(first[0]) : String(first);
        }
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] w-full flex-1 items-center justify-center px-4 py-12">
      {/* Subtle ambient light */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 left-1/2 -z-10 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/10 blur-3xl dark:bg-amber-500/5"
      />

      <div className="w-full max-w-md rounded-3xl border border-zinc-200/90 bg-white/95 p-8 shadow-xl shadow-zinc-950/5 backdrop-blur-sm dark:border-zinc-800/90 dark:bg-zinc-900/90 sm:p-10">
        <div className="mb-6 flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 shadow-2xs dark:bg-amber-500/20 dark:text-amber-300">
            <UserPlus className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Join BidKori
            </h1>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Start bidding on live auctions or sell your items.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset className="space-y-2.5">
            <legend className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Account Type
            </legend>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {PUBLIC_ACCOUNT_TYPE_OPTIONS.map((option) => {
                const selected = role === option.role;
                return (
                  <label
                    key={option.role}
                    className={[
                      'relative flex cursor-pointer flex-col rounded-2xl border p-3.5 transition-all active:scale-98',
                      selected
                        ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30 dark:bg-amber-500/15'
                        : 'border-zinc-200 bg-zinc-50/50 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-800/40 dark:hover:border-zinc-700',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-zinc-900 dark:text-white">
                        {option.label}
                      </span>
                      <input
                        type="radio"
                        name="account-type"
                        value={option.role}
                        checked={selected}
                        onChange={() => setRole(option.role)}
                        className="accent-amber-600"
                      />
                    </div>
                    <span className="mt-1 text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
                      {option.description}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

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
              placeholder="e.g. johndoe"
              className="min-h-[46px] w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-2.5 text-base sm:text-sm text-zinc-900 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-white dark:focus:bg-zinc-900"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="min-h-[46px] w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-2.5 text-base sm:text-sm text-zinc-900 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-white dark:focus:bg-zinc-900"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Confirm password
            </span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              className="min-h-[46px] w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-2.5 text-base sm:text-sm text-zinc-900 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-white dark:focus:bg-zinc-900"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-3 text-sm font-bold text-white shadow-sm shadow-amber-600/20 transition hover:from-amber-500 hover:to-amber-400 active:scale-98 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          Already have an account?{' '}
          <Link
            href="/auth/login"
            className="font-bold text-amber-700 hover:underline dark:text-amber-400"
          >
            Sign in &rarr;
          </Link>
        </p>
      </div>
    </main>
  );
}
