'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import useSWR, { useSWRConfig } from 'swr';

import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage, getApiStatus } from '@/lib/apiErrors';
import { isAuctionOwnedByUser } from '@/lib/auctionOwnership';
import {
  formatAuctionMoney,
  getAuctionPriceLabel,
  getAuctionProduct,
  getAuctionTitle,
} from '@/lib/auctionDisplay';
import AuctionImageUploadSection from '@/components/seller/AuctionImageUploadSection';
import {
  AUCTIONS_LIST_API_PATH,
  auctionDetailFetcher,
  buildAuctionDetailApiPath,
  cancelAuction,
  deleteAuction,
} from '@/lib/auctionsApi';
import {
  canOfferSellerAuctionDelete,
  canSellerCancelAuction,
  canSellerEditAuction,
  isAuctionDeleteBlockedError,
} from '@/lib/auctionManagementSafety';
import { resolveMediaUrl } from '@/lib/media';
import {
  getSellerAuctionDisplayStatus,
  getSellerAuctionPaymentLabel,
  getSellerAuctionWinnerLabel,
} from '@/lib/seller';
import {
  SELLER_AUCTIONS_PATH,
  sellerAuctionEditPath,
  sellerProductDetailPath,
} from '@/lib/workspaceNavigation';
import type { Auction, AuthUser } from '@/lib/types';
function formatWhen(
  value: string | undefined,
): { iso: string; label: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    iso: date.toISOString(),
    label: format(date, 'MMM d, yyyy, h:mm a'),
  };
}

function money(value: string | number | undefined): string | null {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return formatAuctionMoney(amount);
}

function OwnedAuctionDetail({
  auction,
  user,
  onCancelled,
  onImagesUpdated,
  onDeleted,
}: {
  auction: Auction;
  user: AuthUser;
  onCancelled: (next: Auction) => Promise<void>;
  onImagesUpdated: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const title = getAuctionTitle(auction);
  const product = getAuctionProduct(auction);
  const starts = formatWhen(auction.start_time);
  const ends = formatWhen(auction.end_time);
  const price = getAuctionPriceLabel(auction);
  const statusLabel = getSellerAuctionDisplayStatus(auction);
  const winnerLabel = getSellerAuctionWinnerLabel(auction);
  const paymentLabel = getSellerAuctionPaymentLabel(auction);
  const starting = money(auction.starting_bid);
  const increment = money(auction.min_increment);
  const [activeIndex, setActiveIndex] = useState(0);
  const [cancelPhase, setCancelPhase] = useState<
    'idle' | 'confirming' | 'submitting'
  >('idle');
  const [cancelError, setCancelError] = useState<string>();
  const [deletePhase, setDeletePhase] = useState<
    'idle' | 'confirming' | 'submitting'
  >('idle');
  const [deleteError, setDeleteError] = useState<string>();

  const showCancel = canSellerCancelAuction(auction, user);
  const showEdit = canSellerEditAuction(auction, user);
  const showDelete = canOfferSellerAuctionDelete(auction, user);

  const imageUrls = useMemo(() => {
    return (auction.images ?? [])
      .map((image) => resolveMediaUrl(image.image))
      .filter((url): url is string => Boolean(url));
  }, [auction.images]);

  const activeImage = imageUrls[activeIndex] ?? imageUrls[0] ?? null;

  const handleCancel = async () => {
    if (cancelPhase === 'submitting') return;
    setCancelPhase('submitting');
    setCancelError(undefined);
    try {
      const next = await cancelAuction(auction.id);
      await onCancelled(next);
      toast.success('Auction cancelled.');
      setCancelPhase('idle');
    } catch (error: unknown) {
      setCancelError(
        getApiErrorMessage(
          error,
          'We could not cancel this auction. It may already be closed.',
        ),
      );
      setCancelPhase('confirming');
      await onCancelled(auction);
    }
  };

  const handleDelete = async () => {
    if (deletePhase === 'submitting') return;
    setDeletePhase('submitting');
    setDeleteError(undefined);
    try {
      await deleteAuction(auction.id);
      toast.success('Auction deleted.');
      await onDeleted();
    } catch (error: unknown) {
      setDeleteError(
        getApiErrorMessage(
          error,
          isAuctionDeleteBlockedError(error)
            ? 'This auction cannot be deleted after it has started or received bids.'
            : 'We could not delete this auction.',
        ),
      );
      setDeletePhase('confirming');
      await onCancelled(auction);
    }
  };

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Auction summary for a listing you own.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {showEdit ? (
            <Link
              href={sellerAuctionEditPath(auction.id)}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Edit Auction
            </Link>
          ) : null}
          {showCancel && cancelPhase === 'idle' ? (
            <button
              type="button"
              onClick={() => {
                setCancelError(undefined);
                setCancelPhase('confirming');
                setDeletePhase('idle');
              }}
              className="inline-flex items-center justify-center rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
            >
              Cancel Auction
            </button>
          ) : null}
          {showDelete && deletePhase === 'idle' ? (
            <button
              type="button"
              onClick={() => {
                setDeleteError(undefined);
                setDeletePhase('confirming');
                setCancelPhase('idle');
              }}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Delete Auction
            </button>
          ) : null}
        </div>
        {showCancel && cancelPhase !== 'idle' ? (
          <div className="mt-4 space-y-3">
            <div
              role="group"
              aria-labelledby="cancel-auction-confirm-heading"
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 dark:border-red-900 dark:bg-red-950/40"
            >
              <h2
                id="cancel-auction-confirm-heading"
                className="text-sm font-semibold text-red-900 dark:text-red-200"
              >
                Cancel auction?
              </h2>
              <p className="mt-2 text-sm text-red-800 dark:text-red-300">
                This action changes the auction lifecycle and cannot be undone
                from this page. Bidding stops and checkout remains blocked.
              </p>
              {cancelError ? (
                <p
                  role="alert"
                  className="mt-3 text-sm font-medium text-red-900 dark:text-red-200"
                >
                  {cancelError}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={cancelPhase === 'submitting'}
                  onClick={() => {
                    setCancelPhase('idle');
                    setCancelError(undefined);
                  }}
                  className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  Keep Auction
                </button>
                <button
                  type="button"
                  disabled={cancelPhase === 'submitting'}
                  aria-busy={cancelPhase === 'submitting'}
                  onClick={() => void handleCancel()}
                  className="inline-flex rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancelPhase === 'submitting'
                    ? 'Cancelling…'
                    : 'Cancel Auction'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {showDelete && deletePhase !== 'idle' ? (
          <div className="mt-4 space-y-3">
            <div
              role="group"
              aria-labelledby="delete-auction-confirm-heading"
              className="rounded-2xl border border-zinc-300 bg-zinc-50 px-4 py-4 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <h2
                id="delete-auction-confirm-heading"
                className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
              >
                Delete auction?
              </h2>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                Only unused pre-start auctions can be deleted. This action
                permanently removes the auction listing. The product is not
                deleted.
              </p>
              {deleteError ? (
                <p
                  role="alert"
                  className="mt-3 text-sm font-medium text-red-800 dark:text-red-300"
                >
                  {deleteError}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={deletePhase === 'submitting'}
                  onClick={() => {
                    setDeletePhase('idle');
                    setDeleteError(undefined);
                  }}
                  className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  Keep Auction
                </button>
                <button
                  type="button"
                  disabled={deletePhase === 'submitting'}
                  aria-busy={deletePhase === 'submitting'}
                  onClick={() => void handleDelete()}
                  className="inline-flex rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  {deletePhase === 'submitting'
                    ? 'Deleting…'
                    : 'Delete Auction'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      {activeImage ? (
        <figure className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <Image
            src={activeImage}
            alt={`Photo of ${title}`}
            width={1200}
            height={800}
            className="h-64 w-full object-cover sm:h-80"
            unoptimized
          />
          {imageUrls.length > 1 ? (
            <figcaption className="flex flex-wrap gap-2 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              {imageUrls.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-pressed={index === activeIndex}
                  className="overflow-hidden rounded-lg border border-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-zinc-700"
                >
                  <Image
                    src={url}
                    alt={`${title} photo ${index + 1} of ${imageUrls.length}`}
                    width={80}
                    height={80}
                    className="h-16 w-16 object-cover"
                    unoptimized
                  />
                </button>
              ))}
            </figcaption>
          ) : null}
        </figure>
      ) : (
        <div
          className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
          role="img"
          aria-label="No auction images"
        >
          No auction images
        </div>
      )}

      <AuctionImageUploadSection
        auction={auction}
        user={user}
        onUploaded={onImagesUpdated}
      />

      <section
        aria-labelledby="auction-details-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="auction-details-heading"
          className="text-base font-semibold text-zinc-900 dark:text-white"
        >
          Auction details
        </h2>
        <dl className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-6">
            <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Product
            </dt>
            <dd className="text-sm text-zinc-900 dark:text-white">
              {product?.id != null ? (
                <Link
                  href={sellerProductDetailPath(product.id)}
                  className="text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
                >
                  {product.title?.trim() ? product.title : title}
                </Link>
              ) : (
                title
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-6">
            <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Status
            </dt>
            <dd className="text-sm text-zinc-900 dark:text-white">{statusLabel}</dd>
          </div>
          {starting ? (
            <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-6">
              <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Starting bid
              </dt>
              <dd className="text-sm tabular-nums text-zinc-900 dark:text-white">
                {starting}
              </dd>
            </div>
          ) : null}
          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-6">
            <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {price.label}
            </dt>
            <dd className="text-sm tabular-nums text-zinc-900 dark:text-white">
              {formatAuctionMoney(price.amount)}
            </dd>
          </div>
          {increment ? (
            <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-6">
              <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Minimum increment
              </dt>
              <dd className="text-sm tabular-nums text-zinc-900 dark:text-white">
                {increment}
              </dd>
            </div>
          ) : null}
          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-6">
            <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Starts
            </dt>
            <dd className="text-sm text-zinc-900 dark:text-white">
              {starts ? <time dateTime={starts.iso}>{starts.label}</time> : '—'}
            </dd>
          </div>
          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-6">
            <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Ends
            </dt>
            <dd className="text-sm text-zinc-900 dark:text-white">
              {ends ? <time dateTime={ends.iso}>{ends.label}</time> : '—'}
            </dd>
          </div>
          {winnerLabel ? (
            <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-6">
              <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Final result
              </dt>
              <dd className="text-sm text-zinc-900 dark:text-white">{winnerLabel}</dd>
            </div>
          ) : null}
          {paymentLabel ? (
            <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-6">
              <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Payment
              </dt>
              <dd className="text-sm text-zinc-900 dark:text-white">{paymentLabel}</dd>
            </div>
          ) : null}
        </dl>
      </section>
    </>
  );
}

export default function SellerAuctionDetailPage() {
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

  const owned = isAuctionOwnedByUser(auction, user);
  const status = getApiStatus(error);
  const unavailable = Boolean(error) && (status === 404 || status === 403);
  const waiting = isLoading || (!error && !auction) || (!error && auction && !user);

  const handleCancelled = async (next: Auction) => {
    if (next?.id != null && (next.status ?? '').toUpperCase() === 'CANCELLED') {
      await mutate(next, { revalidate: false });
    } else {
      await mutate();
    }
    await mutateGlobal(AUCTIONS_LIST_API_PATH);
  };

  const handleImagesUpdated = async () => {
    await mutate();
    await mutateGlobal(AUCTIONS_LIST_API_PATH);
  };

  const handleDeleted = async () => {
    await mutateGlobal(AUCTIONS_LIST_API_PATH);
    router.push(SELLER_AUCTIONS_PATH);
  };

  return (
    <div className="space-y-8">
      <p>
        <Link
          href={SELLER_AUCTIONS_PATH}
          className="text-sm text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
        >
          ← Back to auctions
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
            You don&apos;t have permission to manage this auction.
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            This listing is not part of your seller catalog.
          </p>
        </section>
      ) : null}

      {!waiting && !error && auction && owned && user ? (
        <OwnedAuctionDetail
          auction={auction}
          user={user}
          onCancelled={handleCancelled}
          onImagesUpdated={handleImagesUpdated}
          onDeleted={handleDeleted}
        />
      ) : null}
    </div>
  );
}
