'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';
import useSWR, { useSWRConfig } from 'swr';

import ProductForm from '@/components/seller/ProductForm';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage, getApiFieldErrors, getApiStatus } from '@/lib/apiErrors';
import {
  MY_LISTINGS_API_PATH,
  buildProductDetailApiPath,
  productDetailFetcher,
  updateProduct,
} from '@/lib/productsApi';
import {
  PRODUCT_WRITE_FIELDS,
  isProductOwnedByUser,
  productFormValuesFromProduct,
  serializeProductWritePayload,
  type ProductFormValues,
} from '@/lib/seller';
import {
  SELLER_PRODUCTS_PATH,
  sellerProductDetailPath,
} from '@/lib/workspaceNavigation';

export default function SellerEditProductPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id;
  const router = useRouter();
  const { user } = useAuth();
  const { mutate: mutateCache } = useSWRConfig();

  const {
    data: product,
    error,
    isLoading,
    mutate,
  } = useSWR(
    productId ? buildProductDetailApiPath(productId) : null,
    productDetailFetcher,
  );

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof ProductFormValues, string>>
  >({});

  const owned = isProductOwnedByUser(product, user);
  const status = getApiStatus(error);
  const unavailable = Boolean(error) && (status === 404 || status === 403);

  const handleSubmit = async (values: ProductFormValues) => {
    if (submitting || !productId) return;
    setSubmitting(true);
    setFormError(undefined);
    setFieldErrors({});

    try {
      const updated = await updateProduct(
        productId,
        serializeProductWritePayload(values),
      );
      await mutateCache(MY_LISTINGS_API_PATH);
      await mutateCache(buildProductDetailApiPath(productId), updated, {
        revalidate: false,
      });
      toast.success('Product updated.');
      router.push(sellerProductDetailPath(updated.id));
    } catch (err: unknown) {
      setFieldErrors(
        getApiFieldErrors(err, PRODUCT_WRITE_FIELDS) as Partial<
          Record<keyof ProductFormValues, string>
        >,
      );
      setFormError(getApiErrorMessage(err, 'We could not update this product.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <p>
        <Link
          href={productId ? sellerProductDetailPath(productId) : SELLER_PRODUCTS_PATH}
          className="text-sm text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
        >
          ← Back to product
        </Link>
      </p>

      {isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <p className="sr-only">Loading product</p>
          <div className="h-10 w-2/3 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-72 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
        </div>
      ) : null}

      {unavailable ? (
        <section
          role="alert"
          className="rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">
            Product unavailable
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            We couldn&apos;t load this product.
          </p>
        </section>
      ) : null}

      {error && !unavailable ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <p>We couldn&apos;t load this product.</p>
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

      {!isLoading && !error && product && !owned ? (
        <section className="rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">
            You don&apos;t have permission to manage this product.
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            This listing is not part of your seller catalog.
          </p>
        </section>
      ) : null}

      {!isLoading && !error && product && owned ? (
        <>
          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
              Edit Product
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              Update catalog details for this item. Auction pricing is not
              edited here.
            </p>
          </header>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
            <ProductForm
              initialValues={productFormValuesFromProduct(product)}
              submitting={submitting}
              submitLabel="Save changes"
              submittingLabel="Saving changes…"
              formError={formError}
              fieldErrors={fieldErrors}
              onSubmit={(values) => void handleSubmit(values)}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
