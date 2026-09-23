/**
 * Admin fulfillment audit API fetchers (ADMIN-W01).
 * SWR-compatible async fetchers for list, detail, and summary endpoints.
 */

import api from '@/lib/api';
import type {
  AdminFulfillmentDetail,
  AdminFulfillmentPaginatedResponse,
  AdminFulfillmentSummary,
} from './adminFulfillment';
import {
  ADMIN_FULFILLMENT_API_PATH,
  ADMIN_FULFILLMENT_SUMMARY_API_PATH,
} from './adminFulfillment';

export async function adminFulfillmentListFetcher(
  url: string = ADMIN_FULFILLMENT_API_PATH,
): Promise<AdminFulfillmentPaginatedResponse> {
  const { data } = await api.get<AdminFulfillmentPaginatedResponse>(url);
  return data;
}

export async function adminFulfillmentSummaryFetcher(
  url: string = ADMIN_FULFILLMENT_SUMMARY_API_PATH,
): Promise<AdminFulfillmentSummary> {
  const { data } = await api.get<AdminFulfillmentSummary>(url);
  return data;
}

export async function adminFulfillmentDetailFetcher(
  url: string,
): Promise<AdminFulfillmentDetail> {
  const { data } = await api.get<AdminFulfillmentDetail>(url);
  return data;
}
