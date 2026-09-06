'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, LogOut, Menu, Store, X } from 'lucide-react';

import NotificationBell from '@/components/notifications/NotificationBell';
import { useAuth } from '@/context/AuthContext';
import {
  getRoleDisplayLabel,
  getWorkspaceAccent,
  getWorkspaceAccountPaths,
  type WorkspaceConfig,
} from '@/lib/workspaceNavigation';

type WorkspaceHeaderProps = {
  config: WorkspaceConfig;
  menuOpen: boolean;
  onMenuToggle: () => void;
};

const accentChip: Record<
  ReturnType<typeof getWorkspaceAccent>,
  string
> = {
  amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
  sky: 'bg-sky-500/15 text-sky-800 dark:text-sky-200',
  violet: 'bg-violet-500/15 text-violet-800 dark:text-violet-200',
};

export default function WorkspaceHeader({
  config,
  menuOpen,
  onMenuToggle,
}: WorkspaceHeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuExpanded, setMenuExpanded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const accent = getWorkspaceAccent(config.role);
  const roleLabel = getRoleDisplayLabel(config.role);
  const accountPaths = getWorkspaceAccountPaths(config.role);

  useEffect(() => {
    if (!menuExpanded) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuExpanded(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuExpanded(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuExpanded]);

  const handleLogout = async () => {
    setMenuExpanded(false);
    await logout();
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 lg:hidden dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            onClick={onMenuToggle}
          >
            {menuOpen ? (
              <X className="h-5 w-5" aria-hidden />
            ) : (
              <Menu className="h-5 w-5" aria-hidden />
            )}
          </button>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white sm:text-base">
              {config.dashboardTitle}
            </p>
            <p className="hidden text-xs text-zinc-500 sm:block dark:text-zinc-400">
              {config.brandTitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={config.marketplaceHref}
            className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 sm:inline-flex dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <Store className="h-4 w-4" aria-hidden />
            {config.marketplaceLabel}
          </Link>

          <NotificationBell role={config.role} />

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuExpanded}
              aria-controls={menuId}
              onClick={() => setMenuExpanded((open) => !open)}
              className="inline-flex max-w-[12rem] items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-left transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-zinc-900 dark:text-white">
                  {user?.username ?? 'Account'}
                </span>
                <span
                  className={[
                    'mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    accentChip[accent],
                  ].join(' ')}
                >
                  {roleLabel}
                </span>
              </span>
              <ChevronDown
                className={[
                  'h-4 w-4 shrink-0 text-zinc-400 transition',
                  menuExpanded ? 'rotate-180' : '',
                ].join(' ')}
                aria-hidden
              />
            </button>

            {menuExpanded ? (
              <div
                id={menuId}
                role="menu"
                className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                    {user?.username ?? 'Account'}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {roleLabel}
                  </p>
                </div>
                {accountPaths.profile ? (
                  <Link
                    href={accountPaths.profile}
                    role="menuitem"
                    onClick={() => setMenuExpanded(false)}
                    className="block px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Profile
                  </Link>
                ) : null}
                {accountPaths.settings ? (
                  <Link
                    href={accountPaths.settings}
                    role="menuitem"
                    onClick={() => setMenuExpanded(false)}
                    className="block px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Settings
                  </Link>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
