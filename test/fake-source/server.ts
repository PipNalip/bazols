import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type FakeSourceOptions = {
  authFailure?: boolean;
  contradictoryPagination?: boolean;
  duplicateItemAcrossPages?: boolean;
  duplicateOrderAcrossPages?: boolean;
  empty?: boolean;
  malformedRating?: boolean;
  repeatedPagination?: boolean;
  responseSentinel?: string;
};

export type FakeSource = {
  calls: string[];
  close(): Promise<void>;
  url: string;
};

type RatingFixture = {
  isSuccess: true;
  data: { rows: unknown[]; totalRows: number };
};

const ratingFixture = JSON.parse(
  readFileSync(
    join(process.cwd(), 'test/fixtures/source/employees-rating.success.json'),
    'utf8',
  ),
) as RatingFixture;
const permissionsFixture = readFileSync(
  join(process.cwd(), 'test/fixtures/source/permissions.success.json'),
  'utf8',
);

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

function hasSession(request: IncomingMessage): boolean {
  return request.headers.cookie?.includes('source-session=synthetic') ?? false;
}

export async function startFakeSource(
  options: FakeSourceOptions = {},
): Promise<FakeSource> {
  const calls: string[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (request.method !== 'GET') {
      sendJson(response, 405, { isSuccess: false });
      return;
    }

    if (url.pathname === '/Infrastructure/Authenticate/Authenticate') {
      calls.push('authenticate');
      if (
        options.authFailure ||
        url.searchParams.get('login') !== 'source-login' ||
        url.searchParams.get('password') !== 'source-password'
      ) {
        sendJson(response, 401, {
          isSuccess: false,
          message: options.responseSentinel ?? 'authentication failed',
        });
        return;
      }
      response.setHeader(
        'set-cookie',
        'source-session=synthetic; Path=/; HttpOnly; SameSite=Strict',
      );
      sendJson(response, 200, { isSuccess: true, data: {} });
      return;
    }

    if (!hasSession(request)) {
      sendJson(response, 401, { isSuccess: false });
      return;
    }

    if (url.pathname === '/Infrastructure/Authenticate/GetPermissions') {
      calls.push('permissions');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(permissionsFixture);
      return;
    }

    if (url.pathname === '/Infrastructure/Authenticate/SetRole') {
      calls.push('setRole');
      const allowed =
        url.searchParams.get('unitId') === '10000000-0000-4000-8000-000000000001' &&
        url.searchParams.get('role') === 'SYNTHETIC_REPORT_VIEWER';
      sendJson(response, allowed ? 200 : 403, {
        isSuccess: allowed,
        data: allowed ? {} : null,
      });
      return;
    }

    if (url.pathname === '/Reports/EmployeesRating/GetData') {
      const page = Number(url.searchParams.get('page'));
      const pageSize = Number(url.searchParams.get('pageSize'));
      calls.push(`employeeRating:${page}`);

      if (options.empty) {
        sendJson(response, 200, { isSuccess: true, data: { totalRows: 0, rows: [] } });
        return;
      }

      if (options.malformedRating) {
        sendJson(response, 200, {
          isSuccess: true,
          responseSentinel: options.responseSentinel,
          data: { totalRows: 1, rows: [{ id: 'malformed-employee' }] },
        });
        return;
      }

      const start = options.repeatedPagination && page > 1 ? 0 : (page - 1) * pageSize;
      const totalRows =
        options.contradictoryPagination && page > 1
          ? ratingFixture.data.totalRows + 1
          : ratingFixture.data.totalRows;
      const rows = structuredClone(ratingFixture.data.rows.slice(start, start + pageSize)) as Array<{
        orders?: Array<{ id: string; items?: Array<{ id: string }> }>;
      }>;
      if (page > 1 && rows[0]?.orders?.[0]) {
        const firstFixtureRow = ratingFixture.data.rows[0] as {
          orders?: Array<{ id: string; items?: Array<{ id: string }> }>;
        };
        if (options.duplicateOrderAcrossPages && firstFixtureRow.orders?.[0]) {
          rows[0].orders[0].id = firstFixtureRow.orders[0].id;
        }
        if (
          options.duplicateItemAcrossPages &&
          rows[0].orders[0].items?.[0] &&
          firstFixtureRow.orders?.[0]?.items?.[0]
        ) {
          rows[0].orders[0].items[0].id = firstFixtureRow.orders[0].items[0].id;
        }
      }
      sendJson(response, 200, {
        ...ratingFixture,
        data: {
          ...ratingFixture.data,
          totalRows,
          rows,
        },
      });
      return;
    }

    sendJson(response, 404, { isSuccess: false });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Fake source did not bind a TCP port');
  }

  return {
    calls,
    url: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
