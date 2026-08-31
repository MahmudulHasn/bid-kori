'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, PlusCircle } from 'lucide-react';
import toast from 'react-hot-toast';

import api from '@/lib/api';

export default function CreateAuctionPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startingBid, setStartingBid] = useState('');
  const [endTime, setEndTime] = useState('');
  const [images, setImages] = useState<FileList | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const start = new Date();
      const end = new Date(endTime);
      if (Number.isNaN(end.getTime()) || end <= start) {
        toast.error('End time must be in the future.');
        return;
      }

      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append(
        'product',
        JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          condition: 'USED_GOOD',
        }),
      );
      formData.append('starting_bid', startingBid);
      formData.append('min_increment', '10.00');
      formData.append('start_time', start.toISOString());
      formData.append('end_time', end.toISOString());

      if (images) {
        Array.from(images).forEach((file) => {
          formData.append('images', file);
        });
      }

      await api.post('/auctions/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast.success('Auction created successfully.');
      router.push('/');
    } catch (error: unknown) {
      const responseData = (
        error as { response?: { data?: Record<string, unknown> } }
      )?.response?.data;
      const message =
        (typeof responseData?.detail === 'string' && responseData.detail) ||
        (typeof responseData?.error === 'string' && responseData.error) ||
        'Failed to create auction. Check your inputs and try again.';
      toast.error(String(message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
          <PlusCircle className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
            Create auction
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            List a product with a starting bid, end time, and optional gallery images.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Title
          </span>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="Vintage film camera"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Description
          </span>
          <textarea
            required
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="Condition, accessories, and shipping notes"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Starting bid (BDT)
            </span>
            <input
              type="number"
              required
              min="1"
              step="0.01"
              value={startingBid}
              onChange={(e) => setStartingBid(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="1000.00"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              End time
            </span>
            <input
              type="datetime-local"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <ImagePlus className="h-4 w-4" aria-hidden />
            Images
          </span>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => setImages(e.target.files)}
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-amber-500 dark:text-zinc-300"
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            You can select multiple images. The first becomes the primary card image.
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Creating auction…' : 'Create auction'}
        </button>
      </form>
    </main>
  );
}
