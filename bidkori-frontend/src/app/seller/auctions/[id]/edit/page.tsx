'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useSWR, { useSWRConfig } from 'swr';

import AuctionForm from '@/components/seller/AuctionForm';
import { useAuth } from '@/context/AuthContext';
import {
  getApiErrorMessage,
  getApiFieldErrors,
  getApiStatus,
} from '@/lib/apiErrors';
import {
  auctionFormValuesFromAuction,
  buildAuctionUpdatePayload,
  type AuctionFormField,
  type AuctionFormValues,
} from '@/lib/auctionCreateContract';
import {
  canSellerEditAuction,
  isAuctionConfigurationFreezeError,
} from '@/lib/auctionManagementSafety';
import { isAuctionOwnedByUser } from '@/lib/auctionOwnership';
import {
  AUCTIONS_LIST_API_PATH,
  auctionDetailFetcher,
  buildAuctionDetailApiPath,
  updateAuction,
} from '@/lib/auctionsApi';
import {
  getAuctionProduct,
  getAuctionTitle,
} from '@/lib/auctionDisplay';
import {
  SELLER_AUCTIONS_PATH,
  sellerAuctionDetailPath,
} from '@/lib/workspaceNavigation';

const AUCTION_WRITE_FIELDS = [
  'starting_bid',
  'min_increment',
  'reserve_price',
  'start_time',
  'end_time',
] as const;

export default function SellerAuctionEditPage() {
  const params = useParams<{ id: string }>();
  const auctionId = params?.id;
  const router = useRouter();
  const { user } = useAuth();
  const { mutate: mutateGlobal } = useSWRConfig();

  const detailKey = auctionId ? buildAuctionDetailApiPath(auctionId) : null;
  const {
    data: auction,
    error,
    isLoading,
    mutate,
  } = useSWR(detailKey, auctionDetailFetcher);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<AuctionFormField, string>>
  >({});
  const [frozen, setFrozen] = useState(false);

  const owned = isAuctionOwnedByUser(auction, user);
  const editable = canSellerEditAuction(auction, user);
  const status = getApiStatus(error);
  const unavailable = Boolean(error) && (status === 404 || status === 403);
  const waiting =
    isLoading || (!error && !auction) || (!error && auction && !user);

  const productContext = useMemo(() => {
    if (!auction) return null;
    const nested = getAuctionProduct(auction);
    if (!nested || nested.id == null) {
      return {
        id: 0,
        title: getAuctionTitle(auction),
      };
    }
    return {
      id: nested.id,
      title: nested.title,
      condition: nested.condition,
    };
  }, [auction]);

  const initialValues = useMemo(
    () => (auction ? auctionFormValuesFromAuction(auction) : null),
    [auction],
  );

  const handleSubmit = async (
    values: AuctionFormValues,
    options: { changeReserve: boolean },
  ) => {
    if (!auction || submitting || frozen) return;
    setSubmitting(true);
    setFormError(undefined);
    setFieldErrors({});
    try {
      const payload = buildAuctionUpdatePayload(values, options);
      const next = await updateAuction(auction.id, payload);
      await mutate(next, { revalidate: false });
      await mutateGlobal(AUCTIONS_LIST_API_PATH);
      toast.success('Auction updated.');
      router.push(sellerAuctionDetailPath(auction.id));
    } catch (err: unknown) {
      if (isAuctionConfigurationFreezeError(err)) {
        setFrozen(true);
        setFormError(
          getApiErrorMessage(
            err,
            'This auction can no longer be edited because it has started or received bids.',
          ),
        );
        await mutate();
        return;
      }
      const apiFields = getApiFieldErrors(err, AUCTION_WRITE_FIELDS);
      if (Object.keys(apiFields).length > 0) {
        setFieldErrors(apiFields);
      }
      setFormError(
        getApiErrorMessage(err, 'We could not update this auction.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <p>
        <Link
          href={
            auctionId
              ? sellerAuctionDetailPath(auctionId)
              : SELLER_AUCTIONS_PATH
          }
          className="text-sm text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
        >
          ← Back to auction
        </Link>
      </p>

      {waiting ? (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <p className="sr-only">Loading auction</p>
          <div className="h-10 w-2/3 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-64 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
        </div>
      ) : null}

      {unavailable ? (
        <section
          role="alert"
          className="rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">
            Auction unavailable
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            We couldn&apos;t load this auction.
          </p>
        </section>
      ) : null}

      {error && !unavailable ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <p>We couldn&apos;t load this auction.</p>
          <p className="mt-1 text-xs opacity-80">
            {getApiErrorMessage(error, 'Please try again in a moment.')}
          </p>
          <button
            type="button"
            onClick={() => void mutate()}
            className="mt-3 inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:border-red-800 dark:hover:bg-red-950"
          >
            Try Again
          </button>
        </div>
      ) : null}

      {!waiting && !error && auction && !owned ? (
        <section className="rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">
            You don&apos;t have permission to edit this auction.
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            This listing is not part of your seller catalog.
          </p>
        </section>
      ) : null}

      {!waiting && !error && auction && owned && (!editable || frozen) ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 dark:border-amber-900 dark:bg-amber-950/30">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">
            Editing unavailable
          </h1>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            This auction can no longer be edited because it has started or
            received bids.
          </p>
          <p className="mt-4">
            <Link
              href={sellerAuctionDetailPath(auction.id)}
              className="text-sm font-medium text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
            >
              Return to {getAuctionTitle(auction)}
            </Link>
          </p>
        </section>
      ) : null}

      {!waiting &&
      !error &&
      auction &&
      owned &&
      editable &&
      !frozen &&
      initialValues ? (
        <div className="mx-auto max-w-xl space-y-6">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
              Edit Auction
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Update configuration before bidding starts. The product stays
              fixed.
            </p>
          </header>
          <AuctionForm
            mode="edit"
            selectedProduct={productContext}
            initialValues={initialValues}
            submitting={submitting}
            submitLabel="Save Changes"
            submittingLabel="Saving…"
            formError={formError}
            fieldErrors={fieldErrors}
            onSubmit={(values, options) => void handleSubmit(values, options)}
          />
        </div>
      ) : null}
    </div>
  );
}
