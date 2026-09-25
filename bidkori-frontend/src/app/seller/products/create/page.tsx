'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSWRConfig } from 'swr';

import ProductForm from '@/components/seller/ProductForm';
import SellerVerificationModal from '@/components/seller/SellerVerificationModal';
import SellerVerificationStatusCard from '@/components/seller/SellerVerificationStatusCard';
import { useAuth } from '@/context/AuthContext';
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
  getSellerVerificationStatus,
} from '@/lib/sellerVerificationApi';
import type { SellerVerificationRecord } from '@/lib/types';
import {
  SELLER_PRODUCTS_PATH,
  sellerProductDetailPath,
} from '@/lib/workspaceNavigation';

export default function SellerCreateProductPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { mutate } = useSWRConfig();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof ProductFormValues, string>>
  >({});

  // Verification state tracking
  const [verificationRecord, setVerificationRecord] = useState<SellerVerificationRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const fetchStatus = async () => {
    try {
      setLoadingStatus(true);
      const record = await getSellerVerificationStatus();
      setVerificationRecord(record);
      if (record.status !== 'APPROVED' && record.status !== 'PENDING' && record.status !== 'REJECTED') {
        // First-time seller: automatically show the verification popup
        setIsModalOpen(true);
      }
    } catch {
      // If error or unauthenticated, fallback to auth context
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const currentStatus = verificationRecord?.status ?? user?.seller_verified ?? null;
  const isApproved = currentStatus === 'APPROVED';

  const handleSubmit = async (values: ProductFormValues) => {
    if (!isApproved) {
      toast.error('You must be verified before creating products.');
      setIsModalOpen(true);
      return;
    }

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
          Add a catalog item you own. After creation you can upload photos on
          the product page. Auction pricing is set later when you list it for
          bidding.
        </p>
      </header>

      {/* Verification Gate */}
      {!loadingStatus && !isApproved ? (
        <div className="space-y-6">
          <SellerVerificationStatusCard
            status={currentStatus}
            verificationRecord={verificationRecord}
            onRefresh={async () => {
              await fetchStatus();
              await refreshUser();
            }}
          />

          <SellerVerificationModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSuccess={async () => {
              await fetchStatus();
              await refreshUser();
            }}
            initialWhatsapp={verificationRecord?.whatsapp_number || ''}
            initialLocation={verificationRecord?.location || ''}
          />
        </div>
      ) : (
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
      )}
    </div>
  );
}

