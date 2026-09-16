import { describe, expect, it, vi } from 'vitest';

import { SourceError } from './source.errors.js';
import { SourceHttpClient } from './source-http.client.js';
import type { SourceOperation } from './source-routes.js';

const operations: Array<{
  operation: SourceOperation;
  path: string;
  query: Record<string, string>;
}> = [
  {
    operation: { kind: 'authenticate', login: 'private-login', password: 'private-password' },
    path: '/Infrastructure/Authenticate/Authenticate',
    query: { login: 'private-login', password: 'private-password' },
  },
  {
    operation: { kind: 'permissions' },
    path: '/Infrastructure/Authenticate/GetPermissions',
    query: {},
  },
  {
    operation: { kind: 'setRole', unitId: 'unit-1', role: 'REPORT_VIEWER' },
    path: '/Infrastructure/Authenticate/SetRole',
    query: { role: 'REPORT_VIEWER', unitId: 'unit-1' },
  },
  {
    operation: {
      kind: 'employeeRating',
      beginDate: '2026-09-01',
      endDate: '2026-09-30',
      page: 2,
      pageSize: 50,
    },
    path: '/Reports/EmployeesRating/GetData',
    query: {
      beginDate: '2026-09-01',
      employeeSurname: '',
      employeeType: '',
      endDate: '2026-09-30',
      page: '2',
      pageSize: '50',
    },
  },
  {
    operation: { kind: 'productCatalog' },
    path: '/Products/Home/GetAllProducts',
    query: { isRemove: 'false' },
  },
  {
    operation: { kind: 'productionMaterials' },
    path: '/InventoryControl/TechnicalCards/GetAllProductionMaterials',
    query: {},
  },
  {
    operation: { kind: 'productTechnicalCardSummary', productId: 'product-1' },
    path: '/InventoryControl/TechnicalCards/GetProductById',
    query: { productId: 'product-1' },
  },
  {
    operation: {
      kind: 'technicalCards',
      productId: 'product-1',
      startIndex: 0,
      pageSize: 20,
    },
    path: '/InventoryControl/TechnicalCards/GetPagedTechnicalCard',
    query: { pageSize: '20', productId: 'product-1', startIndex: '0' },
  },
];

function clientWith(transport: typeof fetch): SourceHttpClient {
  return new SourceHttpClient('https://source.example.invalid', { fetch: transport });
}

describe('SourceHttpClient read-only boundary', () => {
  it.each(operations)('maps $operation.kind to its exact GET route', async ({ operation, path, query }) => {
    const calls: Array<{ init: RequestInit | undefined; url: URL }> = [];
    const transport = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ init, url: new URL(String(input)) });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const client = clientWith(transport as typeof fetch);

    await client.execute(operation, 'correlation-1');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.method).toBe('GET');
    expect(calls[0]?.url.pathname).toBe(path);
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toEqual(query);
    expect('request' in client).toBe(false);
  });

  it('rejects an unknown operation before fetch', async () => {
    const transport = vi.fn<typeof fetch>();
    const client = clientWith(transport);

    await expect(
      client.execute({ kind: 'delete' } as never, 'correlation-unknown'),
    ).rejects.toMatchObject({ code: 'SOURCE_OPERATION_UNKNOWN' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('requires HTTPS and restricts the test bypass to loopback', () => {
    expect(() => new SourceHttpClient('http://source.example.invalid')).toThrow(
      'SOURCE_TRANSPORT_FAILED',
    );
    expect(
      () =>
        new SourceHttpClient('http://source.example.invalid', {
          allowInsecureForTests: true,
        }),
    ).toThrow('SOURCE_TRANSPORT_FAILED');
    expect(
      () =>
        new SourceHttpClient('http://127.0.0.1:8001', {
          allowInsecureForTests: true,
          fetch: vi.fn<typeof fetch>(),
        }),
    ).not.toThrow();
  });

  it('rejects cross-origin redirects before following them', async () => {
    const transport = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://other.example.invalid/private' },
      }),
    );
    const client = clientWith(transport as typeof fetch);

    await expect(
      client.execute({ kind: 'permissions' }, 'correlation-redirect'),
    ).rejects.toMatchObject({ code: 'SOURCE_REDIRECT_BLOCKED' });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('rejects same-origin redirects to paths outside the allowlist', async () => {
    const transport = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: '/Internal/DeleteEverything' },
      }),
    );
    const client = clientWith(transport as typeof fetch);

    await expect(
      client.execute({ kind: 'permissions' }, 'correlation-same-origin-redirect'),
    ).rejects.toMatchObject({ code: 'SOURCE_REDIRECT_BLOCKED' });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('reports only endpoint key and correlation ID on transport failure', async () => {
    const transport = vi.fn(async () => {
      const response = new Response('response-pii-sentinel', {
        status: 401,
        headers: { 'set-cookie': 'session=cookie-sentinel' },
      });
      Object.defineProperty(response, 'url', {
        value: 'https://source.example.invalid/Infrastructure/Authenticate/Authenticate',
      });
      return response;
    });
    const client = clientWith(transport as typeof fetch);

    let error: unknown;
    try {
      await client.execute(
        { kind: 'authenticate', login: 'login-sentinel', password: 'password-sentinel' },
        'correlation-safe',
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(SourceError);
    expect(error).toMatchObject({
      code: 'SOURCE_AUTH_FAILED',
      correlationId: 'correlation-safe',
      endpoint: 'authenticate',
    });
    const serialized = JSON.stringify(error) + String(error);
    expect(serialized).not.toContain('login-sentinel');
    expect(serialized).not.toContain('password-sentinel');
    expect(serialized).not.toContain('cookie-sentinel');
    expect(serialized).not.toContain('response-pii-sentinel');
  });
});
