export type AuthUser = {
  id: string;
  username: string;
  role: 'ADMIN' | 'MANAGER';
};

export type AuthSession = { user: AuthUser; csrfToken: string };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(code ?? `HTTP_${status}`);
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    let code: string | undefined;
    try {
      const body = (await response.json()) as { code?: string; message?: string };
      code = body.code ?? body.message;
    } catch {
      code = undefined;
    }
    if (
      response.status === 401 &&
      path !== '/api/auth/me' &&
      path !== '/api/auth/login' &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new Event('bazols:unauthorized'));
    }
    throw new ApiError(response.status, code);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function loadSession(): Promise<AuthSession> {
  return apiRequest<AuthSession>('/api/auth/me');
}

export function login(username: string, password: string): Promise<AuthSession> {
  return apiRequest<AuthSession>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function logout(csrfToken: string): Promise<void> {
  return apiRequest<void>('/api/auth/logout', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  });
}
