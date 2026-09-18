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
  };

  let items: NavItem[] = [
    { label: 'Home', href: '/', icon: Home },
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
        { label: 'Account', href: '/buyer', icon: User },
      ];
    } else if (role === 'SELLER') {
      items = [
        { label: 'Dashboard', href: '/seller', icon: Home },
        { label: 'Products', href: '/seller/products', icon: Package },
        { label: 'Auctions', href: '/seller/auctions', icon: Gavel },
        { label: 'Sales', href: '/seller/sales', icon: Store },
        { label: 'Account', href: '/seller/profile', icon: User },
      ];
    } else if (role === 'ADMIN') {
      items = [
        { label: 'Overview', href: '/admin', icon: Home },
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
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200/90 bg-white/95 backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-950/95 md:hidden"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex h-16 items-center justify-around px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 text-center transition-colors ${
                isActive
                  ? 'font-semibold text-amber-700 dark:text-amber-400'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <Icon
                className={`h-5 w-5 ${isActive ? 'scale-110 text-amber-600 dark:text-amber-400' : ''} transition-transform`}
                aria-hidden
              />
              <span className="text-[11px] leading-none tracking-tight">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
