'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSWRConfig } from 'swr';

import ProductForm from '@/components/seller/ProductForm';
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/apiErrors';
import {
  MY_LISTINGS_API_PATH,
  createProduct,
} from '@/lib/productsApi';
import {
  PRODUCT_WRITE_FIELDS,
  emptyProductFormValues,
  serializeProductWritePayload,
  type ProductFormValues,
} from '@/lib/seller';
import {
  SELLER_PRODUCTS_PATH,
  sellerProductDetailPath,
} from '@/lib/workspaceNavigation';

export default function SellerCreateProductPage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof ProductFormValues, string>>
  >({});

  const handleSubmit = async (values: ProductFormValues) => {
    if (submitting) return;
    setSubmitting(true);
    setFormError(undefined);
    setFieldErrors({});

    try {
      const created = await createProduct(serializeProductWritePayload(values));
      await mutate(MY_LISTINGS_API_PATH);
      toast.success('Product created.');
      if (created?.id != null) {
        router.push(sellerProductDetailPath(created.id));
      } else {
        router.push(SELLER_PRODUCTS_PATH);
      }
    } catch (error: unknown) {
      setFieldErrors(
        getApiFieldErrors(error, PRODUCT_WRITE_FIELDS) as Partial<
          Record<keyof ProductFormValues, string>
        >,
      );
      setFormError(
        getApiErrorMessage(error, 'We could not create this product.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <p>
        <Link
          href={SELLER_PRODUCTS_PATH}
          className="text-sm text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
        >
          ← Back to products
        </Link>
      </p>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Create Product
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Add a catalog item you own. Auction pricing is set later when you
          list it for bidding.
        </p>
      </header>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
        <ProductForm
          initialValues={emptyProductFormValues()}
          submitting={submitting}
          submitLabel="Create Product"
          submittingLabel="Creating product…"
          formError={formError}
          fieldErrors={fieldErrors}
          onSubmit={(values) => void handleSubmit(values)}
        />
      </div>
    </div>
  );
}
