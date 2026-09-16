// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SyncPage } from './SyncPage.js';

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SyncPage csrfToken="csrf-token" today="2026-09-16" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SyncPage', () => {
  it('discovers source access and creates the first restaurant mapping', async () => {
    let created = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/restaurants' && !init?.method) return json(created ? [{ id: 'restaurant-a', displayName: 'Центр', sourceUnitId: 'unit-a', sourceRole: 'REPORT_VIEWER', timezone: 'Europe/Moscow', active: true, lastSuccessfulSyncAt: null, latestSync: null }] : []);
      if (url.startsWith('/api/sync-runs?')) return json({ total: 0, page: 1, pageSize: 20, items: [] });
      if (url === '/api/source-discovery') return json({ units: [{ id: 'unit-a', name: 'Центральное подразделение', roles: ['REPORT_VIEWER'] }] });
      if (url === '/api/restaurants' && init?.method === 'POST') {
        created = true;
        return json({ id: 'restaurant-a', displayName: 'Центр', sourceUnitId: 'unit-a', sourceRole: 'REPORT_VIEWER', timezone: 'Europe/Moscow', active: true, lastSuccessfulSyncAt: null, latestSync: null }, 201);
      }
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Добавить ресторан' }));
    expect(await screen.findByText('Центральное подразделение')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Название ресторана'), { target: { value: 'Центр' } });
    fireEvent.change(screen.getByLabelText('Часовой пояс'), { target: { value: 'Europe/Moscow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить ресторан' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/restaurants', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' }),
      body: JSON.stringify({ displayName: 'Центр', sourceUnitId: 'unit-a', sourceRole: 'REPORT_VIEWER', timezone: 'Europe/Moscow' }),
    })));
  });

  it('validates dates, enqueues a run and renders only safe history details', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/restaurants') {
        return json([{ id: 'restaurant-a', displayName: 'Север', timezone: 'UTC', lastSuccessfulSyncAt: null, latestSync: { status: 'FAILED', safeErrorCode: 'SOURCE_SCHEMA_INVALID' } }]);
      }
      if (url.startsWith('/api/sync-runs?')) {
        return json({ total: 1, page: 1, pageSize: 20, items: [{ id: 'run-old', restaurantId: 'restaurant-a', beginDate: '2026-09-01', endDate: '2026-09-10', status: 'FAILED', employeesCount: 0, productsCount: 0, ordersCount: 0, orderItemsCount: 0, safeErrorCode: 'SOURCE_SCHEMA_INVALID', createdAt: '2026-09-10T00:00:00.000Z', startedAt: null, finishedAt: '2026-09-10T00:01:00.000Z' }] });
      }
      if (url === '/api/sync-runs' && init?.method === 'POST') return json({ id: 'run-new', restaurantId: 'restaurant-a', status: 'QUEUED' }, 202);
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    expect(await screen.findByText('SOURCE_SCHEMA_INVALID')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Дата начала'), { target: { value: '2026-09-12' } });
    fireEvent.change(screen.getByLabelText('Дата окончания'), { target: { value: '2026-09-11' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Дата начала должна быть не позже даты окончания.');
    expect(screen.getByRole('button', { name: 'Запустить синхронизацию' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Дата окончания'), { target: { value: '2026-09-16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запустить синхронизацию' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Синхронизация поставлена в очередь');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/sync-runs', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' }) })));
  });

  it('disables enqueue while the selected restaurant has an active run', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/restaurants'
        ? json([{ id: 'restaurant-a', displayName: 'Север', timezone: 'UTC', lastSuccessfulSyncAt: null, latestSync: { status: 'RUNNING', safeErrorCode: null } }])
        : json({ total: 0, page: 1, pageSize: 20, items: [] }),
    ));
    renderPage();

    expect(await screen.findByText('Для ресторана уже выполняется синхронизация.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Запустить синхронизацию' })).toBeDisabled();
  });
});
