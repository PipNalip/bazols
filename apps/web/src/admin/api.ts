import { apiRequest } from '../auth/api.js';
import type { RestaurantOption } from '../reports/api.js';

export type Manager = {
  id: string;
  username: string;
  role: 'MANAGER';
  active: boolean;
  restaurantIds: string[];
};

export type SyncRun = {
  id: string;
  restaurantId: string;
  beginDate: string;
  endDate: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  employeesCount: number;
  productsCount: number;
  ordersCount: number;
  orderItemsCount: number;
  safeErrorCode?: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type SyncHistory = { total: number; page: number; pageSize: number; items: SyncRun[] };
export type SourceUnit = { id: string; name: string; roles: string[] };

type ManagerInput = { username: string; temporaryPassword: string; restaurantIds: string[] };

type RequestContext = { csrfToken: string };

function mutation<T>(path: string, method: 'POST' | 'PUT', body: unknown, context: RequestContext) {
  return apiRequest<T>(path, {
    method,
    headers: { 'X-CSRF-Token': context.csrfToken },
    body: JSON.stringify(body),
  });
}

export function listManagers(): Promise<Manager[]> {
  return apiRequest<Manager[]>('/api/users');
}

export function listAdminRestaurants(): Promise<RestaurantOption[]> {
  return apiRequest<RestaurantOption[]>('/api/restaurants');
}

export async function discoverSource(): Promise<SourceUnit[]> {
  const response = await apiRequest<{ units: SourceUnit[] }>('/api/source-discovery');
  return response.units;
}

export function createRestaurant(
  input: { displayName: string; sourceUnitId: string; sourceRole: string; timezone: string },
  context: RequestContext,
): Promise<RestaurantOption> {
  return mutation<RestaurantOption>('/api/restaurants', 'POST', input, context);
}

export function createManager(input: ManagerInput, context: RequestContext): Promise<Manager> {
  return mutation<Manager>('/api/users', 'POST', input, context);
}

export function replaceAssignments(id: string, restaurantIds: string[], context: RequestContext): Promise<Manager> {
  return mutation<Manager>(`/api/users/${id}/restaurants`, 'PUT', { restaurantIds }, context);
}

export function resetManagerPassword(id: string, temporaryPassword: string, context: RequestContext): Promise<Manager> {
  return mutation<Manager>(`/api/users/${id}/reset-password`, 'POST', { temporaryPassword }, context);
}

export function blockManager(id: string, context: RequestContext): Promise<Manager> {
  return mutation<Manager>(`/api/users/${id}/block`, 'POST', undefined, context);
}

export function listSyncRuns(): Promise<SyncHistory> {
  return apiRequest<SyncHistory>('/api/sync-runs?page=1&pageSize=20');
}

export function enqueueSync(input: { restaurantId: string; beginDate: string; endDate: string }, context: RequestContext): Promise<SyncRun> {
  return mutation<SyncRun>('/api/sync-runs', 'POST', input, context);
}
