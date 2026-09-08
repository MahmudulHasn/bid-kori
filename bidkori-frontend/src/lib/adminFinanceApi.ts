import api from '@/lib/api';
import {
  ADMIN_FINANCE_SUMMARY_API_PATH,
  normalizeAdminFinancialSummary,
  type AdminFinancialSummary,
} from '@/lib/adminFinance';

export async function fetchAdminFinancialSummary(): Promise<AdminFinancialSummary> {
  const { data } = await api.get<unknown>(ADMIN_FINANCE_SUMMARY_API_PATH);
  return normalizeAdminFinancialSummary(data);
}

export async function adminFinancialSummaryFetcher(
  url: string,
): Promise<AdminFinancialSummary> {
  const { data } = await api.get<unknown>(url);
  return normalizeAdminFinancialSummary(data);
}
