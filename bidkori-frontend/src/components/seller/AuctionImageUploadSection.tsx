'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import toast from 'react-hot-toast';

import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  AUCTION_IMAGE_ACCEPT,
  AUCTION_IMAGE_MAX_PER_AUCTION,
  AUCTION_IMAGE_MAX_PER_REQUEST,
  auctionImageRemainingCapacity,
  canSellerUploadAuctionImages,
  isAuctionImageFreezeError,
  validateAuctionImageSelection,
} from '@/lib/auctionImageSafety';
import { uploadAuctionImages } from '@/lib/auctionsApi';
import type { Auction, AuthUser } from '@/lib/types';

type UploadPhase = 'idle' | 'selected' | 'uploading' | 'success' | 'error';

export default function AuctionImageUploadSection({
  auction,
  user,
  onUploaded,
}: {
  auction: Auction;
  user: AuthUser;
  onUploaded: (next: Auction) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [error, setError] = useState<string>();
  const [frozen, setFrozen] = useState(false);

  const eligible = canSellerUploadAuctionImages(auction, user) && !frozen;
  const existingCount = auction.images?.length ?? 0;
  const remaining = auctionImageRemainingCapacity(auction);

  const resetSelection = () => {
    setFiles([]);
    setPhase('idle');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Array.from(event.target.files ?? []);
    setError(undefined);
    if (next.length === 0) {
      resetSelection();
      return;
    }
    setFiles(next);
    setPhase('selected');
  };

  const handleUpload = async () => {
    if (!eligible || phase === 'uploading') return;
    const validation = validateAuctionImageSelection(files, auction);
    if (!validation.ok) {
      setError(validation.error);
      setPhase('error');
      return;
    }
    setPhase('uploading');
    setError(undefined);
    try {
      const next = await uploadAuctionImages(auction.id, files);
      await onUploaded(next);
      toast.success('Images uploaded.');
      resetSelection();
      setPhase('success');
    } catch (err: unknown) {
      if (isAuctionImageFreezeError(err)) {
        setFrozen(true);
        setError(
          getApiErrorMessage(
            err,
            'Images cannot be changed after the auction has started or received bids.',
          ),
        );
        await onUploaded(auction);
        setPhase('error');
        return;
      }
      setError(
        getApiErrorMessage(err, 'We could not upload these images.'),
      );
      setPhase('error');
    }
  };

  if (!eligible) {
    return (
      <section
        aria-labelledby="auction-images-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="auction-images-heading"
          className="text-base font-semibold text-zinc-900 dark:text-white"
        >
          Auction Images
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {existingCount} of {AUCTION_IMAGE_MAX_PER_AUCTION} images
        </p>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          Images are locked once an auction starts or receives bids.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="auction-images-heading"
      className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2
        id="auction-images-heading"
        className="text-base font-semibold text-zinc-900 dark:text-white"
      >
        Auction Images
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {existingCount} of {AUCTION_IMAGE_MAX_PER_AUCTION} images
        {remaining > 0
          ? ` · ${remaining} remaining`
          : ' · capacity reached'}
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900">
          <span>Choose Images</span>
          <input
            ref={inputRef}
            type="file"
            name="auction_images"
            accept={AUCTION_IMAGE_ACCEPT}
            multiple
            disabled={phase === 'uploading' || remaining === 0}
            className="sr-only"
            onChange={handleSelect}
          />
        </label>
        <button
          type="button"
          disabled={
            phase === 'uploading' ||
            files.length === 0 ||
            remaining === 0
          }
          aria-busy={phase === 'uploading'}
          onClick={() => void handleUpload()}
          className="inline-flex items-center justify-center rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {phase === 'uploading' ? 'Uploading…' : 'Upload Images'}
        </button>
      </div>

      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        JPEG, PNG, WEBP, or GIF. Up to {AUCTION_IMAGE_MAX_PER_REQUEST} files
        per upload, 5MB each. MIME checks are for convenience only — the server
        validates files.
      </p>

      {files.length > 0 ? (
        <ul
          className="mt-3 list-inside list-disc text-sm text-zinc-700 dark:text-zinc-300"
          aria-label="Selected image files"
        >
          {files.map((file) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}`}>
              {file.name} ({Math.ceil(file.size / 1024)} KB)
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </section>
  );
}
