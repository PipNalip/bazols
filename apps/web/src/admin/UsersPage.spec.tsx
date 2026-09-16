// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UsersPage } from './UsersPage.js';

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UsersPage csrfToken="csrf-token" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('UsersPage', () => {
  it('creates a manager with multiple restaurant assignments', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/users' && !init?.method) return json([]);
      if (url === '/api/restaurants') {
        return json([
          { id: 'restaurant-a', displayName: 'Север', timezone: 'UTC', lastSuccessfulSyncAt: null, latestSync: null },
          { id: 'restaurant-b', displayName: 'Центр', timezone: 'UTC', lastSuccessfulSyncAt: null, latestSync: null },
        ]);
      }
      if (url === '/api/users' && init?.method === 'POST') {
        return json({ id: 'manager-a', username: 'anna', role: 'MANAGER', active: true, restaurantIds: ['restaurant-a', 'restaurant-b'] }, 201);
      }
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Добавить менеджера' }));
    fireEvent.change(screen.getByLabelText('Логин'), { target: { value: 'anna' } });
    fireEvent.change(screen.getByLabelText('Временный пароль'), { target: { value: 'temporary-password' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Север' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Центр' }));
    fireEvent.click(screen.getByRole('button', { name: 'Создать менеджера' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Менеджер создан');
    const createCall = fetchMock.mock.calls.find(([url, init]) => String(url) === '/api/users' && init?.method === 'POST');
    expect(createCall?.[1]).toMatchObject({
      headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' }),
      body: JSON.stringify({ username: 'anna', temporaryPassword: 'temporary-password', restaurantIds: ['restaurant-a', 'restaurant-b'] }),
    });
  });

  it('updates assignments, resets a password and blocks a manager', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/users' && !init?.method) return json([{ id: 'manager-a', username: 'anna', role: 'MANAGER', active: true, restaurantIds: ['restaurant-a'] }]);
      if (url === '/api/restaurants') {
        return json([
          { id: 'restaurant-a', displayName: 'Север', timezone: 'UTC', lastSuccessfulSyncAt: null, latestSync: null },
          { id: 'restaurant-b', displayName: 'Центр', timezone: 'UTC', lastSuccessfulSyncAt: null, latestSync: null },
        ]);
      }
      return json({ id: 'manager-a', username: 'anna', role: 'MANAGER', active: !url.endsWith('/block'), restaurantIds: ['restaurant-b'] });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    expect(await screen.findByText('anna')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить рестораны для anna' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Север' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Центр' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить назначения' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/users/manager-a/restaurants', expect.objectContaining({ method: 'PUT' })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Назначения ресторанов' })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить пароль для anna' }));
    fireEvent.change(screen.getByLabelText('Новый временный пароль'), { target: { value: 'another-temporary-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить пароль' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/users/manager-a/reset-password', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Сбросить пароль' })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Заблокировать anna' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/users/manager-a/block', expect.objectContaining({ method: 'POST' })));
  });
});
