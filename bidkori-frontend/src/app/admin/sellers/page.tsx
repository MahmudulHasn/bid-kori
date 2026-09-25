'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import useSWR from 'swr';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Filter,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  X,
  XCircle,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

import {
  fetchAdminVerifications,
  approveSellerVerification,
  rejectSellerVerification,
} from '@/lib/sellerVerificationApi';
import { getMediaOrigin } from '@/lib/config';
import type { AdminSellerVerification } from '@/lib/types';

function resolveImageUrl(path: string | undefined): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const origin = getMediaOrigin();
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
}

export default function AdminSellersPage() {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVerification, setSelectedVerification] = useState<AdminSellerVerification | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const {
    data: verifications,
    error,
    isLoading,
    mutate,
  } = useSWR('/admin/verifications/', () => fetchAdminVerifications());

  const filteredVerifications = useMemo(() => {
    if (!verifications) return [];
    return verifications.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchUser = item.username.toLowerCase().includes(q);
        const matchEmail = item.email.toLowerCase().includes(q);
        const matchPhone = item.whatsapp_number.toLowerCase().includes(q);
        const matchLoc = item.location.toLowerCase().includes(q);
        if (!matchUser && !matchEmail && !matchPhone && !matchLoc) {
          return false;
        }
      }
      return true;
    });
  }, [verifications, statusFilter, searchQuery]);

  const counts = useMemo(() => {
    if (!verifications) return { all: 0, pending: 0, approved: 0, rejected: 0 };
    return {
      all: verifications.length,
      pending: verifications.filter((v) => v.status === 'PENDING').length,
      approved: verifications.filter((v) => v.status === 'APPROVED').length,
      rejected: verifications.filter((v) => v.status === 'REJECTED').length,
    };
  }, [verifications]);

  const handleApprove = async (id: number) => {
    try {
      setActionLoading(true);
      const updated = await approveSellerVerification(id);
      toast.success(`Verification approved for ${updated.username}`);
      await mutate();
      if (selectedVerification?.id === id) {
        setSelectedVerification(updated);
      }
    } catch {
      toast.error('Failed to approve seller verification.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (id: number) => {
    try {
      setActionLoading(true);
      const updated = await rejectSellerVerification(id, rejectNote);
      toast.success(`Verification rejected for ${updated.username}`);
      setRejecting(false);
      setRejectNote('');
      await mutate();
      if (selectedVerification?.id === id) {
        setSelectedVerification(updated);
      }
    } catch {
      toast.error('Failed to reject seller verification.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
            Seller Verifications
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Review identity documents (NID / Passport) and approve or reject seller applications.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void mutate()}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 self-start sm:self-center"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </header>

      {/* Metrics / Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            statusFilter === 'ALL'
              ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
          }`}
        >
          All Applications
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              statusFilter === 'ALL'
                ? 'bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900'
                : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300'
            }`}
          >
            {counts.all}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('PENDING')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            statusFilter === 'PENDING'
              ? 'bg-amber-500 text-zinc-950 font-bold shadow'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
          }`}
        >
          <Clock className="h-4 w-4" />
          Pending Review
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              statusFilter === 'PENDING'
                ? 'bg-zinc-950/20 text-zinc-950'
                : 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300'
            }`}
          >
            {counts.pending}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('APPROVED')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            statusFilter === 'APPROVED'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          Approved
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              statusFilter === 'APPROVED'
                ? 'bg-emerald-800 text-white'
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
            }`}
          >
            {counts.approved}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('REJECTED')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            statusFilter === 'REJECTED'
              ? 'bg-rose-600 text-white shadow'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
          }`}
        >
          <XCircle className="h-4 w-4" />
          Rejected
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              statusFilter === 'REJECTED'
                ? 'bg-rose-800 text-white'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
            }`}
          >
            {counts.rejected}
          </span>
        </button>
      </div>

      {/* Search Input */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            placeholder="Search by username, email, phone, location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          Failed to load seller verification requests.
        </div>
      ) : filteredVerifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <Shield className="mx-auto h-12 w-12 text-zinc-400" />
          <h3 className="mt-3 text-base font-semibold text-zinc-900 dark:text-white">
            No seller verification requests found
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {statusFilter !== 'ALL'
              ? `There are currently no requests with status: ${statusFilter}.`
              : 'New seller verification requests will appear here once submitted.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="px-6 py-4">Seller Account</th>
                  <th scope="col" className="px-6 py-4">Contact Info</th>
                  <th scope="col" className="px-6 py-4">Location</th>
                  <th scope="col" className="px-6 py-4">Status</th>
                  <th scope="col" className="px-6 py-4">Submitted</th>
                  <th scope="col" className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredVerifications.map((item) => {
                  const cleanPhone = item.whatsapp_number.replace(/\D/g, '');
                  const waUrl = `https://wa.me/${cleanPhone}`;

                  return (
                    <tr
                      key={item.id}
                      className="transition hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {item.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-zinc-900 dark:text-white">
                              {item.username}
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              {item.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          {item.whatsapp_number}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                          <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                          {item.location}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        {item.status === 'APPROVED' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-500/30">
                            <CheckCircle2 className="h-3 w-3" />
                            Approved
                          </span>
                        ) : item.status === 'PENDING' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-500/30">
                            <Clock className="h-3 w-3" />
                            Pending Review
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-500/30">
                            <XCircle className="h-3 w-3" />
                            Rejected
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-xs text-zinc-500 dark:text-zinc-400">
                        {new Date(item.submitted_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedVerification(item);
                            setRejecting(false);
                            setRejectNote('');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-xs transition hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review Modal Dialog */}
      {selectedVerification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
          <div className="relative w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl transition-all dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
            <button
              type="button"
              onClick={() => setSelectedVerification(null)}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                  Seller Document Verification
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Review applicant details and official ID documentation.
                </p>
              </div>
            </div>

            {/* Document Image View */}
            <div className="mb-6 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  NID / Passport Document Photo
                </label>
                {selectedVerification.nid_passport_image && (
                  <a
                    href={resolveImageUrl(selectedVerification.nid_passport_image)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
                  >
                    Open original image in full size <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              <div className="relative h-64 w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 p-2 dark:border-zinc-700">
                {selectedVerification.nid_passport_image ? (
                  <Image
                    src={resolveImageUrl(selectedVerification.nid_passport_image)}
                    alt={`NID/Passport for ${selectedVerification.username}`}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                    No image available
                  </div>
                )}
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Seller Account
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">
                  {selectedVerification.username}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {selectedVerification.email}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  WhatsApp Contact
                </p>
                <div className="mt-1">
                  <a
                    href={`https://wa.me/${selectedVerification.whatsapp_number.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    <MessageCircle className="h-4 w-4" />
                    {selectedVerification.whatsapp_number}
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Registered Location
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-800 dark:text-zinc-200">
                  <MapPin className="h-4 w-4 text-zinc-400 shrink-0" />
                  {selectedVerification.location}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Current Status
                </p>
                <div className="mt-1">
                  {selectedVerification.status === 'APPROVED' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Approved
                    </span>
                  ) : selectedVerification.status === 'PENDING' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                      <Clock className="h-3 w-3" />
                      Pending Review
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                      <XCircle className="h-3 w-3" />
                      Rejected
                    </span>
                  )}
                </div>
              </div>
            </div>

            {selectedVerification.admin_note && (
              <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 text-xs text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">
                <p className="font-semibold">Rejection Note on Record:</p>
                <p className="mt-1">{selectedVerification.admin_note}</p>
              </div>
            )}

            {/* Rejection Form Input */}
            {rejecting && (
              <div className="mb-6 space-y-3 rounded-xl border border-rose-200 bg-rose-50/40 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
                <label className="block text-xs font-semibold uppercase tracking-wider text-rose-900 dark:text-rose-300">
                  Reason for Rejection (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. The uploaded NID image is blurry. Please upload a clear photo."
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  className="w-full rounded-lg border border-rose-300 bg-white p-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-rose-500 focus:outline-none dark:border-rose-800 dark:bg-zinc-900 dark:text-white"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRejecting(false)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(selectedVerification.id)}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                  >
                    {actionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                    Confirm Rejection
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {!rejecting && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedVerification(null)}
                  className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Close
                </button>

                <div className="flex items-center gap-3">
                  {selectedVerification.status !== 'REJECTED' && (
                    <button
                      type="button"
                      onClick={() => setRejecting(true)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 shadow-xs transition hover:bg-rose-50 dark:border-rose-800 dark:bg-zinc-900 dark:text-rose-400 dark:hover:bg-rose-950/20"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject Application
                    </button>
                  )}

                  {selectedVerification.status !== 'APPROVED' && (
                    <button
                      type="button"
                      onClick={() => handleApprove(selectedVerification.id)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
                    >
                      {actionLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Approving...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Approve Verification
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
