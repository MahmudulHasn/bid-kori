'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  LogOut,
  Menu,
  ShieldAlert,
  Store,
  X,
} from 'lucide-react';

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
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition-all duration-200 hover:bg-zinc-100 active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 lg:hidden dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            onClick={onMenuToggle}
          >
            {menuOpen ? (
              <X className="h-5 w-5 transition-transform duration-200 rotate-90" aria-hidden />
            ) : (
              <Menu className="h-5 w-5 transition-transform duration-200" aria-hidden />
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

        <div className="flex items-center gap-1.5 sm:gap-3">
          {config.role === 'SELLER' && (
            <div className="flex items-center">
              {user?.seller_verified === 'APPROVED' ? (
                <span
                  title="Seller account is verified"
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-500/30"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  Verified
                </span>
              ) : user?.seller_verified === 'PENDING' ? (
                <span
                  title="Verification documents under review"
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-500/30"
                >
                  <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
                  Pending Verification
                </span>
              ) : (
                <span
                  title="Verification required to add products"
                  className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-500/30"
                >
                  <AlertCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" aria-hidden />
                  Unverified
                </span>
              )}
            </div>
          )}

          <Link
            href={config.marketplaceHref}
            aria-label={config.marketplaceLabel}
            title={config.marketplaceLabel}
            className="inline-flex items-center gap-1.5 rounded-lg p-2 sm:px-2.5 sm:py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <Store className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{config.marketplaceLabel}</span>
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
                className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 animate-dropdown-in origin-top-right"
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
