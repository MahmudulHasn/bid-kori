'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  DollarSign,
  Gavel,
  Package,
  RefreshCw,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Store,
  TrendingUp,
  Trophy,
  User,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import useSWR from 'swr';

import { useAuth } from '@/context/AuthContext';
import {
  ADMIN_PROFILE_PATH,
  ADMIN_SETTINGS_PATH,
  ADMIN_PRODUCTS_PATH,
  ADMIN_AUCTIONS_PATH,
  ADMIN_BIDS_PATH,
  ADMIN_ANALYTICS_PATH,
  ADMIN_USERS_PATH,
  ADMIN_CATEGORIES_PATH,
  ADMIN_MODERATION_PATH,
} from '@/lib/workspaceNavigation';
import {
  formatAdminMoney,
  formatHealthStatus,
  type AdminDashboardSummary,
} from '@/lib/adminDashboard';
import {
  ADMIN_DASHBOARD_SUMMARY_API_PATH,
  adminDashboardSummaryFetcher,
} from '@/lib/adminDashboardApi';
import {
  ADMIN_ANALYTICS_API_PATH,
  type AdminAnalytics,
} from '@/lib/adminAnalytics';
import { adminAnalyticsFetcher } from '@/lib/adminAnalyticsApi';
import { getApiErrorMessage } from '@/lib/apiErrors';
import LifecycleDonutChart from '@/components/admin/charts/LifecycleDonutChart';
import UserRolesChart from '@/components/admin/charts/UserRolesChart';
import FinancialVolumeBar from '@/components/admin/charts/FinancialVolumeBar';
import BiddingTimelineChart from '@/components/admin/charts/BiddingTimelineChart';

function MetricCard({
  label,
  value,
  hint,
  icon,
  loading,
  badge,
}: {
  label: string;
  value: string | number | null | undefined;
  hint: string;
  icon: ReactNode;
  loading?: boolean;
  badge?: ReactNode;
}) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/90 dark:hover:border-zinc-700">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
        <span className="rounded-xl bg-zinc-100 p-2.5 text-violet-600 transition-colors group-hover:bg-violet-50 group-hover:text-violet-700 dark:bg-zinc-800 dark:text-violet-400 dark:group-hover:bg-violet-950/50">
          {icon}
        </span>
      </div>
      {loading ? (
        <div className="mt-3 h-8 w-28 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      ) : (
        <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-zinc-900 dark:text-white sm:text-3xl">
          {value ?? '—'}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-100 pt-2.5 dark:border-zinc-800/80">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
        {badge}
      </div>
    </article>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function formatDateSafe(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, 'MMM d, h:mm a');
}

export default function AdminHomePage() {
  const { user } = useAuth();
  const [activityTab, setActivityTab] = useState<
    'bids' | 'payments' | 'users' | 'auctions' | 'products'
  >('bids');

  const { data, error, isLoading, mutate, isValidating } = useSWR<AdminDashboardSummary>(
    ADMIN_DASHBOARD_SUMMARY_API_PATH,
    adminDashboardSummaryFetcher,
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  );

  const { data: analyticsData } = useSWR<AdminAnalytics>(
    ADMIN_ANALYTICS_API_PATH,
    adminAnalyticsFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10000,
    },
  );

  const errorMessage = error
    ? getApiErrorMessage(error, 'Could not load administrative command center data.')
    : null;

  const users = data?.users;
  const auctions = data?.auctions;
  const products = data?.products;
  const bids = data?.bids;
  const finance = data?.finance;
  const moderation = data?.moderation;
  const health = data?.system_health;
  const recent = data?.recent_activity;

  const dbHealth = formatHealthStatus(health?.database);
  const redisHealth = formatHealthStatus(health?.redis);
  const celeryHealth = formatHealthStatus(health?.celery_broker);

  // Fallback to recent.bids if analytics not loaded yet
  const timelinePoints =
    analyticsData?.bid_escalation_history && analyticsData.bid_escalation_history.length > 0
      ? analyticsData.bid_escalation_history
      : (recent?.bids || []).map((b) => ({
          amount: b.amount,
          timestamp: b.timestamp || '',
          bidder_username: b.bidder_username,
          auction_id: b.auction_id,
        }));

  return (
    <div className="space-y-8">
      {/* SECTION A — Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
              Admin Command Center
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
              <Shield className="h-3.5 w-3.5" aria-hidden />
              Staff
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Welcome back, <span className="font-semibold text-zinc-900 dark:text-zinc-200">{user?.username ?? 'admin'}</span>. Platform status & live operational telemetry.
          </p>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            Authoritative data derived from PostgreSQL and Daphne ASGI stack.
          </p>
        </div>

        {/* Quick action buttons & refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void mutate()}
            disabled={isValidating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            title="Refresh dashboard metrics"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isValidating ? 'animate-spin text-violet-600' : ''}`}
              aria-hidden
            />
            {isValidating ? 'Updating…' : 'Refresh'}
          </button>
          <Link
            href={ADMIN_CATEGORIES_PATH}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Categories
          </Link>
          <Link
            href={ADMIN_USERS_PATH}
            className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
          >
            Manage Users
          </Link>
          <Link
            href={ADMIN_AUCTIONS_PATH}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Manage Auctions
          </Link>
          <Link
            href={ADMIN_ANALYTICS_PATH}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Analytics
          </Link>
        </div>
      </header>

      {/* ERROR ALERT */}
      {errorMessage && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <p>{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => void mutate()}
            className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-800"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* SECTION 12 — SYSTEM HEALTH STRIP */}
      <section aria-labelledby="system-health-heading" className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
            <h2 id="system-health-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Platform Runtime Telemetry
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {dbHealth.isHealthy ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-500" />
              )}
              PostgreSQL 16: <strong className="font-semibold">{dbHealth.label}</strong>
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {redisHealth.isHealthy ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-500" />
              )}
              Redis Channels: <strong className="font-semibold">{redisHealth.label}</strong>
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {celeryHealth.isHealthy ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-500" />
              )}
              Celery Beat/Worker: <strong className="font-semibold">{celeryHealth.label}</strong>
            </span>
          </div>
        </div>
      </section>

      {/* SECTION 10 — MODERATION ATTENTION ALERT */}
      {moderation && moderation.total_attention_required > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-amber-900 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <h3 className="text-sm font-semibold">
                  Items Requiring Moderation Attention ({moderation.total_attention_required})
                </h3>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                  Platform items currently hidden, cancelled, or accounts suspended.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={ADMIN_MODERATION_PATH}
                className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-amber-700"
              >
                Open Moderation Center
              </Link>
              {moderation.suspended_users_count > 0 && (
                <Link
                  href={`${ADMIN_USERS_PATH}?is_active=false`}
                  className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-amber-900 shadow-sm hover:bg-amber-100 dark:bg-zinc-800 dark:text-amber-200 dark:hover:bg-zinc-700"
                >
                  {moderation.suspended_users_count} Suspended Users
                </Link>
              )}
              {moderation.cancelled_auctions_count > 0 && (
                <Link
                  href={ADMIN_AUCTIONS_PATH}
                  className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-amber-900 shadow-sm hover:bg-amber-100 dark:bg-zinc-800 dark:text-amber-200 dark:hover:bg-zinc-700"
                >
                  {moderation.cancelled_auctions_count} Cancelled Auctions
                </Link>
              )}
              {moderation.hidden_products_count > 0 && (
                <Link
                  href={ADMIN_PRODUCTS_PATH}
                  className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-amber-900 shadow-sm hover:bg-amber-100 dark:bg-zinc-800 dark:text-amber-200 dark:hover:bg-zinc-700"
                >
                  {moderation.hidden_products_count} Hidden Products
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5 — PRIMARY KPI CARDS */}
      <section aria-labelledby="primary-kpis-heading">
        <h2 id="primary-kpis-heading" className="sr-only">
          Primary Platform KPIs
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Platform Users"
            value={users?.total}
            hint={`${users?.buyers ?? 0} buyers, ${users?.sellers ?? 0} sellers`}
            icon={<Users className="h-5 w-5" />}
            loading={isLoading}
          />
          <MetricCard
            label="Live Auctions"
            value={auctions?.live}
            hint={`${auctions?.upcoming ?? 0} upcoming countdowns`}
            icon={<Gavel className="h-5 w-5" />}
            loading={isLoading}
            badge={
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                Active Bidding
              </span>
            }
          />
          <MetricCard
            label="Gross Volume (GMV)"
            value={formatAdminMoney(finance?.gross_paid_volume)}
            hint="Completed checkout ledger"
            icon={<DollarSign className="h-5 w-5" />}
            loading={isLoading}
          />
          <MetricCard
            label="Platform Fee Revenue"
            value={formatAdminMoney(finance?.platform_revenue)}
            hint="5.00% standard commission"
            icon={<Trophy className="h-5 w-5" />}
            loading={isLoading}
            badge={
              <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
                Revenue
              </span>
            }
          />
          <MetricCard
            label="Total Products Listed"
            value={products?.total}
            hint="Catalog inventory"
            icon={<Package className="h-5 w-5" />}
            loading={isLoading}
          />
          <MetricCard
            label="Total Bids Placed"
            value={bids?.total}
            hint="Real-time bidding events"
            icon={<Activity className="h-5 w-5" />}
            loading={isLoading}
          />
          <MetricCard
            label="Completed Sales"
            value={finance?.completed_sales_count}
            hint="Paid auction settlements"
            icon={<Store className="h-5 w-5" />}
            loading={isLoading}
          />
          <MetricCard
            label="Seller Net Earnings"
            value={formatAdminMoney(finance?.seller_net_total)}
            hint="Net after commission"
            icon={<UserCheck className="h-5 w-5" />}
            loading={isLoading}
          />
        </div>
      </section>

      {/* REAL-TIME BIDDING TIMELINE CHART */}
      <SectionCard
        title="Live Bidding Activity Progression"
        subtitle="Real-time escalation history from live marketplace auctions"
        action={
          <Link
            href={ADMIN_ANALYTICS_PATH}
            className="flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300"
          >
            <span>Full Analytics</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        }
      >
        <BiddingTimelineChart points={timelinePoints} height={260} />
      </SectionCard>

      {/* SECTION 6 & 7 — AUCTION STATUS & USER BREAKDOWNS WITH REAL CHARTS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* SECTION 6 — AUCTION LIFECYCLE OVERVIEW */}
        <SectionCard
          title="Auction Status Overview"
          subtitle="Real-time lifecycle breakdown across catalog states"
          action={
            <Link
              href={ADMIN_AUCTIONS_PATH}
              className="text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300"
            >
              View all ({auctions?.total ?? '…'})
            </Link>
          }
        >
          <div className="space-y-6">
            {/* Interactive Donut Chart */}
            <LifecycleDonutChart counts={auctions} height={200} />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Live
                </div>
                <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-white tabular-nums">
                  {isLoading ? '…' : auctions?.live ?? 0}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">In window</p>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                <div className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Upcoming
                </div>
                <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-white tabular-nums">
                  {isLoading ? '…' : auctions?.upcoming ?? 0}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Future start</p>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                <div className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-zinc-400 dark:bg-zinc-500" />
                  Closed
                </div>
                <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-white tabular-nums">
                  {isLoading ? '…' : auctions?.closed ?? 0}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Completed</p>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                <div className="flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-400">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  Cancelled
                </div>
                <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-white tabular-nums">
                  {isLoading ? '…' : auctions?.cancelled ?? 0}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Moderated/seller</p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* SECTION 7 — USER BREAKDOWN */}
        <SectionCard
          title="User Breakdown"
          subtitle="Directory composition by authoritative Django roles"
          action={
            <Link
              href={ADMIN_USERS_PATH}
              className="text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300"
            >
              Directory ({users?.total ?? '…'})
            </Link>
          }
        >
          <div className="space-y-6">
            {/* Interactive User Roles Donut Chart */}
            <UserRolesChart counts={users} height={200} />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Buyers</p>
                <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-white tabular-nums">
                  {isLoading ? '…' : users?.buyers ?? 0}
                </p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Market bidders</p>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Sellers</p>
                <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-white tabular-nums">
                  {isLoading ? '…' : users?.sellers ?? 0}
                </p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Product vendors</p>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Admins</p>
                <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-white tabular-nums">
                  {isLoading ? '…' : users?.admins ?? 0}
                </p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Staff / Superusers</p>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                <p className="text-xs text-rose-600 dark:text-rose-400">Suspended</p>
                <p className="mt-1 text-xl font-bold text-rose-700 dark:text-rose-300 tabular-nums">
                  {isLoading ? '…' : users?.suspended ?? 0}
                </p>
                <p className="text-[11px] text-rose-500/80">Account locked</p>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/30 dark:text-zinc-400">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">Active Directory Status:</span>{' '}
              {isLoading ? 'Loading…' : `${users?.active ?? 0} of ${users?.total ?? 0} accounts currently active and authenticated.`}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* SECTION 8 — FINANCIAL OVERVIEW */}
      <SectionCard
        title="Financial Ledger Overview"
        subtitle="Platform revenue and settlement snapshots from completed mock checkout payments"
      >
        <div className="space-y-6">
          <FinancialVolumeBar finance={finance} />

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <strong>Accounting Disclosure:</strong>{' '}
            {finance?.disclosure ??
              'Mock completed checkout ledger totals. Platform revenue is stored fee snapshots only — not bidding volume or external bank settlement.'}
          </p>
        </div>
      </SectionCard>

      {/* SECTION 9 — RECENT ACTIVITY CENTER */}
      <SectionCard
        title="Live Platform Activity"
        subtitle="Recent events across bidding, payments, cataloging, and registration"
      >
        {/* Activity Tabs */}
        <div className="flex border-b border-zinc-200 text-xs font-medium dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setActivityTab('bids')}
            className={`border-b-2 px-4 py-2.5 transition ${
              activityTab === 'bids'
                ? 'border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            Recent Bids ({recent?.bids?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActivityTab('payments')}
            className={`border-b-2 px-4 py-2.5 transition ${
              activityTab === 'payments'
                ? 'border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            Completed Payments ({recent?.payments?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActivityTab('auctions')}
            className={`border-b-2 px-4 py-2.5 transition ${
              activityTab === 'auctions'
                ? 'border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            New Auctions ({recent?.auctions?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActivityTab('products')}
            className={`border-b-2 px-4 py-2.5 transition ${
              activityTab === 'products'
                ? 'border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            Products ({recent?.products?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActivityTab('users')}
            className={`border-b-2 px-4 py-2.5 transition ${
              activityTab === 'users'
                ? 'border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            Users ({recent?.users?.length ?? 0})
          </button>
        </div>

        {/* Tab content */}
        <div className="mt-4">
          {activityTab === 'bids' && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th scope="col" className="py-2.5 pr-4">When</th>
                    <th scope="col" className="py-2.5 pr-4">Bidder</th>
                    <th scope="col" className="py-2.5 pr-4">Auction</th>
                    <th scope="col" className="py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {recent?.bids?.map((bid) => (
                    <tr key={bid.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                      <td className="py-2.5 pr-4 text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDateSafe(bid.timestamp)}
                      </td>
                      <td className="py-2.5 pr-4 font-medium text-zinc-900 dark:text-zinc-100">
                        {bid.bidder_username}
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-300">
                        <Link
                          href={`${ADMIN_AUCTIONS_PATH}/${bid.auction_id}`}
                          className="hover:text-violet-600 hover:underline"
                        >
                          {bid.auction_title || `Auction #${bid.auction_id}`}
                        </Link>
                      </td>
                      <td className="py-2.5 text-right font-semibold tabular-nums text-zinc-900 dark:text-white">
                        {formatAdminMoney(bid.amount)}
                      </td>
                    </tr>
                  ))}
                  {(!recent?.bids || recent.bids.length === 0) && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-zinc-400">
                        No recent bids recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activityTab === 'payments' && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th scope="col" className="py-2.5 pr-4">Date</th>
                    <th scope="col" className="py-2.5 pr-4">Buyer</th>
                    <th scope="col" className="py-2.5 pr-4">Auction</th>
                    <th scope="col" className="py-2.5 pr-4 text-right">Gross Amount</th>
                    <th scope="col" className="py-2.5 text-right">Platform Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {recent?.payments?.map((pay) => (
                    <tr key={pay.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                      <td className="py-2.5 pr-4 text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDateSafe(pay.created_at)}
                      </td>
                      <td className="py-2.5 pr-4 font-medium text-zinc-900 dark:text-zinc-100">
                        {pay.buyer_username}
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-300">
                        <Link
                          href={`${ADMIN_AUCTIONS_PATH}/${pay.auction_id}`}
                          className="hover:text-violet-600 hover:underline"
                        >
                          {pay.auction_title || `Auction #${pay.auction_id}`}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-zinc-900 dark:text-white">
                        {formatAdminMoney(pay.amount)}
                      </td>
                      <td className="py-2.5 text-right font-semibold tabular-nums text-violet-700 dark:text-violet-300">
                        {pay.platform_fee ? formatAdminMoney(pay.platform_fee) : '—'}
                      </td>
                    </tr>
                  ))}
                  {(!recent?.payments || recent.payments.length === 0) && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-zinc-400">
                        No completed checkout payments recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activityTab === 'auctions' && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th scope="col" className="py-2.5 pr-4">Title</th>
                    <th scope="col" className="py-2.5 pr-4">Seller</th>
                    <th scope="col" className="py-2.5 pr-4">Status</th>
                    <th scope="col" className="py-2.5 text-right">Current Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {recent?.auctions?.map((auc) => (
                    <tr key={auc.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                      <td className="py-2.5 pr-4 font-medium text-zinc-900 dark:text-zinc-100">
                        <Link
                          href={`${ADMIN_AUCTIONS_PATH}/${auc.id}`}
                          className="hover:text-violet-600 hover:underline"
                        >
                          {auc.title || `Auction #${auc.id}`}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-300">
                        {auc.seller_username}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                            auc.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : auc.status === 'CLOSED'
                              ? 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          {auc.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-semibold tabular-nums text-zinc-900 dark:text-white">
                        {formatAdminMoney(auc.current_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activityTab === 'products' && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th scope="col" className="py-2.5 pr-4">Title</th>
                    <th scope="col" className="py-2.5 pr-4">Seller</th>
                    <th scope="col" className="py-2.5 pr-4">Category</th>
                    <th scope="col" className="py-2.5 text-right">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {recent?.products?.map((prod) => (
                    <tr key={prod.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                      <td className="py-2.5 pr-4 font-medium text-zinc-900 dark:text-zinc-100">
                        <Link
                          href={`${ADMIN_PRODUCTS_PATH}/${prod.id}`}
                          className="hover:text-violet-600 hover:underline"
                        >
                          {prod.title}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-300">
                        {prod.seller_username}
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-500 dark:text-zinc-400">
                        {prod.category_name}
                      </td>
                      <td className="py-2.5 text-right text-xs text-zinc-400">
                        {formatDateSafe(prod.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activityTab === 'users' && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th scope="col" className="py-2.5 pr-4">Username</th>
                    <th scope="col" className="py-2.5 pr-4">Email</th>
                    <th scope="col" className="py-2.5 pr-4">Role</th>
                    <th scope="col" className="py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {recent?.users?.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                      <td className="py-2.5 pr-4 font-medium text-zinc-900 dark:text-zinc-100">
                        <Link
                          href={`${ADMIN_USERS_PATH}/${u.id}`}
                          className="hover:text-violet-600 hover:underline"
                        >
                          {u.username}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-500 dark:text-zinc-400">
                        {u.email}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="inline-flex rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                            u.is_active
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          {u.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>

      {/* SECTION 11 — QUICK NAVIGATION HUB */}
      <section aria-labelledby="quick-nav-heading">
        <h2 id="quick-nav-heading" className="text-base font-semibold text-zinc-900 dark:text-white">
          Admin Management Modules
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Direct human-friendly access to all supported BidKori back-office controllers.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Link
            href={ADMIN_USERS_PATH}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-violet-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-violet-600"
          >
            <div className="flex items-start justify-between">
              <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white dark:bg-violet-950/60 dark:text-violet-300 dark:group-hover:bg-violet-600">
                <Users className="h-5 w-5" aria-hidden />
              </span>
              <ArrowUpRight className="h-4 w-4 text-zinc-400 transition group-hover:text-violet-600 dark:group-hover:text-violet-400" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-zinc-900 group-hover:text-violet-700 dark:text-white dark:group-hover:text-violet-300">
              User Directory
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Manage accounts, roles, and reversible suspension actions.
            </p>
          </Link>

          <Link
            href={ADMIN_PRODUCTS_PATH}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-violet-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-violet-600"
          >
            <div className="flex items-start justify-between">
              <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white dark:bg-violet-950/60 dark:text-violet-300 dark:group-hover:bg-violet-600">
                <Package className="h-5 w-5" aria-hidden />
              </span>
              <ArrowUpRight className="h-4 w-4 text-zinc-400 transition group-hover:text-violet-600 dark:group-hover:text-violet-400" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-zinc-900 group-hover:text-violet-700 dark:text-white dark:group-hover:text-violet-300">
              Product Catalog
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Inspect product inventory, seller listings, and moderation flags.
            </p>
          </Link>

          <Link
            href={ADMIN_AUCTIONS_PATH}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-violet-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-violet-600"
          >
            <div className="flex items-start justify-between">
              <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white dark:bg-violet-950/60 dark:text-violet-300 dark:group-hover:bg-violet-600">
                <Gavel className="h-5 w-5" aria-hidden />
              </span>
              <ArrowUpRight className="h-4 w-4 text-zinc-400 transition group-hover:text-violet-600 dark:group-hover:text-violet-400" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-zinc-900 group-hover:text-violet-700 dark:text-white dark:group-hover:text-violet-300">
              Auctions Engine
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Monitor active auctions, cancel problematic listings, and review results.
            </p>
          </Link>

          <Link
            href={ADMIN_BIDS_PATH}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-violet-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-violet-600"
          >
            <div className="flex items-start justify-between">
              <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white dark:bg-violet-950/60 dark:text-violet-300 dark:group-hover:bg-violet-600">
                <Activity className="h-5 w-5" aria-hidden />
              </span>
              <ArrowUpRight className="h-4 w-4 text-zinc-400 transition group-hover:text-violet-600 dark:group-hover:text-violet-400" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-zinc-900 group-hover:text-violet-700 dark:text-white dark:group-hover:text-violet-300">
              Bids & Escalations
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Audit realtime bidding increments and participant history.
            </p>
          </Link>

          <Link
            href={ADMIN_ANALYTICS_PATH}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-violet-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-violet-600"
          >
            <div className="flex items-start justify-between">
              <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white dark:bg-violet-950/60 dark:text-violet-300 dark:group-hover:bg-violet-600">
                <BarChart3 className="h-5 w-5" aria-hidden />
              </span>
              <ArrowUpRight className="h-4 w-4 text-zinc-400 transition group-hover:text-violet-600 dark:group-hover:text-violet-400" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-zinc-900 group-hover:text-violet-700 dark:text-white dark:group-hover:text-violet-300">
              Platform Analytics
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Category performance, top active bidders, and volume analysis.
            </p>
          </Link>

          <Link
            href={ADMIN_PROFILE_PATH}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-violet-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-violet-600"
          >
            <div className="flex items-start justify-between">
              <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white dark:bg-violet-950/60 dark:text-violet-300 dark:group-hover:bg-violet-600">
                <User className="h-5 w-5" aria-hidden />
              </span>
              <ArrowUpRight className="h-4 w-4 text-zinc-400 transition group-hover:text-violet-600 dark:group-hover:text-violet-400" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-zinc-900 group-hover:text-violet-700 dark:text-white dark:group-hover:text-violet-300">
              Admin Profile
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Staff user identity, permissions, and email configuration.
            </p>
          </Link>

          <Link
            href={ADMIN_SETTINGS_PATH}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-violet-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-violet-600"
          >
            <div className="flex items-start justify-between">
              <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white dark:bg-violet-950/60 dark:text-violet-300 dark:group-hover:bg-violet-600">
                <Settings className="h-5 w-5" aria-hidden />
              </span>
              <ArrowUpRight className="h-4 w-4 text-zinc-400 transition group-hover:text-violet-600 dark:group-hover:text-violet-400" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-zinc-900 group-hover:text-violet-700 dark:text-white dark:group-hover:text-violet-300">
              Account Settings
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Security settings, session management, and password controls.
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}
