import api from '@/lib/api';
import type { AdminDashboardSummary } from './adminDashboard';

export const ADMIN_DASHBOARD_SUMMARY_API_PATH = '/admin/dashboard/summary/';

export async function adminDashboardSummaryFetcher(
  url: string = ADMIN_DASHBOARD_SUMMARY_API_PATH,
): Promise<AdminDashboardSummary> {
  const { data } = await api.get<AdminDashboardSummary>(url);
  return data;
}
