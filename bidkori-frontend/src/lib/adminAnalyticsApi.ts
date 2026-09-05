import api from '@/lib/api';
import {
  ADMIN_ANALYTICS_API_PATH,
  normalizeAdminAnalytics,
  type AdminAnalytics,
} from '@/lib/adminAnalytics';

export {
  ADMIN_ANALYTICS_API_PATH,
  BIDDING_VOLUME_HINT,
  BIDDING_VOLUME_LABEL,
  normalizeAdminAnalytics,
  type AdminAnalytics,
  type AdminBidEscalationRow,
  type AdminCategoryBreakdownRow,
  type AdminTopBidderRow,
} from '@/lib/adminAnalytics';

export async function fetchAdminAnalytics(): Promise<AdminAnalytics> {
  const { data } = await api.get<unknown>(ADMIN_ANALYTICS_API_PATH);
  return normalizeAdminAnalytics(data);
}

/** SWR-compatible fetcher for ADMIN_ANALYTICS_API_PATH. */
export async function adminAnalyticsFetcher(url: string): Promise<AdminAnalytics> {
  const { data } = await api.get<unknown>(url);
  return normalizeAdminAnalytics(data);
}
