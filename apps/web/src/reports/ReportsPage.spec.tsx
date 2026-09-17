// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReportsPage } from './ReportsPage.js';

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage(pollInterval?: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReportsPage today="2026-09-16" {...(pollInterval === undefined ? {} : { pollInterval })} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ReportsPage', () => {
  it('refreshes an empty report while a synchronization is active', async () => {
    let restaurantCalls = 0;
    let reportCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/restaurants') {
        restaurantCalls += 1;
        return json([{ id: 'restaurant-a', displayName: 'Restaurant A', timezone: 'UTC', lastSuccessfulSyncAt: restaurantCalls > 1 ? '2026-09-16T10:00:00.000Z' : null, latestSync: { status: restaurantCalls > 1 ? 'SUCCEEDED' : 'RUNNING', safeErrorCode: null } }]);
      }
      if (url.includes('/reports/employees')) {
        reportCalls += 1;
        return json(reportCalls > 1 ? [{ rank: 1, employeeId: 'employee-a', name: 'Анна', revenue: '100.00', ordersCount: 1, averageCheque: '100.00', currency: 'RUB' }] : []);
      }
      return json([]);
    }));

    renderPage(10);

    expect(await screen.findByText('Синхронизация выполняется. Отчёт обновится после завершения.')).toBeInTheDocument();
    expect(await screen.findByText('Анна')).toBeInTheDocument();
  });

  it('shows sync context, both rankings and requests the selected metric', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/restaurants') {
        return json([
          {
            id: 'restaurant-a',
            displayName: 'Restaurant A',
            timezone: 'Europe/Moscow',
            lastSuccessfulSyncAt: '2026-09-15T10:00:00.000Z',
            latestSync: { status: 'FAILED', safeErrorCode: 'SOURCE_UNAVAILABLE' },
          },
        ]);
      }
      if (url.includes('/reports/employees')) {
        return json([
          {
            rank: 1,
            employeeId: 'employee-a',
            name: 'Анна',
            revenue: '125.50',
            ordersCount: 2,
            averageCheque: '62.75',
            currency: 'RUB',
          },
        ]);
      }
      if (url.includes('/reports/products')) {
        return json({
          rows: [
            {
              rank: 1,
              productId: 'product-a',
              name: 'Айран',
              unitsSold: 3,
              revenue: '125.50',
              cogs: '75.30',
              grossMargin: '50.20',
              grossMarginRate: '40.00',
              currency: 'RUB',
            },
            {
              rank: 2,
              productId: 'product-b',
              name: 'Неизвестный товар',
              unitsSold: 1,
              revenue: '20.00',
              cogs: null,
              grossMargin: null,
              grossMarginRate: null,
              currency: 'RUB',
            },
          ],
          coverage: { costedUnits: 3, totalUnits: 4, percentage: '75.00' },
        });
      }
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    expect(screen.getByRole('progressbar', { name: 'Загрузка отчёта' })).toBeInTheDocument();
    expect(await screen.findByText('Анна')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'По выручке' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'По заказам' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/Последняя успешная синхронизация/)).toHaveTextContent('15.09.2026');
    expect(screen.getByRole('alert')).toHaveTextContent('Последняя синхронизация завершилась ошибкой');

    fireEvent.click(screen.getByRole('tab', { name: 'Товары' }));
    expect(await screen.findByText('Айран')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Себестоимость' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Валовая маржа' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Маржа %' })).toBeInTheDocument();
    expect(screen.getByText('Покрытие себестоимостью: 3 из 4 ед. (75,00 %)')).toBeInTheDocument();
    expect(screen.getAllByText('Нет данных')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'По себестоимости' }));
    expect(screen.getByRole('button', { name: 'По себестоимости' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'По валовой марже' }));
    expect(screen.getByRole('button', { name: 'По валовой марже' })).toHaveAttribute('aria-pressed', 'true');

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/reports/products?'),
        expect.anything(),
      ),
    );
    const productUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(productUrls.some((url) => url.includes('sort=cogs'))).toBe(true);
    expect(productUrls.some((url) => url.includes('sort=grossMargin'))).toBe(true);
  });

  it('guides a user who has no assigned restaurants', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json([])));
    renderPage();

    expect(await screen.findByText('Нет доступных ресторанов')).toBeInTheDocument();
    expect(screen.getByText('Обратитесь к администратору, чтобы получить доступ.')).toBeInTheDocument();
  });

  it('shows an empty report without inventing data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/restaurants'
          ? json([
              {
                id: 'restaurant-a',
                displayName: 'Restaurant A',
                timezone: 'UTC',
                lastSuccessfulSyncAt: null,
                latestSync: null,
              },
            ])
          : json([]),
      ),
    );
    renderPage();

    expect(await screen.findByText('За период нет данных')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers a retry when the report request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/restaurants'
          ? json([
              {
                id: 'restaurant-a',
                displayName: 'Restaurant A',
                timezone: 'UTC',
                lastSuccessfulSyncAt: null,
                latestSync: null,
              },
            ])
          : json({ message: 'Unavailable' }, 503),
      ),
    );
    renderPage();

    expect(await screen.findByText('Не удалось загрузить отчёт.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('stops loading and does not request a reversed period', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/restaurants'
        ? json([
            {
              id: 'restaurant-a',
              displayName: 'Restaurant A',
              timezone: 'UTC',
              lastSuccessfulSyncAt: null,
              latestSync: null,
            },
          ])
        : json([]),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    expect(await screen.findByText('За период нет данных')).toBeInTheDocument();
    const reportCalls = fetchMock.mock.calls.length;

    fireEvent.change(screen.getByLabelText('Дата начала'), { target: { value: '2026-09-20' } });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Дата начала должна быть не позже даты окончания.',
    );
    expect(screen.queryByRole('progressbar', { name: 'Загрузка отчёта' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(reportCalls);
  });

  it('does not request a report with a missing date', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/restaurants'
        ? json([
            {
              id: 'restaurant-a',
              displayName: 'Restaurant A',
              timezone: 'UTC',
              lastSuccessfulSyncAt: null,
              latestSync: null,
            },
          ])
        : json([]),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    expect(await screen.findByText('За период нет данных')).toBeInTheDocument();
    const reportCalls = fetchMock.mock.calls.length;

    fireEvent.change(screen.getByLabelText('Дата окончания'), { target: { value: '' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Укажите дату начала и окончания.');
    expect(screen.queryByRole('progressbar', { name: 'Загрузка отчёта' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(reportCalls);
  });

  it('renders forbidden report access without leaking rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/restaurants'
          ? json([
              {
                id: 'restaurant-a',
                displayName: 'Restaurant A',
                timezone: 'UTC',
                lastSuccessfulSyncAt: null,
                latestSync: null,
              },
            ])
          : json({ message: 'Forbidden' }, 403),
      ),
    );
    renderPage();

    expect(await screen.findByText('Доступ к отчёту запрещён')).toBeInTheDocument();
  });
});
