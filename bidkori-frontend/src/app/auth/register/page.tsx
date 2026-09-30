'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import RoleSelectionModal from '@/components/auth/RoleSelectionModal';
import { useAuth } from '@/context/AuthContext';
import {
  PUBLIC_ACCOUNT_TYPE_OPTIONS,
  resolvePostAuthPath,
} from '@/lib/authRouting';
import { getGoogleAuthErrorMessage } from '@/lib/googleAuth';
import { MOTION_DURATIONS, MOTION_EASINGS } from '@/lib/motionTokens';
import type { PublicRegistrationRole } from '@/lib/types';

export default function RegisterPage() {
  const router = useRouter();
  const { register, loginWithGoogle, isAuthenticated, user, isLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState<PublicRegistrationRole>('BUYER');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [pendingRoleData, setPendingRoleData] = useState<{
    signupToken: string;
    email?: string;
    name?: string;
  } | null>(null);
  const prefersReduced = useReducedMotion();

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
          message =
            Array.isArray(first) && first.length > 0
              ? String(first[0])
              : String(first);
        }
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSuccess = async (credential: string) => {
    setGoogleLoading(true);
    try {
      const result = await loginWithGoogle({ credential, role });
      if (result.requiresRoleSelection && result.signupToken) {
        setPendingRoleData({
          signupToken: result.signupToken,
          email: result.email,
          name: result.name,
        });
        return;
      }
      if (result.user) {
        router.push(resolvePostAuthPath(null, result.user.role));
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
        router.push(resolvePostAuthPath(null, result.user.role));
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
            <UserPlus className="h-6 w-6" aria-hidden />
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

        {/* Google Signup Option */}
        <div className="mb-6">
          <GoogleSignInButton
            onSuccess={handleGoogleSuccess}
            onError={(err) => toast.error(err.message)}
            isLoading={googleLoading}
            disabled={submitting || googleLoading}
            text="signup"
          />

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 font-medium text-zinc-500 dark:bg-[#0B0F1A] dark:text-zinc-400">
                or register manually
              </span>
            </div>
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
                    className={`relative flex cursor-pointer flex-col rounded-2xl border p-3.5 transition-all active:scale-[0.98] ${
                      selected
                        ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/40 dark:bg-amber-500/15'
                        : 'border-zinc-200 bg-zinc-50/50 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-800/40 dark:hover:border-zinc-700'
                    }`}
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
                        className="accent-amber-500"
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
            <Input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. johndoe"
              className="h-11"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Email
            </span>
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
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

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Confirm password
            </span>
            <div className="relative">
              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="h-11 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                {showConfirmPassword ? (
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
            loadingText="Creating account…"
            className="w-full mt-2 font-bold"
          >
            Create Account
          </Button>
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
