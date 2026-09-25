'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  ClipboardCheck,
  Gavel,
  History,
  Layers,
  LayoutDashboard,
  LogOut,
  Package,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  User,
  Users,
} from 'lucide-react';
import useSWR from 'swr';

import { useAuth } from '@/context/AuthContext';
import {
  ADMIN_ANALYTICS_PATH,
  ADMIN_AUCTIONS_PATH,
  ADMIN_BIDS_PATH,
  ADMIN_CATEGORIES_PATH,
  ADMIN_FULFILLMENT_PATH,
  ADMIN_MODERATION_PATH,
  ADMIN_PRODUCTS_PATH,
  ADMIN_PROFILE_PATH,
  ADMIN_SELLERS_PATH,
  ADMIN_SETTINGS_PATH,
  ADMIN_USERS_PATH,
} from '@/lib/workspaceNavigation';
import {
  ADMIN_DASHBOARD_SUMMARY_API_PATH,
  adminDashboardSummaryFetcher,
} from '@/lib/adminDashboardApi';
import { fetchAdminVerifications } from '@/lib/sellerVerificationApi';


type SidebarGroup = {
  title: string;
  items: {
    label: string;
    href: string;
    icon: typeof LayoutDashboard;
    badge?: number;
    badgeColor?: string;
    exact?: boolean;
  }[];
};

export default function AdminSidebar({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const { data: summary } = useSWR(
    ADMIN_DASHBOARD_SUMMARY_API_PATH,
    adminDashboardSummaryFetcher,
    { dedupingInterval: 10000 },
  );

  const { data: verifications } = useSWR(
    '/admin/verifications/',
    () => fetchAdminVerifications(),
    { dedupingInterval: 10000 },
  );

  const attentionCount = summary?.moderation?.total_attention_required || 0;
  const pendingVerificationsCount =
    verifications?.filter((v) => v.status === 'PENDING').length || 0;

  const groups: SidebarGroup[] = [
    {
      title: 'Overview',
      items: [
        {
          label: 'Dashboard',
          href: '/admin',
          icon: LayoutDashboard,
          exact: true,
        },
      ],
    },
    {
      title: 'Marketplace',
      items: [
        {
          label: 'Auctions',
          href: ADMIN_AUCTIONS_PATH,
          icon: Gavel,
          badge: summary?.auctions?.live,
          badgeColor: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
        },
        {
          label: 'Bids Monitor',
          href: ADMIN_BIDS_PATH,
          icon: History,
        },
        {
          label: 'Categories',
          href: ADMIN_CATEGORIES_PATH,
          icon: Layers,
        },
        {
          label: 'Products',
          href: ADMIN_PRODUCTS_PATH,
          icon: Package,
        },
        {
          label: 'Fulfillment',
          href: ADMIN_FULFILLMENT_PATH,
          icon: ClipboardCheck,
          badge: summary?.fulfillment?.completed_locked,
          badgeColor: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
        },
      ],
    },
    {
      title: 'Users & Roles',
      items: [
        {
          label: 'All Users',
          href: ADMIN_USERS_PATH,
          icon: Users,
          exact: true,
        },
        {
          label: 'Seller Verifications',
          href: ADMIN_SELLERS_PATH,
          icon: ShieldCheck,
          badge: pendingVerificationsCount > 0 ? pendingVerificationsCount : undefined,
          badgeColor: 'bg-amber-500/20 text-amber-800 dark:bg-amber-500/30 dark:text-amber-200',
        },
        {
          label: 'Sellers',
          href: `${ADMIN_USERS_PATH}?role=SELLER`,
          icon: Store,
        },
        {
          label: 'Buyers',
          href: `${ADMIN_USERS_PATH}?role=BUYER`,
          icon: User,
        },
      ],
    },

    {
      title: 'Analytics & Moderation',
      items: [
        {
          label: 'Analytics',
          href: ADMIN_ANALYTICS_PATH,
          icon: BarChart3,
        },
        {
          label: 'Moderation Queue',
          href: ADMIN_MODERATION_PATH,
          icon: ShieldAlert,
          badge: attentionCount > 0 ? attentionCount : undefined,
          badgeColor: 'bg-amber-500/20 text-amber-800 dark:bg-amber-500/30 dark:text-amber-200',
        },
      ],
    },
    {
      title: 'System',
      items: [
        {
          label: 'Profile',
          href: ADMIN_PROFILE_PATH,
          icon: User,
        },
        {
          label: 'Settings',
          href: ADMIN_SETTINGS_PATH,
          icon: SlidersHorizontal,
        },
      ],
    },
  ];

  const isItemActive = (href: string, exact = false) => {
    if (exact) {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="flex h-full w-72 flex-col justify-between border-r border-zinc-200/80 bg-white/95 p-4 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/95">
      <div className="flex flex-col gap-6 overflow-y-auto pr-1">
        {/* Brand header */}
        <div className="flex items-center justify-between px-2 pt-2">
          <Link
            href="/admin"
            onClick={onNavigate}
            className="flex items-center gap-2.5 transition hover:opacity-90"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-md shadow-violet-500/25">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold tracking-tight text-zinc-900 dark:text-white">
                  BidKori
                </span>
                <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                  Admin
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">Control & Telemetry</p>
            </div>
          </Link>
        </div>

        {/* Navigation groups */}
        <nav aria-label="Admin Navigation" className="space-y-6">
          {groups.map((group) => (
            <div key={group.title} className="space-y-1">
              <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isItemActive(item.href, item.exact);
                  const Icon = item.icon;
                  return (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={[
                          'group flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150',
                          active
                            ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/30'
                            : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100',
                        ].join(' ')}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon
                            className={[
                              'h-4 w-4 shrink-0 transition-colors',
                              active
                                ? 'text-white'
                                : 'text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300',
                            ].join(' ')}
                          />
                          <span>{item.label}</span>
                        </div>
                        {item.badge !== undefined && item.badge > 0 ? (
                          <span
                            className={[
                              'rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
                              active
                                ? 'bg-white/20 text-white'
                                : item.badgeColor || 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
                            ].join(' ')}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* Footer controls */}
      <div className="border-t border-zinc-200/80 pt-4 dark:border-zinc-800/80">
        <div className="space-y-1">
          <Link
            href="/auctions"
            onClick={onNavigate}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            <Store className="h-4 w-4 text-zinc-400" />
            <span>Public Marketplace</span>
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            <LogOut className="h-4 w-4 text-red-500" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Current user pill */}
        <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-zinc-50 p-2.5 dark:bg-zinc-900/60">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            {(user?.username?.[0] || 'A').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-zinc-900 dark:text-white">
              {user?.username || 'admin'}
            </p>
            <p className="truncate text-[10px] text-zinc-400">
              {user?.email || 'admin@bidkori.local'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
