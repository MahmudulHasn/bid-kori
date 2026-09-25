'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import {
  AlertCircle,
  FileCheck2,
  Phone,
  MapPin,
  Shield,
  UploadCloud,
  X,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { submitSellerVerification } from '@/lib/sellerVerificationApi';
import { useAuth } from '@/context/AuthContext';

type SellerVerificationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialWhatsapp?: string;
  initialLocation?: string;
};

export default function SellerVerificationModal({
  isOpen,
  onClose,
  onSuccess,
  initialWhatsapp = '',
  initialLocation = '',
}: SellerVerificationModalProps) {
  const { refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [whatsapp, setWhatsapp] = useState(initialWhatsapp);
  const [location, setLocation] = useState(initialLocation);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, JPEG, WEBP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit.');
      return;
    }

    setError(null);
    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedFile) {
      setError('Please upload an image of your NID or Passport.');
      return;
    }

    const cleanPhone = whatsapp.trim();
    if (!cleanPhone || cleanPhone.length < 10) {
      setError('Please enter a valid WhatsApp number (at least 10 digits).');
      return;
    }

    const cleanLocation = location.trim();
    if (!cleanLocation || cleanLocation.length < 2) {
      setError('Please provide your location or business address.');
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('nid_passport_image', selectedFile);
      formData.append('whatsapp_number', cleanPhone);
      formData.append('location', cleanLocation);

      await submitSellerVerification(formData);
      toast.success('Verification submitted! Our team will review it shortly.');
      await refreshUser();
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: unknown) {
      const respData = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      let errMsg = 'Failed to submit verification. Please try again.';
      if (respData) {
        if (typeof respData.detail === 'string') {
          errMsg = respData.detail;
        } else if (typeof respData.message === 'string') {
          errMsg = respData.message;
        } else {
          const firstKey = Object.keys(respData)[0];
          const val = respData[firstKey];
          if (Array.isArray(val) && val.length > 0) {
            errMsg = `${firstKey}: ${val[0]}`;
          }
        }
      }
      setError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl transition-all dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
              Seller Identity Verification
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 sm:text-sm">
              Verify your identity to unlock product listing capabilities.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-500" />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* NID / Passport Document Upload */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              National ID or Passport Photo <span className="text-rose-500">*</span>
            </label>
            <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              Upload a clear photo of your official NID card or passport information page.
            </p>

            {previewUrl ? (
              <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800">
                <div className="relative h-44 w-full rounded-lg overflow-hidden">
                  <Image
                    src={previewUrl}
                    alt="Document preview"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
                <div className="mt-2 flex items-center justify-between px-2">
                  <div className="flex items-center gap-2 truncate text-xs text-zinc-600 dark:text-zinc-300">
                    <FileCheck2 className="h-4 w-4 text-emerald-500" />
                    <span className="truncate">{selectedFile?.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    disabled={submitting}
                    className="text-xs font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400"
                  >
                    Change photo
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50/50 p-6 text-center transition hover:border-amber-500 hover:bg-amber-50/20 dark:border-zinc-700 dark:bg-zinc-800/40 dark:hover:border-amber-400 dark:hover:bg-amber-950/10"
              >
                <div className="rounded-full bg-zinc-100 p-3 text-zinc-500 transition group-hover:bg-amber-100 group-hover:text-amber-600 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-amber-900/40 dark:group-hover:text-amber-400">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  Click to upload NID or Passport
                </p>
                <p className="text-xs text-zinc-400">PNG, JPG, or WEBP up to 10MB</p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* WhatsApp Number */}
          <div>
            <label
              htmlFor="verification-whatsapp"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
            >
              WhatsApp Contact Number <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                <Phone className="h-4 w-4" />
              </div>
              <input
                id="verification-whatsapp"
                type="tel"
                placeholder="+880 1700 000000"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                disabled={submitting}
                className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-sm text-zinc-900 transition placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-amber-400 dark:focus:ring-amber-400/20"
              />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              Used by administration for urgent verification follow-ups and winner settlements.
            </p>
          </div>

          {/* Location / Business Address */}
          <div>
            <label
              htmlFor="verification-location"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
            >
              Location / City / Address <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                <MapPin className="h-4 w-4" />
              </div>
              <input
                id="verification-location"
                type="text"
                placeholder="e.g. Uttara, Dhaka, Bangladesh"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={submitting}
                className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-sm text-zinc-900 transition placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-amber-400 dark:focus:ring-amber-400/20"
              />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              Your registered location helps ensure trusted local fulfillment.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-zinc-900 shadow-md transition hover:bg-amber-400 active:scale-95 disabled:pointer-events-none disabled:opacity-60 dark:bg-amber-400 dark:hover:bg-amber-300"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit for Verification'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
