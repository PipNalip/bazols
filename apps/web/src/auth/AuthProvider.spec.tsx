// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from './AuthProvider.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Status() {
  const auth = useAuth();
  return (
    <div>
      {auth.status === 'authenticated' ? auth.user.username : auth.status}
      {auth.sessionExpired ? ' — expired' : ''}
    </div>
  );
}

describe('AuthProvider', () => {
  it('loads the current server session before exposing authenticated content', async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    render(
      <AuthProvider>
        <Status />
      </AuthProvider>,
    );

    expect(screen.getByText('loading')).toBeInTheDocument();
    resolveFetch?.(
      new Response(
        JSON.stringify({
          user: { id: 'user-a', username: 'manager', role: 'MANAGER' },
          csrfToken: 'csrf-a',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    expect(await screen.findByText('manager')).toBeInTheDocument();
  });

  it('treats an expired bootstrap session as anonymous', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    render(
      <AuthProvider>
        <Status />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());
  });

  it('marks a session that expires while the app is in use', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            user: { id: 'user-a', username: 'manager', role: 'MANAGER' },
            csrfToken: 'csrf-a',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    render(
      <AuthProvider>
        <Status />
      </AuthProvider>,
    );
    expect(await screen.findByText('manager')).toBeInTheDocument();

    window.dispatchEvent(new Event('bazols:unauthorized'));
    expect(await screen.findByText('anonymous — expired')).toBeInTheDocument();
  });
});
