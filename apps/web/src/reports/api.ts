import {
  employeeRankingResponseSchema,
  productRankingResponseSchema,
  type EmployeeRankingRow,
  type ProductRankingRow,
} from '@bazols/contracts';

import { apiRequest } from '../auth/api.js';

export type SyncSummary = {
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  safeErrorCode: string | null;
};

export type RestaurantOption = {
  id: string;
  displayName: string;
  timezone: string;
  lastSuccessfulSyncAt: string | null;
  latestSync: SyncSummary | null;
};

export type EmployeeSort = 'revenue' | 'ordersCount' | 'averageCheque';
export type ProductSort = 'unitsSold' | 'revenue';

export function listRestaurants(): Promise<RestaurantOption[]> {
  return apiRequest<RestaurantOption[]>('/api/restaurants');
}

function query(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

export async function loadEmployeeRanking(
  restaurantId: string,
  from: string,
  to: string,
  sort: EmployeeSort,
): Promise<EmployeeRankingRow[]> {
  const value = await apiRequest<unknown>(
    `/api/restaurants/${restaurantId}/reports/employees?${query({ from, to, sort })}`,
  );
  return employeeRankingResponseSchema.parse(value);
}

export async function loadProductRanking(
  restaurantId: string,
  from: string,
  to: string,
  sort: ProductSort,
): Promise<ProductRankingRow[]> {
  const value = await apiRequest<unknown>(
    `/api/restaurants/${restaurantId}/reports/products?${query({ from, to, sort })}`,
  );
  return productRankingResponseSchema.parse(value);
}
