'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Gavel,
  Home,
  LogIn,
  Package,
  Search,
  ShoppingBag,
  Store,
  Trophy,
  User,
  Users,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuth();
  const role = user?.role;

  // Don't show bottom nav on login/register pages to leave full focus for forms and mobile keyboards
  if (pathname.startsWith('/auth/')) {
    return null;
  }

  type NavItem = {
    label: string;
    href: string;
    icon: typeof Home;
    exact?: boolean;
  };

  let items: NavItem[] = [
    { label: 'Home', href: '/', icon: Home, exact: true },
    { label: 'Auctions', href: '/auctions', icon: Gavel },
    { label: 'Search', href: '/search', icon: Search },
    { label: 'Login', href: '/auth/login', icon: LogIn },
  ];

  if (isAuthenticated) {
    if (role === 'BUYER') {
      items = [
        { label: 'Market', href: '/auctions', icon: Gavel },
        { label: 'My Bids', href: '/buyer/my-bids', icon: ShoppingBag },
        { label: 'Won', href: '/buyer/won', icon: Trophy },
        { label: 'Account', href: '/buyer', icon: User, exact: true },
      ];
    } else if (role === 'SELLER') {
      items = [
        { label: 'Dashboard', href: '/seller', icon: Home, exact: true },
        { label: 'Products', href: '/seller/products', icon: Package },
        { label: 'Auctions', href: '/seller/auctions', icon: Gavel },
        { label: 'Sales', href: '/seller/sales', icon: Store },
        { label: 'Account', href: '/seller/profile', icon: User },
      ];
    } else if (role === 'ADMIN') {
      items = [
        { label: 'Overview', href: '/admin', icon: Home, exact: true },
        { label: 'Users', href: '/admin/users', icon: Users },
        { label: 'Auctions', href: '/admin/auctions', icon: Gavel },
        { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
        { label: 'Profile', href: '/admin/profile', icon: User },
      ];
    }
  }

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200/80 bg-white/95 backdrop-blur-lg shadow-lg shadow-zinc-950/5 dark:border-zinc-800/80 dark:bg-zinc-950/95 md:hidden"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex h-16 items-center justify-around px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const pathOnly = pathname.split('#')[0]?.split('?')[0] ?? pathname;
          const isExact = item.exact || item.href === '/';
          const isActive = isExact
            ? pathOnly === item.href || pathOnly === `${item.href}/`
            : pathOnly === item.href || pathOnly.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex min-h-[48px] min-w-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1 text-center transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'text-amber-800 dark:text-amber-300 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {isActive ? (
                <span
                  aria-hidden
                  className="absolute -top-1 h-0.5 w-6 rounded-full bg-amber-600 dark:bg-amber-400 animate-dropdown-in"
                />
              ) : null}
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300'
                    : ''
                }`}
              >
                <Icon
                  className="h-4.5 w-4.5 transition-transform duration-200"
                  aria-hidden
                />
              </div>
              <span className="text-[10.5px] leading-none tracking-tight">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
