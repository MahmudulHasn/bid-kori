'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { Clock3, Gavel, ImageOff, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import useSWR from 'swr';

import { useAuth } from '@/context/AuthContext';
import { useAuctionTimer } from '@/hooks/useAuctionTimer';
import api from '@/lib/api';
import { getApiErrorMessage, getApiStatus } from '@/lib/apiErrors';
import { isAuctionOwnedByUser } from '@/lib/auctionOwnership';
import { buildLoginHref } from '@/lib/authRouting';
import { getAuctionTitle } from '@/lib/auctionDisplay';
import { MARKETPLACE_ROUTES } from '@/lib/marketplace';
import { resolveMediaUrl } from '@/lib/media';
import type { Auction } from '@/lib/types';

const fetcher = async (url: string) => {
  const { data } = await api.get<Auction>(url);
  return data;
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export default function AuctionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const auctionId = params?.id;
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [bidAmount, setBidAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [managing, setManaging] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const { data: auction, error, isLoading, mutate } = useSWR(
    auctionId ? `/auctions/${auctionId}/` : null,
    fetcher,
    { refreshInterval: 3000 },
  );

  const timer = useAuctionTimer(auction?.end_time);
  const isAuctionClosed =
    timer.isClosed || auction?.status === 'CLOSED' || auction?.status === 'CANCELLED';

  const isOwner = isAuctionOwnedByUser(auction, user);
  const canShowSellerControls = isOwner && !authLoading;

  const imageUrls = useMemo(() => {
    const urls = (auction?.images ?? [])
      .map((image) => resolveMediaUrl(image.image))
      .filter((url): url is string => Boolean(url));
    return urls;
  }, [auction?.images]);

  const activeImage = imageUrls[activeImageIndex] ?? imageUrls[0] ?? null;
  const currentBid = Number(
    auction?.current_highest_bid ?? auction?.starting_bid ?? 0,
  );
  const minIncrement = Number(auction?.min_increment ?? 10);
  const suggestedBid = (currentBid + minIncrement).toFixed(2);

  const handlePlaceBid = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (authLoading) {
      toast.error('Checking your session… please try again in a moment.');
      return;
    }
    if (!isAuthenticated) {
      toast.error('Please log in to place a bid.');
      if (auctionId) {
        router.push(
          buildLoginHref(MARKETPLACE_ROUTES.auctionDetail(auctionId)),
        );
      }
      return;
    }
    if (isOwner) {
      toast.error('You cannot bid on your own auction.');
      return;
    }
    if (!auctionId || isAuctionClosed) {
      toast.error('This auction is closed.');
      return;
    }

    const amount = Number(bidAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid bid amount.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/auctions/${auctionId}/place-bid/`, { amount });
      toast.success('Bid placed successfully.');
      setBidAmount('');
      await mutate();
    } catch (err: unknown) {
      const status = getApiStatus(err);
      const apiMessage = getApiErrorMessage(err, '');

      if (status === 429) {
        toast.error(
          'Too many bids. Please wait a minute and try again.',
        );
      } else if (status === 400) {
        toast.error(
          apiMessage ||
            'Bid too low. Your amount must beat the current highest bid (plus minimum increment).',
        );
      } else if (status === 403) {
        toast.error(apiMessage || 'You are not allowed to bid on this auction.');
      } else if (status === 401) {
        toast.error('Please log in to place a bid.');
      } else {
        toast.error(apiMessage || 'Could not place bid. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelAuction = async () => {
    if (!auctionId || !canShowSellerControls) return;
    if (auction?.status !== 'ACTIVE') {
      toast.error('Only active auctions can be cancelled.');
      return;
    }

    const confirmed = window.confirm(
      'Cancel this auction? Bidders will no longer be able to place bids.',
    );
    if (!confirmed) return;

    setManaging(true);
    try {
      await api.post(`/auctions/${auctionId}/transition/`, {
        status: 'CANCELLED',
      });
      toast.success('Auction cancelled.');
      await mutate();
    } catch (err: unknown) {
      const status = getApiStatus(err);
      const message = getApiErrorMessage(
        err,
        'Could not cancel this auction.',
      );
      if (status === 401) {
        toast.error('Please log in again to manage this auction.');
      } else if (status === 403) {
        toast.error(message || 'Only the seller can cancel this auction.');
      } else {
        toast.error(message);
      }
    } finally {
      setManaging(false);
    }
  };

  const handleDeleteAuction = async () => {
    if (!auctionId || !canShowSellerControls) return;

    const confirmed = window.confirm(
      'Permanently delete this auction listing? This cannot be undone.',
    );
    if (!confirmed) return;

    setManaging(true);
    try {
      await api.delete(`/auctions/${auctionId}/`);
      toast.success('Auction deleted.');
      router.push(MARKETPLACE_ROUTES.auctions);
    } catch (err: unknown) {
      const status = getApiStatus(err);
      const message = getApiErrorMessage(
        err,
        'Could not delete this auction.',
      );
      if (status === 401) {
        toast.error('Please log in again to manage this auction.');
      } else if (status === 403) {
        toast.error(message || 'Only the seller can delete this auction.');
      } else {
        toast.error(message);
      }
    } finally {
      setManaging(false);
    }
  };

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading auction…</p>
      </main>
    );
  }

  if (error || !auction) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          Auction not found or the API is unavailable.
        </p>
        <Link
          href={MARKETPLACE_ROUTES.auctions}
          className="mt-4 inline-block text-sm text-amber-700 hover:underline"
        >
          Back to auctions
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-6">
        <Link
          href={MARKETPLACE_ROUTES.auctions}
          className="text-sm text-amber-700 hover:underline dark:text-amber-300"
        >
          ← Back to auctions
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          {getAuctionTitle(auction)}
        </h1>
        {typeof auction.product === 'object' && auction.product?.description && (
          <p className="mt-2 max-w-3xl text-zinc-600 dark:text-zinc-400">
            {auction.product.description}
          </p>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_0.9fr]">
        <section className="space-y-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
            {activeImage ? (
              <Image
                src={activeImage}
                alt={getAuctionTitle(auction)}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-400">
                <ImageOff className="h-8 w-8" aria-hidden />
                <span className="text-sm">No images uploaded</span>
              </div>
            )}
          </div>

          {imageUrls.length > 1 && (
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
              {imageUrls.map((url, index) => (
                <button
                  key={url + index}
                  type="button"
                  onClick={() => setActiveImageIndex(index)}
                  className={[
                    'relative aspect-square overflow-hidden rounded-xl border',
                    index === activeImageIndex
                      ? 'border-amber-500 ring-2 ring-amber-500/40'
                      : 'border-zinc-200 dark:border-zinc-800',
                  ].join(' ')}
                >
                  <Image
                    src={url}
                    alt={`Gallery image ${index + 1}`}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <Clock3 className="h-4 w-4" aria-hidden />
              {isAuctionClosed ? 'Auction ended' : 'Time remaining'}
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: 'Days', value: timer.days },
                { label: 'Hours', value: timer.hours },
                { label: 'Mins', value: timer.minutes },
                { label: 'Secs', value: timer.seconds },
              ].map((unit) => (
                <div
                  key={unit.label}
                  className="rounded-xl bg-zinc-50 px-2 py-3 dark:bg-zinc-900"
                >
                  <div className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-white">
                    {pad(unit.value)}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                    {unit.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Current highest bid</p>
            <p className="mt-1 text-3xl font-semibold text-amber-700 dark:text-amber-300">
              ৳{currentBid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Minimum increment: ৳
              {minIncrement.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            {auction.status && (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Status: {auction.status}
              </p>
            )}
          </div>

          {canShowSellerControls && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden />
                <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
                  Seller controls
                </h2>
              </div>
              <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                You own this listing. Management actions are enforced by the API.
              </p>
              <div className="flex flex-col gap-2">
                {auction.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={handleCancelAuction}
                    disabled={managing}
                    className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    {managing ? 'Working…' : 'Cancel auction'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDeleteAuction}
                  disabled={managing}
                  className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  {managing ? 'Working…' : 'Delete listing'}
                </button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-4 flex items-center gap-2">
              <Gavel className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden />
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
                Bid panel
              </h2>
            </div>

            {isAuctionClosed ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Bidding is closed for this auction.
              </p>
            ) : isOwner ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Sellers cannot bid on their own listings.
              </p>
            ) : (
              <form onSubmit={handlePlaceBid} className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Your bid amount
                  </span>
                  <input
                    type="number"
                    min={suggestedBid}
                    step="0.01"
                    required
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder={suggestedBid}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
                <button
                  type="submit"
                  disabled={submitting || authLoading || !isAuthenticated}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Placing bid…' : 'Place Bid'}
                </button>
                {!authLoading && !isAuthenticated && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    <Link
                      href={buildLoginHref(
                        auctionId
                          ? MARKETPLACE_ROUTES.auctionDetail(auctionId)
                          : MARKETPLACE_ROUTES.auctions,
                      )}
                      className="text-amber-700 hover:underline"
                    >
                      Log in
                    </Link>{' '}
                    to place a bid.
                  </p>
                )}
                {authLoading && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Checking your session…
                  </p>
                )}
              </form>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
