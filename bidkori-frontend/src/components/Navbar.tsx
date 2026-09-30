'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Headphones,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Store,
  User,
  UserPlus,
} from 'lucide-react';

import BidKoriLogo from '@/components/brand/BidKoriLogo';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAuth } from '@/context/AuthContext';
import { getRoleHome, isRoleWorkspacePath } from '@/lib/authRouting';
import { MARKETPLACE_ROUTES, PUBLIC_NAV_LINKS } from '@/lib/marketplace';
import { getWorkspaceNavLabel } from '@/lib/workspaceNavigation';

const navLinkClass = (active: boolean) =>
  [
    'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200',
    active
      ? 'bg-amber-500/10 text-amber-700 shadow-xs dark:bg-amber-500/15 dark:text-amber-300 font-semibold'
      : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100',
  ].join(' ');

const navIcons = {
  Home: Home,
  Marketplace: Store,
  'Contact Us': Headphones,
} as const;

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, user, logout, isLoading } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Role workspaces render their own chrome via RoleWorkspaceLayout.
  if (isRoleWorkspacePath(pathname)) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    setSheetOpen(false);
    router.push('/');
  };

  const workspaceHref = user?.role ? getRoleHome(user.role) : null;
  const workspaceLabel = user?.role ? getWorkspaceNavLabel(user.role) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80 transition-colors">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Brand Logo */}
        <Link
          href={MARKETPLACE_ROUTES.home}
          className="group inline-flex items-center transition-transform duration-200 hover:opacity-90 active:scale-95"
          aria-label="BidKori Home"
        >
          <BidKoriLogo size="md" priority />
        </Link>

        {/* Desktop Navigation Links */}
        <div className="hidden md:flex items-center gap-1.5">
          {PUBLIC_NAV_LINKS.map((link) => {
            const Icon = navIcons[link.label];
            const active =
              link.href === '/'
                ? pathname === '/'
                : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={navLinkClass(active)}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {link.label}
              </Link>
            );
          })}

          {isAuthenticated && workspaceHref && workspaceLabel ? (
            <Link
              href={workspaceHref}
              className={navLinkClass(pathname.startsWith(workspaceHref))}
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden />
              {workspaceLabel}
            </Link>
          ) : null}
        </div>

        {/* Desktop Auth Controls */}
        <div className="hidden md:flex items-center gap-2">
          {isLoading ? (
            <div
              className="h-9 w-28 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-zinc-800"
              aria-hidden
            />
          ) : isAuthenticated ? (
            <div className="flex items-center gap-2.5 pl-2">
              <div className="flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                <User className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                <span className="max-w-[120px] truncate">{user?.username}</span>
                {user?.role ? (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                    {user.role}
                  </span>
                ) : null}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleLogout}
                className="gap-1.5"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                Logout
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-2">
              <Button variant="secondary" size="sm" asChild>
                <Link href="/auth/login" className="gap-1.5">
                  <LogIn className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                  Login
                </Link>
              </Button>
              <Button variant="default" size="sm" asChild>
                <Link href="/auth/register" className="gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" aria-hidden />
                  Register
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Mobile Navigation Sheet */}
        <div className="flex md:hidden items-center gap-2">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open menu"
                className="h-10 w-10 rounded-xl"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex flex-col justify-between w-full max-w-xs">
              <div className="space-y-6">
                <SheetHeader>
                  <SheetTitle className="text-left flex items-center gap-2">
                    <BidKoriLogo size="sm" />
                  </SheetTitle>
                </SheetHeader>

                <div className="flex flex-col gap-1.5">
                  {PUBLIC_NAV_LINKS.map((link) => {
                    const Icon = navIcons[link.label];
                    const active =
                      link.href === '/'
                        ? pathname === '/'
                        : pathname === link.href || pathname.startsWith(`${link.href}/`);
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setSheetOpen(false)}
                        className={navLinkClass(active)}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                        {link.label}
                      </Link>
                    );
                  })}

                  {isAuthenticated && workspaceHref && workspaceLabel ? (
                    <Link
                      href={workspaceHref}
                      onClick={() => setSheetOpen(false)}
                      className={navLinkClass(pathname.startsWith(workspaceHref))}
                    >
                      <LayoutDashboard className="h-4 w-4" aria-hidden />
                      {workspaceLabel}
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                {isAuthenticated ? (
                  <div className="space-y-3">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      Signed in as{' '}
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {user?.username}
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      className="w-full justify-center gap-2"
                      onClick={handleLogout}
                    >
                      <LogOut className="h-4 w-4" aria-hidden />
                      Logout
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" asChild onClick={() => setSheetOpen(false)}>
                      <Link href="/auth/login" className="gap-1.5 justify-center">
                        <LogIn className="h-4 w-4 text-amber-500" aria-hidden />
                        Login
                      </Link>
                    </Button>
                    <Button variant="default" asChild onClick={() => setSheetOpen(false)}>
                      <Link href="/auth/register" className="gap-1.5 justify-center">
                        <UserPlus className="h-4 w-4" aria-hidden />
                        Register
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
