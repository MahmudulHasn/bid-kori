'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import RoleSelectionModal from '@/components/auth/RoleSelectionModal';
import { useAuth } from '@/context/AuthContext';
import { resolvePostAuthPath } from '@/lib/authRouting';
import { getGoogleAuthErrorMessage } from '@/lib/googleAuth';
import { MOTION_DURATIONS, MOTION_EASINGS } from '@/lib/motionTokens';
import type { PublicRegistrationRole } from '@/lib/types';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, loginWithGoogle, isAuthenticated, isLoading, user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [pendingRoleData, setPendingRoleData] = useState<{
    signupToken: string;
    email?: string;
    name?: string;
  } | null>(null);
  const prefersReduced = useReducedMotion();

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

  const handleGoogleSuccess = async (credential: string) => {
    setGoogleLoading(true);
    try {
      const result = await loginWithGoogle({ credential });
      if (result.requiresRoleSelection && result.signupToken) {
        setPendingRoleData({
          signupToken: result.signupToken,
          email: result.email,
          name: result.name,
        });
        return;
      }
      if (result.user) {
        router.push(resolvePostAuthPath(nextPath, result.user.role));
      }
    } catch (error: unknown) {
      toast.error(getGoogleAuthErrorMessage(error));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleRoleSelected = async (selectedRole: PublicRegistrationRole) => {
    if (!pendingRoleData) return;
    setGoogleLoading(true);
    try {
      const result = await loginWithGoogle({
        signupToken: pendingRoleData.signupToken,
        role: selectedRole,
      });
      setPendingRoleData(null);
      if (result.user) {
        router.push(resolvePostAuthPath(nextPath, result.user.role));
      }
    } catch (error: unknown) {
      toast.error(getGoogleAuthErrorMessage(error));
    } finally {
      setGoogleLoading(false);
    }
  };


  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] w-full flex-1 items-center justify-center px-4 py-12">
      {/* Subtle ambient light */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 left-1/2 -z-10 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/10 blur-3xl"
      />

      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: MOTION_DURATIONS.normal,
          ease: MOTION_EASINGS.easeOutCubic,
        }}
        className="w-full max-w-md rounded-3xl border border-zinc-200/90 bg-white/95 p-8 shadow-2xl backdrop-blur-md dark:border-zinc-800/90 dark:bg-[#0B0F1A]/95 sm:p-10"
      >
        <div className="mb-6 flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 shadow-2xs dark:bg-amber-500/20 dark:text-amber-300">
            <LogIn className="h-6 w-6" aria-hidden />
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
            <Input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="h-11"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Password
            </span>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </label>

          <Button
            type="submit"
            variant="default"
            size="lg"
            isLoading={submitting}
            loadingText="Signing in…"
            className="w-full mt-2 font-bold"
          >
            Sign In
          </Button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-3 font-medium text-zinc-500 dark:bg-[#0B0F1A] dark:text-zinc-400">
              or
            </span>
          </div>
        </div>

        {/* Google Sign-In Button */}
        <GoogleSignInButton
          onSuccess={handleGoogleSuccess}
          onError={(err) => toast.error(err.message)}
          isLoading={googleLoading}
          disabled={submitting || googleLoading}
          text="continue"
        />

        <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          Don&apos;t have an account yet?{' '}
          <Link
            href="/auth/register"
            className="font-bold text-amber-700 hover:underline dark:text-amber-400"
          >
            Create account &rarr;
          </Link>
        </p>

        {/* First-time Google Signup Role Selection */}
        <RoleSelectionModal
          isOpen={Boolean(pendingRoleData)}
          email={pendingRoleData?.email}
          name={pendingRoleData?.name}
          isLoading={googleLoading}
          onSelectRole={handleRoleSelected}
          onCancel={() => setPendingRoleData(null)}
        />
      </motion.div>
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
