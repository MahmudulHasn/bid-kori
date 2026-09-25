import api from '@/lib/api';
import type {
  AdminSellerVerification,
  SellerVerificationRecord,
  SellerVerificationStatus,
} from '@/lib/types';

export async function getSellerVerificationStatus(): Promise<SellerVerificationRecord> {
  const response = await api.get<SellerVerificationRecord>('/users/verification/status/');
  return response.data;
}

export async function submitSellerVerification(
  formData: FormData,
): Promise<SellerVerificationRecord> {
  const response = await api.post<SellerVerificationRecord>(
    '/users/verification/submit/',
    formData,
  );
  return response.data;
}

export async function fetchAdminVerifications(
  statusFilter?: SellerVerificationStatus,
): Promise<AdminSellerVerification[]> {
  const params: Record<string, string> = {};
  if (statusFilter) {
    params.status = statusFilter;
  }
  const response = await api.get<AdminSellerVerification[]>('/admin/verifications/', {
    params,
  });
  return response.data;
}

export async function fetchAdminVerificationDetail(
  id: number,
): Promise<AdminSellerVerification> {
  const response = await api.get<AdminSellerVerification>(`/admin/verifications/${id}/`);
  return response.data;
}

export async function approveSellerVerification(
  id: number,
): Promise<AdminSellerVerification> {
  const response = await api.post<AdminSellerVerification>(
    `/admin/verifications/${id}/approve/`,
  );
  return response.data;
}

export async function rejectSellerVerification(
  id: number,
  adminNote?: string,
): Promise<AdminSellerVerification> {
  const response = await api.post<AdminSellerVerification>(
    `/admin/verifications/${id}/reject/`,
    { admin_note: adminNote || '' },
  );
  return response.data;
}
