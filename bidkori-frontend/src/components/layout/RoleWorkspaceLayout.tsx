'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Gavel, LogOut, Store } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';

export type WorkspaceNavItem = {
  label: string;
  /** When omitted or upcoming, the item is shown as disabled placeholder. */
  href?: string;
  upcoming?: boolean;
};

type RoleWorkspaceLayoutProps = {
  title: string;
  subtitle?: string;
  navItems?: readonly WorkspaceNavItem[];
  children: ReactNode;
};

export default function RoleWorkspaceLayout({
  title,
  subtitle,
  navItems = [],
  children,
}: RoleWorkspaceLayoutProps) {
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <Store className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                BidKori workspace
              </p>
              <h1 className="truncate text-lg font-semibold text-zinc-900 dark:text-white">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              <Gavel className="h-4 w-4" aria-hidden />
              Marketplace
            </Link>
            {user?.username ? (
              <span className="hidden text-sm text-zinc-500 sm:inline dark:text-zinc-400">
                {user.username}
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Logout
            </button>
          </div>
        </div>

        {navItems.length > 0 ? (
          <nav
            aria-label="Workspace sections"
            className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6"
          >
            {navItems.map((item) => {
              const upcoming = item.upcoming || !item.href;
              if (upcoming) {
                return (
                  <span
                    key={item.label}
                    title="Coming soon"
                    className="inline-flex cursor-default items-center rounded-lg px-3 py-1.5 text-sm text-zinc-400 dark:text-zinc-500"
                  >
                    {item.label}
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide">
                      Soon
                    </span>
                  </span>
                );
              }
              return (
                <Link
                  key={item.label}
                  href={item.href!}
                  className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-amber-800 transition hover:bg-amber-500/10 dark:text-amber-300"
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
