'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useId, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Gavel,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  Truck,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useSWR from 'swr';

import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage, getApiStatus } from '@/lib/apiErrors';
import { formatAuctionMoney, getAuctionTitle } from '@/lib/auctionDisplay';
import { AUCTIONS_LIST_API_PATH, auctionListFetcher } from '@/lib/auctionsApi';
import { MARKETPLACE_ROUTES } from '@/lib/marketplace';
import type { Auction, ContactMethod } from '@/lib/types';
import {
  BD_DIVISIONS,
  fetchWinnerDetails,
  getResumeStep,
  getStepPercentage,
  saveWinnerDetailsDraft,
  submitWinnerDetails,
  validateStep1,
  validateStep2,
  validateStep3,
} from '@/lib/winnerDetails';

const STEPS = [
  { id: 1, label: 'Personal Information', shortLabel: 'Personal', icon: User },
  { id: 2, label: 'Delivery Address', shortLabel: 'Address', icon: MapPin },
  { id: 3, label: 'Delivery Preferences', shortLabel: 'Preferences', icon: Truck },
  { id: 4, label: 'Review & Submit', shortLabel: 'Review', icon: CheckCircle2 },
] as const;

export default function WinnerDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const auctionId = Number(params?.auctionId);

  // Accessible IDs for form fields
  const fullNameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const addressLineId = useId();
  const areaId = useId();
  const districtId = useId();
  const divisionId = useId();
  const postalCodeId = useId();
  const deliveryNoteId = useId();

  // Fetch auction details to display thumbnail, title, winning amount
  const { data: auctions } = useSWR(
    AUCTIONS_LIST_API_PATH,
    auctionListFetcher,
  );

  const auction: Auction | undefined = useMemo(() => {
    if (!Number.isFinite(auctionId) || !auctions) return undefined;
    return auctions.find((a) => a.id === auctionId);
  }, [auctions, auctionId]);

  // Winner Details state
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);

  // Wizard state
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form field states
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [area, setArea] = useState('');
  const [district, setDistrict] = useState('Dhaka');
  const [division, setDivision] = useState('Dhaka');
  const [postalCode, setPostalCode] = useState('');
  const [contactMethod, setContactMethod] = useState<ContactMethod>('PHONE');
  const [deliveryNote, setDeliveryNote] = useState('');

  // Initial load: Fetch saved draft or template
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push(`/login?next=/buyer/won/${auctionId}/details`);
      return;
    }

    let isMounted = true;

    async function loadDetails() {
      if (!Number.isFinite(auctionId)) {
        if (isMounted) {
          setFetchError('Invalid auction ID.');
          setInitialLoading(false);
        }
        return;
      }

      try {
        setInitialLoading(true);
        setFetchError(null);
        setIsForbidden(false);

        const data = await fetchWinnerDetails(auctionId);
        if (!isMounted) return;

        setFullName(data.full_name || user?.username || '');
        setPhone(data.phone || '');
        setEmail(data.email || user?.email || '');
        setAddressLine(data.address_line || '');
        setArea(data.area || '');
        setDistrict(data.district || 'Dhaka');
        setDivision(data.division || 'Dhaka');
        setPostalCode(data.postal_code || '');
        setContactMethod(data.preferred_contact_method || 'PHONE');
        setDeliveryNote(data.delivery_note || '');

        if (data.status === 'COMPLETED') {
          setCurrentStep(4);
          setSubmitSuccess(true);
        } else {
          const resumeStep = getResumeStep(data.completed_step, data.status);
          setCurrentStep(resumeStep);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const statusCode = getApiStatus(err);
        if (statusCode === 403) {
          setIsForbidden(true);
          setFetchError('Access denied: Only the winning bidder of this auction can access winner fulfillment details.');
        } else if (statusCode === 404) {
          setFetchError('Auction not found.');
        } else {
          setFetchError(getApiErrorMessage(err, 'Failed to load winner fulfillment details.'));
        }
      } finally {
        if (isMounted) setInitialLoading(false);
      }
    }

    void loadDetails();

    return () => {
      isMounted = false;
    };
  }, [auctionId, isAuthenticated, authLoading, router, user]);

  // Handle advancing through wizard steps with draft persistence
  const handleNextStep = async () => {
    setErrors({});

    if (currentStep === 1) {
      const v = validateStep1({ full_name: fullName, phone, email });
      if (!v.valid) {
        setErrors(v.errors);
        return;
      }
      try {
        setSavingDraft(true);
        await saveWinnerDetailsDraft(
          auctionId,
          {
            full_name: fullName.trim(),
            phone: phone.trim(),
            email: email.trim(),
          },
          1,
        );
        setCurrentStep(2);
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Failed to save personal information draft.'));
      } finally {
        setSavingDraft(false);
      }
    } else if (currentStep === 2) {
      const v = validateStep2({
        address_line: addressLine,
        area,
        district,
        division,
        postal_code: postalCode,
      });
      if (!v.valid) {
        setErrors(v.errors);
        return;
      }
      try {
        setSavingDraft(true);
        await saveWinnerDetailsDraft(
          auctionId,
          {
            address_line: addressLine.trim(),
            area: area.trim(),
            district: district.trim(),
            division: division.trim(),
            postal_code: postalCode.trim(),
          },
          2,
        );
        setCurrentStep(3);
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Failed to save address draft.'));
      } finally {
        setSavingDraft(false);
      }
    } else if (currentStep === 3) {
      const v = validateStep3(
        {
          preferred_contact_method: contactMethod,
          delivery_note: deliveryNote,
        },
        email
      );
      if (!v.valid) {
        setErrors(v.errors);
        return;
      }
      try {
        setSavingDraft(true);
        await saveWinnerDetailsDraft(
          auctionId,
          {
            preferred_contact_method: contactMethod,
            delivery_note: deliveryNote.trim(),
          },
          3,
        );
        setCurrentStep(4);
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Failed to save preferences draft.'));
      } finally {
        setSavingDraft(false);
      }
    }
  };

  const handlePrevStep = () => {
    setErrors({});
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  // Final Submit handler
  const handleFinalSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setErrors({});

    // Validate all steps before submitting
    const v1 = validateStep1({ full_name: fullName, phone, email });
    const v2 = validateStep2({ address_line: addressLine, area, district, division, postal_code: postalCode });
    const v3 = validateStep3({ preferred_contact_method: contactMethod, delivery_note: deliveryNote }, email);

    if (!v1.valid || !v2.valid || !v3.valid) {
      const combined = { ...v1.errors, ...v2.errors, ...v3.errors };
      setErrors(combined);
      toast.error('Please complete all required fields before submitting.');
      if (!v1.valid) setCurrentStep(1);
      else if (!v2.valid) setCurrentStep(2);
      else if (!v3.valid) setCurrentStep(3);
      return;
    }

    try {
      setSubmitting(true);
      await submitWinnerDetails(auctionId, {
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address_line: addressLine.trim(),
        area: area.trim(),
        district: district.trim(),
        division: division.trim(),
        postal_code: postalCode.trim(),
        preferred_contact_method: contactMethod,
        delivery_note: deliveryNote.trim(),
      });
      setSubmitSuccess(true);
      toast.success('Winner details submitted successfully!');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to submit winner details.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state skeleton
  if (initialLoading || authLoading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-4 h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800/60" />
        <div className="mt-8 space-y-4">
          <div className="h-10 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-48 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800/50" />
        </div>
      </main>
    );
  }

  // Error / Forbidden state
  if (fetchError || isForbidden) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center sm:px-6">
        <div className="rounded-3xl border border-red-200 bg-red-50/70 p-8 dark:border-red-900/60 dark:bg-red-950/30">
          <AlertCircle className="mx-auto h-12 w-12 text-red-600 dark:text-red-400" />
          <h1 className="mt-4 text-xl font-bold text-red-900 dark:text-red-200">
            {isForbidden ? 'Access Restricted' : 'Unable to Load Details'}
          </h1>
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">
            {fetchError}
          </p>
          <div className="mt-6">
            <Link
              href={MARKETPLACE_ROUTES.buyerWon}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Back to Won Auctions
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const progressPercent = getStepPercentage(currentStep);
  const auctionTitle = auction ? getAuctionTitle(auction) : `Auction #${auctionId}`;
  const winningAmount = auction ? Number(auction.current_highest_bid) : 0;
  const auctionThumbnail = auction?.images?.[0]?.image || '/placeholder-auction.png';

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Navigation breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <Link
          href={MARKETPLACE_ROUTES.buyerWon}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Won Auctions
        </Link>
      </nav>

      {/* Auction Summary Card */}
      <section className="mb-8 overflow-hidden rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/70 sm:p-5">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 sm:h-20 sm:w-20">
            {auction?.images?.[0]?.image ? (
              <Image
                src={auctionThumbnail}
                alt={auctionTitle}
                fill
                sizes="(max-width: 640px) 64px, 80px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-400">
                <Gavel className="h-6 w-6" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              Auction Won ✓
            </span>
            <h1 className="mt-1 truncate text-base font-bold text-zinc-900 dark:text-white sm:text-lg">
              {auctionTitle}
            </h1>
            <div className="mt-1 flex flex-wrap items-baseline gap-2 text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">Winning Bid:</span>
              <span className="font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {Number.isFinite(winningAmount) ? formatAuctionMoney(winningAmount) : '—'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Progress Bar Component */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          <span>
            Step {currentStep} of 4: <span className="text-zinc-900 dark:text-white font-bold">{STEPS[currentStep - 1]?.label}</span>
          </span>
          <span className="tabular-nums font-bold text-amber-600 dark:text-amber-400">{progressPercent}%</span>
        </div>

        {/* Visual Progress Track */}
        <div
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Step ${currentStep} of 4: ${STEPS[currentStep - 1]?.label}`}
          className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        >
          <div
            className="h-full bg-gradient-to-r from-amber-600 to-amber-500 transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Step Indicator Bubbles */}
        <ol className="mt-4 grid grid-cols-4 gap-2 text-center">
          {STEPS.map((s) => {
            const isCompleted = s.id < currentStep || (s.id === 4 && submitSuccess);
            const isCurrent = s.id === currentStep;
            return (
              <li key={s.id} className="flex flex-col items-center">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all sm:h-9 sm:w-9 ${
                    isCompleted
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : isCurrent
                        ? 'border-2 border-amber-600 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'border border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800'
                  }`}
                >
                  {isCompleted ? '✓' : s.id}
                </span>
                <span
                  className={`mt-1.5 hidden text-[11px] font-medium sm:block ${
                    isCurrent
                      ? 'text-zinc-900 dark:text-white font-bold'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {s.shortLabel}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Completed State Banner */}
      {submitSuccess && (
        <section
          role="region"
          aria-label="Submission Confirmation"
          className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-xs dark:border-emerald-900/60 dark:bg-emerald-950/30 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="flex-1">
              <h2 className="text-base font-bold text-emerald-900 dark:text-emerald-100">
                Winner details submitted successfully.
              </h2>
              <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
                Your fulfillment details are safely recorded in BidKori. You may review your information below or update it at any time.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={MARKETPLACE_ROUTES.buyerWon}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white transition hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
                >
                  Back to Won Auctions
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitSuccess(false);
                    setCurrentStep(1);
                  }}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-zinc-800"
                >
                  Edit Details
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Form Card */}
      <section className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 sm:p-7">
        {/* STEP 1: Personal Information */}
        {currentStep === 1 && (
          <fieldset className="space-y-5">
            <legend className="text-lg font-bold text-zinc-900 dark:text-white">
              Step 1: Personal Information
            </legend>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Provide your primary contact name and phone number for delivery coordination.
            </p>

            <div>
              <label
                htmlFor={fullNameId}
                className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200"
              >
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                id={fullNameId}
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Rahim Uddin"
                className={`mt-1.5 block w-full min-h-[44px] rounded-xl border bg-white px-3.5 text-sm text-zinc-900 transition focus:outline-none focus:ring-2 dark:bg-zinc-800 dark:text-white ${
                  errors.full_name
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-zinc-300 focus:border-amber-500 focus:ring-amber-500/20 dark:border-zinc-700'
                }`}
              />
              {errors.full_name && (
                <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                  {errors.full_name}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor={phoneId}
                className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200"
              >
                Phone Number (Bangladesh) <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1.5">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                  <Phone className="h-4 w-4" />
                </div>
                <input
                  id={phoneId}
                  type="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="017XXXXXXXX or +88017XXXXXXXX"
                  className={`block w-full min-h-[44px] rounded-xl border bg-white pl-10 pr-3.5 text-sm text-zinc-900 transition focus:outline-none focus:ring-2 dark:bg-zinc-800 dark:text-white ${
                    errors.phone
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                      : 'border-zinc-300 focus:border-amber-500 focus:ring-amber-500/20 dark:border-zinc-700'
                  }`}
                />
              </div>
              {errors.phone ? (
                <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                  {errors.phone}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                  Must be an active Bangladeshi mobile number for courier SMS / calls.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor={emailId}
                className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200"
              >
                Email Address <span className="text-xs font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                id={emailId}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. rahim@example.com"
                className={`mt-1.5 block w-full min-h-[44px] rounded-xl border bg-white px-3.5 text-sm text-zinc-900 transition focus:outline-none focus:ring-2 dark:bg-zinc-800 dark:text-white ${
                  errors.email
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-zinc-300 focus:border-amber-500 focus:ring-amber-500/20 dark:border-zinc-700'
                }`}
              />
              {errors.email && (
                <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                  {errors.email}
                </p>
              )}
            </div>
          </fieldset>
        )}

        {/* STEP 2: Delivery Address */}
        {currentStep === 2 && (
          <fieldset className="space-y-5">
            <legend className="text-lg font-bold text-zinc-900 dark:text-white">
              Step 2: Delivery Address
            </legend>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Enter the exact delivery location where your item should be delivered within Bangladesh.
            </p>

            <div>
              <label
                htmlFor={addressLineId}
                className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200"
              >
                Street Address / House & Road <span className="text-red-500">*</span>
              </label>
              <input
                id={addressLineId}
                type="text"
                autoComplete="street-address"
                required
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="e.g. House 14, Road 5, Block B"
                className={`mt-1.5 block w-full min-h-[44px] rounded-xl border bg-white px-3.5 text-sm text-zinc-900 transition focus:outline-none focus:ring-2 dark:bg-zinc-800 dark:text-white ${
                  errors.address_line
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-zinc-300 focus:border-amber-500 focus:ring-amber-500/20 dark:border-zinc-700'
                }`}
              />
              {errors.address_line && (
                <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                  {errors.address_line}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={areaId}
                  className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                >
                  Area / Upazila / Thana <span className="text-red-500">*</span>
                </label>
                <input
                  id={areaId}
                  type="text"
                  required
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="e.g. Dhanmondi / Mirpur"
                  className={`mt-1.5 block w-full min-h-[44px] rounded-xl border bg-white px-3.5 text-sm text-zinc-900 transition focus:outline-none focus:ring-2 dark:bg-zinc-800 dark:text-white ${
                    errors.area
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                      : 'border-zinc-300 focus:border-amber-500 focus:ring-amber-500/20 dark:border-zinc-700'
                  }`}
                />
                {errors.area && (
                  <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                    {errors.area}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor={districtId}
                  className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                >
                  District <span className="text-red-500">*</span>
                </label>
                <input
                  id={districtId}
                  type="text"
                  required
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="e.g. Dhaka, Chittagong, Sylhet"
                  className={`mt-1.5 block w-full min-h-[44px] rounded-xl border bg-white px-3.5 text-sm text-zinc-900 transition focus:outline-none focus:ring-2 dark:bg-zinc-800 dark:text-white ${
                    errors.district
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                      : 'border-zinc-300 focus:border-amber-500 focus:ring-amber-500/20 dark:border-zinc-700'
                  }`}
                />
                {errors.district && (
                  <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                    {errors.district}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={divisionId}
                  className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                >
                  Division <span className="text-red-500">*</span>
                </label>
                <select
                  id={divisionId}
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                  className="mt-1.5 block w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                >
                  {BD_DIVISIONS.map((div) => (
                    <option key={div} value={div}>
                      {div}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor={postalCodeId}
                  className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                >
                  Postal Code <span className="text-xs font-normal text-zinc-400">(optional)</span>
                </label>
                <input
                  id={postalCodeId}
                  type="text"
                  autoComplete="postal-code"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="e.g. 1205"
                  className="mt-1.5 block w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3.5 text-sm text-zinc-900 transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
            </div>
          </fieldset>
        )}

        {/* STEP 3: Delivery Preferences */}
        {currentStep === 3 && (
          <fieldset className="space-y-5">
            <legend className="text-lg font-bold text-zinc-900 dark:text-white">
              Step 3: Delivery Preferences
            </legend>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Specify your preferred communication channel and any special package drop-off notes.
            </p>

            <div>
              <span className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Preferred Contact Method <span className="text-red-500">*</span>
              </span>
              <div className="mt-2.5 grid grid-cols-2 gap-3">
                <label
                  className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition ${
                    contactMethod === 'PHONE'
                      ? 'border-amber-500 bg-amber-50/70 text-amber-900 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-200'
                      : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="preferred_contact"
                    value="PHONE"
                    checked={contactMethod === 'PHONE'}
                    onChange={() => setContactMethod('PHONE')}
                    className="sr-only"
                  />
                  <Phone className="h-4 w-4" />
                  <span>Phone Call / SMS</span>
                </label>

                <label
                  className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition ${
                    contactMethod === 'EMAIL'
                      ? 'border-amber-500 bg-amber-50/70 text-amber-900 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-200'
                      : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="preferred_contact"
                    value="EMAIL"
                    checked={contactMethod === 'EMAIL'}
                    onChange={() => setContactMethod('EMAIL')}
                    className="sr-only"
                  />
                  <span>Email</span>
                </label>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor={deliveryNoteId}
                  className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                >
                  Delivery Instructions / Note <span className="text-xs font-normal text-zinc-400">(optional)</span>
                </label>
                <span className="text-[11px] text-zinc-400">
                  {deliveryNote.length}/500
                </span>
              </div>
              <textarea
                id={deliveryNoteId}
                rows={3}
                maxLength={500}
                value={deliveryNote}
                onChange={(e) => setDeliveryNote(e.target.value)}
                placeholder="e.g. Please call before arrival. Deliver to building reception if unavailable."
                className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white p-3 text-sm text-zinc-900 transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>
          </fieldset>
        )}

        {/* STEP 4: Review & Submit */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                Step 4: Review Your Fulfillment Details
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Verify all details carefully before final submission.
              </p>
            </div>

            {/* Review Cards */}
            <div className="space-y-4 text-xs sm:text-sm">
              {/* Personal Info Card */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-zinc-900 dark:text-white">Personal Information</h3>
                  {!submitSuccess && (
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="text-xs font-semibold text-amber-600 hover:underline dark:text-amber-400"
                    >
                      Edit
                    </button>
                  )}
                </div>
                <dl className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400 font-medium">Full Name:</dt>
                    <dd className="font-semibold text-zinc-800 dark:text-zinc-200">{fullName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400 font-medium">Phone:</dt>
                    <dd className="font-semibold text-zinc-800 dark:text-zinc-200">{phone || '—'}</dd>
                  </div>
                  {email && (
                    <div className="sm:col-span-2">
                      <dt className="text-zinc-500 dark:text-zinc-400 font-medium">Email:</dt>
                      <dd className="font-semibold text-zinc-800 dark:text-zinc-200">{email}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Address Card */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-zinc-900 dark:text-white">Delivery Address</h3>
                  {!submitSuccess && (
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="text-xs font-semibold text-amber-600 hover:underline dark:text-amber-400"
                    >
                      Edit
                    </button>
                  )}
                </div>
                <dl className="mt-2.5 space-y-1">
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400 font-medium">Address:</dt>
                    <dd className="font-semibold text-zinc-800 dark:text-zinc-200">{addressLine || '—'}</dd>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
                    <div>
                      <dt className="text-zinc-500 dark:text-zinc-400 font-medium">Area:</dt>
                      <dd className="font-semibold text-zinc-800 dark:text-zinc-200">{area || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 dark:text-zinc-400 font-medium">District:</dt>
                      <dd className="font-semibold text-zinc-800 dark:text-zinc-200">{district || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 dark:text-zinc-400 font-medium">Division:</dt>
                      <dd className="font-semibold text-zinc-800 dark:text-zinc-200">{division || '—'}</dd>
                    </div>
                  </div>
                  {postalCode && (
                    <div className="pt-1">
                      <dt className="text-zinc-500 dark:text-zinc-400 font-medium">Postal Code:</dt>
                      <dd className="font-semibold text-zinc-800 dark:text-zinc-200">{postalCode}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Preferences Card */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-zinc-900 dark:text-white">Delivery Preferences</h3>
                  {!submitSuccess && (
                    <button
                      type="button"
                      onClick={() => setCurrentStep(3)}
                      className="text-xs font-semibold text-amber-600 hover:underline dark:text-amber-400"
                    >
                      Edit
                    </button>
                  )}
                </div>
                <dl className="mt-2.5 space-y-1.5">
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400 font-medium">Preferred Contact:</dt>
                    <dd className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {contactMethod === 'PHONE' ? 'Phone Call / SMS' : 'Email'}
                    </dd>
                  </div>
                  {deliveryNote && (
                    <div>
                      <dt className="text-zinc-500 dark:text-zinc-400 font-medium">Delivery Note:</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap rounded-lg bg-white p-2 text-xs font-medium text-zinc-700 border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-300">
                        {deliveryNote}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </div>
        )}

        {/* Wizard Controls */}
        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-zinc-100 pt-5 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {currentStep > 1 && !submitSuccess && (
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={savingDraft || submitting}
                className="inline-flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-4 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 sm:w-auto"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            {currentStep < 4 && (
              <button
                type="button"
                onClick={handleNextStep}
                disabled={savingDraft}
                className="inline-flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-6 text-sm font-bold text-white shadow-sm shadow-amber-600/20 transition hover:from-amber-500 hover:to-amber-400 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-60 sm:w-auto"
              >
                {savingDraft ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving Draft...
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            )}

            {currentStep === 4 && (
              <button
                type="button"
                onClick={() => handleFinalSubmit()}
                disabled={submitting}
                className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 text-sm font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:from-emerald-500 hover:to-emerald-400 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:opacity-60 sm:w-auto"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : submitSuccess ? (
                  'Update Winner Details'
                ) : (
                  'Submit Winner Details'
                )}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Privacy Notice */}
      <footer className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
        <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span>
          These details are used for post-auction fulfillment. Your information will only be made available according to BidKori&apos;s authorized fulfillment workflow.
        </span>
      </footer>
    </main>
  );
}
