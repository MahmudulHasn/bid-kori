'use client';

import Link from 'next/link';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Eye,
  EyeOff,
  Gavel,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import useSWR from 'swr';

import {
  ADMIN_DASHBOARD_SUMMARY_API_PATH,
  adminDashboardSummaryFetcher,
} from '@/lib/adminDashboardApi';
import {
  adminUsersListFetcher,
  reactivateAdminUser,
} from '@/lib/adminUsersApi';
import {
  auctionListFetcher,
} from '@/lib/auctionsApi';
import {
  productListFetcher,
} from '@/lib/productsApi';
import {
  restoreAdminAuction,
  restoreAdminProduct,
} from '@/lib/adminModerationApi';
import {
  getAdminAuctionTitle,
  getAdminAuctionSellerLabel,
  adminAuctionDetailPath,
} from '@/lib/adminAuctions';
import {
  adminProductDetailPath,
  formatAdminProductSeller,
  formatAdminProductCondition,
} from '@/lib/adminProducts';
import {
  ADMIN_USERS_PATH,
  ADMIN_AUCTIONS_PATH,
  ADMIN_PRODUCTS_PATH,
} from '@/lib/workspaceNavigation';
import { formatAdminMoney } from '@/lib/adminDashboard';
import { getApiErrorMessage } from '@/lib/apiErrors';
import type { AdminUser, Auction, Product } from '@/lib/types';

type ModerationTab = 'suspended_users' | 'hidden_auctions' | 'hidden_products' | 'cancelled_auctions';

export default function AdminModerationPage() {
  const [activeTab, setActiveTab] = useState<ModerationTab>('suspended_users');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | number | null>(null);

  // SWR: Moderation Attention Summary
  const {
    data: summaryData,
    mutate: mutateSummary,
  } = useSWR(ADMIN_DASHBOARD_SUMMARY_API_PATH, adminDashboardSummaryFetcher);

  // SWR: Suspended Users
  const {
    data: usersData,
    error: usersError,
    isLoading: usersLoading,
    mutate: mutateUsers,
  } = useSWR('/admin/users/?is_active=false', adminUsersListFetcher);

  // SWR: Auctions (all for filtering hidden / cancelled)
  const {
    data: auctionsData,
    error: auctionsError,
    isLoading: auctionsLoading,
    mutate: mutateAuctions,
  } = useSWR('/auctions/', auctionListFetcher);

  // SWR: Products (all for filtering hidden)
  const {
    data: productsData,
    error: productsError,
    isLoading: productsLoading,
    mutate: mutateProducts,
  } = useSWR('/products/', productListFetcher);

  const moderation = summaryData?.moderation;

  // Filtered lists
  const suspendedUsers: AdminUser[] = useMemo(() => {
    const list = usersData?.results || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q),
    );
  }, [usersData, searchQuery]);

  const hiddenAuctions: Auction[] = useMemo(() => {
    const list = (auctionsData || []).filter((a) => a.is_hidden === true);
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (a) =>
        getAdminAuctionTitle(a).toLowerCase().includes(q) ||
        getAdminAuctionSellerLabel(a).toLowerCase().includes(q),
    );
  }, [auctionsData, searchQuery]);

  const hiddenProducts: Product[] = useMemo(() => {
    const list = (productsData || []).filter((p) => p.is_hidden === true);
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        formatAdminProductSeller(p.seller).toLowerCase().includes(q),
    );
  }, [productsData, searchQuery]);

  const cancelledAuctions: Auction[] = useMemo(() => {
    const list = (auctionsData || []).filter((a) => a.status === 'CANCELLED');
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (a) =>
        getAdminAuctionTitle(a).toLowerCase().includes(q) ||
        getAdminAuctionSellerLabel(a).toLowerCase().includes(q),
    );
  }, [auctionsData, searchQuery]);

  // Actions
  const handleReactivateUser = async (user: AdminUser) => {
    try {
      setActingId(user.id);
      setActionError(null);
      await reactivateAdminUser(user.id);
      setActionSuccess(`User account @${user.username} has been reactivated successfully.`);
      await Promise.all([mutateUsers(), mutateSummary()]);
    } catch (err) {
      setActionError(getApiErrorMessage(err, `Failed to reactivate @${user.username}`));
    } finally {
      setActingId(null);
    }
  };

  const handleRestoreAuction = async (auction: Auction) => {
    try {
      setActingId(auction.id);
      setActionError(null);
      await restoreAdminAuction(auction.id);
      setActionSuccess(`Auction #${auction.id} restored to public marketplace.`);
      await Promise.all([mutateAuctions(), mutateSummary()]);
    } catch (err) {
      setActionError(getApiErrorMessage(err, `Failed to restore auction #${auction.id}`));
    } finally {
      setActingId(null);
    }
  };

  const handleRestoreProduct = async (product: Product) => {
    try {
      setActingId(product.id);
      setActionError(null);
      await restoreAdminProduct(product.id);
      setActionSuccess(`Product "${product.title}" restored successfully.`);
      await Promise.all([mutateProducts(), mutateSummary()]);
    } catch (err) {
      setActionError(getApiErrorMessage(err, `Failed to restore product "${product.title}"`));
    } finally {
      setActingId(null);
    }
  };

  const refreshAll = () => {
    void Promise.all([mutateSummary(), mutateUsers(), mutateAuctions(), mutateProducts()]);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
              Moderation Center
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
              Compliance & Safety
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Review and restore suspended users, hidden marketplace listings, and cancelled auctions.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshAll}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Refresh Queue
        </button>
      </header>

      {/* Notifications */}
      {actionSuccess && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p>{actionSuccess}</p>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <p>{actionError}</p>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-600 hover:text-rose-900 dark:text-rose-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Summary KPI Pills */}
      <section aria-label="Moderation queue overview" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setActiveTab('suspended_users')}
          className={`flex flex-col rounded-2xl border p-4 text-left transition-all ${
            activeTab === 'suspended_users'
              ? 'border-violet-500 bg-violet-50/60 ring-2 ring-violet-500/20 dark:border-violet-500/60 dark:bg-violet-950/20'
              : 'border-zinc-200/80 bg-white hover:border-zinc-300 hover:bg-zinc-50/80 hover:shadow-xs dark:border-zinc-800 dark:bg-zinc-900/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Suspended Users
            </span>
            <Users className="h-4 w-4 text-rose-500" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">
            {moderation?.suspended_users_count ?? suspendedUsers.length}
          </p>
          <span className="mt-1 text-[11px] text-zinc-400">Locked accounts</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('hidden_auctions')}
          className={`flex flex-col rounded-2xl border p-4 text-left transition-all ${
            activeTab === 'hidden_auctions'
              ? 'border-violet-500 bg-violet-50/60 ring-2 ring-violet-500/20 dark:border-violet-500/60 dark:bg-violet-950/20'
              : 'border-zinc-200/80 bg-white hover:border-zinc-300 hover:bg-zinc-50/80 hover:shadow-xs dark:border-zinc-800 dark:bg-zinc-900/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Hidden Auctions
            </span>
            <EyeOff className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">
            {moderation?.hidden_auctions_count ?? hiddenAuctions.length}
          </p>
          <span className="mt-1 text-[11px] text-zinc-400">Removed from market</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('hidden_products')}
          className={`flex flex-col rounded-2xl border p-4 text-left transition-all ${
            activeTab === 'hidden_products'
              ? 'border-violet-500 bg-violet-50/60 ring-2 ring-violet-500/20 dark:border-violet-500/60 dark:bg-violet-950/20'
              : 'border-zinc-200/80 bg-white hover:border-zinc-300 hover:bg-zinc-50/80 hover:shadow-xs dark:border-zinc-800 dark:bg-zinc-900/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Hidden Products
            </span>
            <Package className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">
            {moderation?.hidden_products_count ?? hiddenProducts.length}
          </p>
          <span className="mt-1 text-[11px] text-zinc-400">Blocked inventory</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cancelled_auctions')}
          className={`flex flex-col rounded-2xl border p-4 text-left transition-all ${
            activeTab === 'cancelled_auctions'
              ? 'border-violet-500 bg-violet-50/60 ring-2 ring-violet-500/20 dark:border-violet-500/60 dark:bg-violet-950/20'
              : 'border-zinc-200/80 bg-white hover:border-zinc-300 hover:bg-zinc-50/80 hover:shadow-xs dark:border-zinc-800 dark:bg-zinc-900/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Cancelled
            </span>
            <Ban className="h-4 w-4 text-zinc-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">
            {moderation?.cancelled_auctions_count ?? cancelledAuctions.length}
          </p>
          <span className="mt-1 text-[11px] text-zinc-400">Audit history</span>
        </button>
      </section>

      {/* Main Table Card */}
      <section className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
        {/* Search & Tabs Controls */}
        <div className="flex flex-col gap-4 border-b border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in queue…"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-2 pl-9 pr-3 text-xs placeholder:text-zinc-400 focus:border-violet-500 focus:bg-white focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder:text-zinc-500 dark:focus:bg-zinc-900"
            />
          </div>

          <div className="flex flex-wrap gap-1 rounded-xl bg-zinc-100 p-1 text-xs font-medium dark:bg-zinc-800">
            <button
              type="button"
              onClick={() => setActiveTab('suspended_users')}
              className={`rounded-lg px-3 py-1.5 transition ${
                activeTab === 'suspended_users'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-white'
                  : 'text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-white'
              }`}
            >
              Users ({suspendedUsers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('hidden_auctions')}
              className={`rounded-lg px-3 py-1.5 transition ${
                activeTab === 'hidden_auctions'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-white'
                  : 'text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-white'
              }`}
            >
              Auctions ({hiddenAuctions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('hidden_products')}
              className={`rounded-lg px-3 py-1.5 transition ${
                activeTab === 'hidden_products'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-white'
                  : 'text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-white'
              }`}
            >
              Products ({hiddenProducts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cancelled_auctions')}
              className={`rounded-lg px-3 py-1.5 transition ${
                activeTab === 'cancelled_auctions'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-white'
                  : 'text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-white'
              }`}
            >
              Cancelled ({cancelledAuctions.length})
            </button>
          </div>
        </div>

        {/* TAB 1: Suspended Users */}
        {activeTab === 'suspended_users' && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400">
                  <th scope="col" className="px-6 py-3">User</th>
                  <th scope="col" className="px-6 py-3">Email</th>
                  <th scope="col" className="px-6 py-3">Role</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {suspendedUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                          {u.username.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <Link
                            href={`${ADMIN_USERS_PATH}/${u.id}`}
                            className="font-medium text-zinc-900 hover:text-violet-600 hover:underline dark:text-white"
                          >
                            @{u.username}
                          </Link>
                          <p className="text-[11px] text-zinc-400">ID #{u.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-600 dark:text-zinc-300">
                      {u.email}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium capitalize text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {u.role.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                        Suspended
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => void handleReactivateUser(u)}
                        disabled={actingId === u.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        {actingId === u.id ? 'Reactivating…' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
                {suspendedUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-sm text-zinc-400">
                      <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500 opacity-60" />
                      <p className="mt-2 font-medium text-zinc-700 dark:text-zinc-300">
                        No suspended user accounts
                      </p>
                      <p className="text-xs text-zinc-400">All registered users are in active good standing.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: Hidden Auctions */}
        {activeTab === 'hidden_auctions' && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400">
                  <th scope="col" className="px-6 py-3">Auction</th>
                  <th scope="col" className="px-6 py-3">Seller</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3 text-right">Current Bid</th>
                  <th scope="col" className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {hiddenAuctions.map((a) => (
                  <tr key={a.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                    <td className="px-6 py-4">
                      <div>
                        <Link
                          href={adminAuctionDetailPath(a.id)}
                          className="font-medium text-zinc-900 hover:text-violet-600 hover:underline dark:text-white"
                        >
                          {getAdminAuctionTitle(a)}
                        </Link>
                        <p className="text-[11px] text-zinc-400">Auction ID #{a.id}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-600 dark:text-zinc-300">
                      {getAdminAuctionSellerLabel(a)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        Hidden
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-semibold tabular-nums text-zinc-900 dark:text-white">
                      {formatAdminMoney(a.current_highest_bid ?? a.starting_bid)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => void handleRestoreAuction(a)}
                        disabled={actingId === a.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {actingId === a.id ? 'Restoring…' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))}
                {hiddenAuctions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-sm text-zinc-400">
                      <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500 opacity-60" />
                      <p className="mt-2 font-medium text-zinc-700 dark:text-zinc-300">
                        No hidden auctions
                      </p>
                      <p className="text-xs text-zinc-400">All auctions are currently visible on the marketplace.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: Hidden Products */}
        {activeTab === 'hidden_products' && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400">
                  <th scope="col" className="px-6 py-3">Product</th>
                  <th scope="col" className="px-6 py-3">Seller</th>
                  <th scope="col" className="px-6 py-3">Condition</th>
                  <th scope="col" className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {hiddenProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                    <td className="px-6 py-4">
                      <div>
                        <Link
                          href={adminProductDetailPath(p.id)}
                          className="font-medium text-zinc-900 hover:text-violet-600 hover:underline dark:text-white"
                        >
                          {p.title}
                        </Link>
                        <p className="text-[11px] text-zinc-400">Product #{p.id}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-600 dark:text-zinc-300">
                      {formatAdminProductSeller(p.seller)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {formatAdminProductCondition(p.condition)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => void handleRestoreProduct(p)}
                        disabled={actingId === p.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {actingId === p.id ? 'Restoring…' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))}
                {hiddenProducts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-sm text-zinc-400">
                      <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500 opacity-60" />
                      <p className="mt-2 font-medium text-zinc-700 dark:text-zinc-300">
                        No hidden products
                      </p>
                      <p className="text-xs text-zinc-400">All products in the catalog are visible.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 4: Cancelled Auctions */}
        {activeTab === 'cancelled_auctions' && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400">
                  <th scope="col" className="px-6 py-3">Auction</th>
                  <th scope="col" className="px-6 py-3">Seller</th>
                  <th scope="col" className="px-6 py-3">Lifecycle State</th>
                  <th scope="col" className="px-6 py-3 text-right">Starting Bid</th>
                  <th scope="col" className="px-6 py-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {cancelledAuctions.map((a) => (
                  <tr key={a.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                    <td className="px-6 py-4">
                      <div>
                        <span className="font-medium text-zinc-900 dark:text-white">
                          {getAdminAuctionTitle(a)}
                        </span>
                        <p className="text-[11px] text-zinc-400">ID #{a.id}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-600 dark:text-zinc-300">
                      {getAdminAuctionSellerLabel(a)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        CANCELLED (Terminal)
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
                      {formatAdminMoney(a.starting_bid)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={adminAuctionDetailPath(a.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:underline dark:text-violet-400"
                      >
                        Inspect
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {cancelledAuctions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-sm text-zinc-400">
                      <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500 opacity-60" />
                      <p className="mt-2 font-medium text-zinc-700 dark:text-zinc-300">
                        No cancelled auctions recorded
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
