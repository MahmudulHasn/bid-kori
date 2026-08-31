'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Gavel,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  PlusCircle,
  UserPlus,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';

const navLinkClass = (active: boolean) =>
  [
    'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
      : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white',
  ].join(' ');

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, user, logout, isLoading } = useAuth();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900 dark:text-white"
        >
          <Gavel className="h-5 w-5 text-amber-600" aria-hidden />
          BidKori
        </Link>

        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          <Link href="/" className={navLinkClass(pathname === '/')}>
            <Home className="h-4 w-4" aria-hidden />
            Home
          </Link>

          {isAuthenticated && (
            <>
              <Link
                href="/dashboard"
                className={navLinkClass(pathname.startsWith('/dashboard'))}
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden />
                Dashboard
              </Link>
              <Link
                href="/auctions/create"
                className={navLinkClass(pathname.startsWith('/auctions/create'))}
              >
                <PlusCircle className="h-4 w-4" aria-hidden />
                Create Auction
              </Link>
            </>
          )}

          {!isLoading && (
            <>
              {isAuthenticated ? (
                <div className="ml-1 flex items-center gap-2 border-l border-zinc-200 pl-3 dark:border-zinc-700">
                  <span className="hidden text-sm text-zinc-500 sm:inline dark:text-zinc-400">
                    {user?.username}
                  </span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Logout
                  </button>
                </div>
              ) : (
                <div className="ml-1 flex items-center gap-2 border-l border-zinc-200 pl-3 dark:border-zinc-700">
                  <Link
                    href="/auth/login"
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-500"
                  >
                    <LogIn className="h-4 w-4" aria-hidden />
                    Login
                  </Link>
                  <Link
                    href="/auth/register"
                    className={navLinkClass(pathname.startsWith('/auth/register'))}
                  >
                    <UserPlus className="h-4 w-4" aria-hidden />
                    Register
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
