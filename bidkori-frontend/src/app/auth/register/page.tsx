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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <UserPlus className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
              Create your account
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Join BidKori to list items and place bids.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Account Type
            </legend>
            <div className="space-y-2">
              {PUBLIC_ACCOUNT_TYPE_OPTIONS.map((option) => {
                const selected = role === option.role;
                return (
                  <label
                    key={option.role}
                    className={[
                      'flex cursor-pointer gap-3 rounded-lg border px-3 py-3 transition',
                      selected
                        ? 'border-amber-500 bg-amber-500/10'
                        : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="account-type"
                      value={option.role}
                      checked={selected}
                      onChange={() => setRole(option.role)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-medium text-zinc-900 dark:text-white">
                        {option.label}
                      </span>
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Username
            </span>
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-base sm:text-sm text-zinc-900 outline-none ring-amber-500/40 focus:border-amber-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-base sm:text-sm text-zinc-900 outline-none ring-amber-500/40 focus:border-amber-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Password
            </span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-base sm:text-sm text-zinc-900 outline-none ring-amber-500/40 focus:border-amber-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Confirm password
            </span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-base sm:text-sm text-zinc-900 outline-none ring-amber-500/40 focus:border-amber-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Already registered?{' '}
          <Link
            href="/auth/login"
            className="font-medium text-amber-700 hover:underline dark:text-amber-300"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
