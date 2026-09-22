'use client';

import Link from 'next/link';
import {
  Activity,
  Bell,
  CheckCircle2,
  Menu,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import useSWR from 'swr';

import { useAuth } from '@/context/AuthContext';
import {
  ADMIN_DASHBOARD_SUMMARY_API_PATH,
  adminDashboardSummaryFetcher,
} from '@/lib/adminDashboardApi';
import { formatHealthStatus } from '@/lib/adminDashboard';
import {
  ADMIN_MODERATION_PATH,
  ADMIN_PROFILE_PATH,
} from '@/lib/workspaceNavigation';

export default function AdminHeader({
  menuOpen,
  onMenuToggle,
  onRefresh,
  isRefreshing,
}: {
  menuOpen: boolean;
  onMenuToggle: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const { user } = useAuth();

  const { data: summary, mutate } = useSWR(
    ADMIN_DASHBOARD_SUMMARY_API_PATH,
    adminDashboardSummaryFetcher,
    { dedupingInterval: 10000 },
  );

  const health = summary?.system_health;
  const dbHealth = formatHealthStatus(health?.database);
  const redisHealth = formatHealthStatus(health?.redis);
  const celeryHealth = formatHealthStatus(health?.celery_broker);
  const attentionCount = summary?.moderation?.total_attention_required || 0;

  const handleRefreshClick = () => {
    if (onRefresh) {
      onRefresh();
    } else {
      void mutate();
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-zinc-200/80 bg-white/80 px-4 backdrop-blur-md sm:px-6 dark:border-zinc-800/80 dark:bg-zinc-950/80">
      {/* Left: Mobile hamburger & breadcrumb branding */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label={menuOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 lg:hidden dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 sm:inline-block">
            BidKori Management
          </span>
          <span className="hidden text-zinc-300 dark:text-zinc-700 sm:inline">/</span>
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">
            Command Center
          </span>
        </div>
      </div>

      {/* Right: Runtime Telemetry, Attention Alert, Refresh & Profile */}
      <div className="flex items-center gap-2.5">
        {/* Runtime telemetry pills (Desktop) */}
        <div className="hidden items-center gap-1.5 rounded-full border border-zinc-200/80 bg-zinc-50/80 px-2.5 py-1 text-[11px] text-zinc-600 md:flex dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          <Activity className="h-3 w-3 text-violet-500" />
          <span className="flex items-center gap-1">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                dbHealth.isHealthy ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            />
            Postgres
          </span>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <span className="flex items-center gap-1">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                redisHealth.isHealthy ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            />
            Redis
          </span>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <span className="flex items-center gap-1">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                celeryHealth.isHealthy ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            />
            Celery
          </span>
        </div>

        {/* Live Refresh button */}
        <button
          type="button"
          onClick={handleRefreshClick}
          disabled={isRefreshing}
          title="Refresh dashboard data"
          className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 shadow-2xs transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${
              isRefreshing ? 'animate-spin text-violet-600' : 'text-zinc-500'
            }`}
          />
          <span className="hidden sm:inline">
            {isRefreshing ? 'Syncing…' : 'Sync'}
          </span>
        </button>

        {/* Moderation Alert Bell */}
        <Link
          href={ADMIN_MODERATION_PATH}
          title={
            attentionCount > 0
              ? `${attentionCount} items require moderation attention`
              : 'Moderation queue clean'
          }
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-2xs transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <ShieldAlert
            className={`h-4 w-4 ${
              attentionCount > 0 ? 'text-amber-500' : 'text-zinc-400'
            }`}
          />
          {attentionCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-xs">
              {attentionCount}
            </span>
          )}
        </Link>

        {/* Profile Avatar Pill */}
        <Link
          href={ADMIN_PROFILE_PATH}
          className="flex items-center gap-2 rounded-lg border border-zinc-200/80 bg-white p-1 pl-2 shadow-2xs transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          <span className="hidden text-xs font-semibold text-zinc-800 sm:inline dark:text-zinc-200">
            {user?.username || 'admin'}
          </span>
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600 text-xs font-bold text-white shadow-xs">
            {(user?.username?.[0] || 'A').toUpperCase()}
          </div>
        </Link>
      </div>
    </header>
  );
}
