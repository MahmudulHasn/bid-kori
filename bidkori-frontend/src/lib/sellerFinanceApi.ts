import api from '@/lib/api';
import {
  SELLER_EARNINGS_API_PATH,
  buildSellerSalesApiPath,
  normalizeSellerEarnings,
  normalizeSellerSalesList,
  type SellerEarnings,
  type SellerSalesListResponse,
} from '@/lib/sellerFinance';

export async function fetchSellerEarnings(): Promise<SellerEarnings> {
  const { data } = await api.get<unknown>(SELLER_EARNINGS_API_PATH);
  return normalizeSellerEarnings(data);
}

export async function fetchSellerSales(
  page = 1,
): Promise<SellerSalesListResponse> {
  const { data } = await api.get<unknown>(buildSellerSalesApiPath(page));
  return normalizeSellerSalesList(data);
}

export async function sellerEarningsFetcher(
  url: string,
): Promise<SellerEarnings> {
  const { data } = await api.get<unknown>(url);
  return normalizeSellerEarnings(data);
}

export async function sellerSalesFetcher(
  url: string,
): Promise<SellerSalesListResponse> {
  const { data } = await api.get<unknown>(url);
  return normalizeSellerSalesList(data);
}
