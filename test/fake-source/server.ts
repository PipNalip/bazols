import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type FakeSourceOptions = {
  authFailure?: boolean;
  contradictoryPagination?: boolean;
  duplicateItemAcrossPages?: boolean;
  duplicateOrderAcrossPages?: boolean;
  empty?: boolean;
  emptyCosts?: boolean;
  host?: string;
  malformedCosts?: boolean;
  malformedRating?: boolean;
  multiPageCosts?: boolean;
  port?: number;
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
  readFileSync(join(process.cwd(), 'test/fixtures/source/employees-rating.success.json'), 'utf8'),
) as RatingFixture;
const permissionsFixture = readFileSync(
  join(process.cwd(), 'test/fixtures/source/permissions.success.json'),
  'utf8',
);
const productCostsFixture = JSON.parse(
  readFileSync(join(process.cwd(), 'test/fixtures/source/product-costs.success.json'), 'utf8'),
) as { totalRows: number; values: Array<Record<string, unknown>> };
const materialCostsFixture = JSON.parse(
  readFileSync(join(process.cwd(), 'test/fixtures/source/material-costs.success.json'), 'utf8'),
) as {
  isSuccess: true;
  isFailed: false;
  data: { totalRows: number; values: Array<Record<string, unknown>> };
  errors: unknown[];
};

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

function hasSession(request: IncomingMessage): boolean {
  return request.headers.cookie?.includes('source-session=synthetic') ?? false;
}

export async function startFakeSource(options: FakeSourceOptions = {}): Promise<FakeSource> {
  const calls: string[] = [];
  let malformedRating = options.malformedRating ?? false;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (request.method === 'GET' && url.pathname === '/__health') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/__control') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const control = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        malformedRating?: boolean;
      };
      malformedRating = control.malformedRating ?? malformedRating;
      sendJson(response, 200, { malformedRating });
      return;
    }
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
      response.setHeader('set-cookie', 'source-session=synthetic; Path=/; HttpOnly; SameSite=Strict');
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
      sendJson(response, allowed ? 200 : 403, { isSuccess: allowed, data: allowed ? {} : null });
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
      if (malformedRating) {
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
        data: { ...ratingFixture.data, totalRows, rows },
      });
      return;
    }
    if (url.pathname === '/InventoryControl/AutoCostProduct/GetAutoCostProducts') {
      const page = Number(url.searchParams.get('page'));
      const count = Number(url.searchParams.get('count'));
      calls.push(`productAutoCosts:${page}:${url.searchParams.get('date')}`);
      if (options.malformedCosts) {
        sendJson(response, 200, { totalRows: 1, values: [{ productId: 'malformed' }] });
        return;
      }
      const productValues = structuredClone(productCostsFixture.values) as Array<{
        productId: string;
        productName: string;
        autoCostProductByTradeArea: Array<{
          autoCostProductByUnit: Array<{ productId: string; unitId: string }>;
        }>;
      }>;
      if (options.multiPageCosts && productValues[0]) {
        const second = structuredClone(productValues[0]);
        second.productId = '60000000-0000-4000-8000-000000000002';
        second.productName = 'Synthetic Product Two';
        for (const tradeArea of second.autoCostProductByTradeArea) {
          for (const unit of tradeArea.autoCostProductByUnit) unit.productId = second.productId;
        }
        productValues.push(second);
      }
      const values = options.emptyCosts ? [] : productValues.slice(page * count, (page + 1) * count);
      for (const value of values as Array<{
        autoCostProductByTradeArea: Array<{
          autoCostProductByUnit: Array<{ unitId: string }>;
        }>;
      }>) {
        for (const tradeArea of value.autoCostProductByTradeArea) {
          for (const unit of tradeArea.autoCostProductByUnit) {
            unit.unitId = '10000000-0000-4000-8000-000000000001';
          }
        }
      }
      sendJson(response, 200, {
        ...productCostsFixture,
        totalRows: options.emptyCosts ? 0 : productValues.length,
        values,
      });
      return;
    }
    if (url.pathname === '/InventoryControl/AutoCostMaterials/GetAutoCostMaterials') {
      const page = Number(url.searchParams.get('page'));
      const count = Number(url.searchParams.get('count'));
      calls.push(
        `materialAutoCosts:${page}:${url.searchParams.get('startDate')}:${url.searchParams.get('endDate')}`,
      );
      if (options.malformedCosts) {
        sendJson(response, 200, { isSuccess: true, isFailed: false, data: { totalRows: 1 } });
        return;
      }
      const start = (page - 1) * count;
      const materialValues = structuredClone(materialCostsFixture.data.values) as Array<{
        materialId: string;
        materialName: string;
        autoCostMaterialViewsByDates: Array<{
          autoCostMaterialViews: Array<{ materialId: string; materialName: string; unitId: string }>;
        }>;
      }>;
      if (options.multiPageCosts && materialValues[0]) {
        const second = structuredClone(materialValues[0]);
        second.materialId = '71000000-0000-4000-8000-000000000002';
        second.materialName = 'Synthetic Material Two';
        for (const byDate of second.autoCostMaterialViewsByDates) {
          for (const view of byDate.autoCostMaterialViews) {
            view.materialId = second.materialId;
            view.materialName = second.materialName;
          }
        }
        materialValues.push(second);
      }
      const values = options.emptyCosts ? [] : materialValues.slice(start, start + count);
      for (const value of values as Array<{
        autoCostMaterialViewsByDates: Array<{
          autoCostMaterialViews: Array<{ unitId: string }>;
        }>;
      }>) {
        for (const byDate of value.autoCostMaterialViewsByDates) {
          for (const view of byDate.autoCostMaterialViews) {
            view.unitId = '10000000-0000-4000-8000-000000000001';
          }
        }
      }
      sendJson(response, 200, {
        ...materialCostsFixture,
        data: {
          ...materialCostsFixture.data,
          totalRows: options.emptyCosts ? 0 : materialValues.length,
          values,
        },
      });
      return;
    }
    sendJson(response, 404, { isSuccess: false });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve);
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
