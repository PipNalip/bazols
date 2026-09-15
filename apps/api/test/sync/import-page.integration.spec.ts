import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/db/prisma.service.js';
import { SourceError } from '../../src/source/source.errors.js';
import { ImportPageService } from '../../src/sync/import-page.service.js';
import { RawSnapshotRepository } from '../../src/sync/raw-snapshot.repository.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://bazols:bazols-local-only@127.0.0.1:5432/bazols';
const prisma = new PrismaService(databaseUrl);
const key = Buffer.alloc(32, 11);

type Context = {
  restaurantId: string;
  requestedById: string;
  syncRunId: string;
};

function fixture(name = 'employees-rating.success.json'): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'test/fixtures/source', name), 'utf8'),
  ) as Record<string, unknown>;
}

function body(payload: unknown): Buffer {
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

async function clearDatabase(): Promise<void> {
  await prisma.auditEvent.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.rawSnapshot.deleteMany();
  await prisma.syncRun.deleteMany();
  await prisma.userRestaurant.deleteMany();
  await prisma.session.deleteMany();
  await prisma.restaurant.deleteMany();
  await prisma.user.deleteMany();
}

async function createContext(): Promise<Context> {
  const user = await prisma.user.create({
    data: {
      username: 'import-admin',
      passwordHash: 'synthetic-hash',
      role: 'ADMIN',
    },
  });
  const restaurant = await prisma.restaurant.create({
    data: {
      sourceUnitId: 'import-unit',
      sourceRole: 'SYNTHETIC_REPORT_VIEWER',
      timezone: 'UTC',
      displayName: 'Synthetic Import Restaurant',
    },
  });
  const syncRun = await prisma.syncRun.create({
    data: {
      restaurantId: restaurant.id,
      requestedById: user.id,
      beginDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
      status: 'RUNNING',
    },
  });
  return {
    restaurantId: restaurant.id,
    requestedById: user.id,
    syncRunId: syncRun.id,
  };
}

async function nextRun(context: Context): Promise<Context> {
  await prisma.syncRun.update({
    where: { id: context.syncRunId },
    data: { status: 'SUCCEEDED', finishedAt: new Date() },
  });
  const run = await prisma.syncRun.create({
    data: {
      restaurantId: context.restaurantId,
      requestedById: context.requestedById,
      beginDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
      status: 'RUNNING',
    },
  });
  return { ...context, syncRunId: run.id };
}

function service(): ImportPageService {
  return new ImportPageService(prisma, new RawSnapshotRepository(prisma, key));
}

async function importPayload(
  importer: ImportPageService,
  context: Context,
  payload: unknown,
): Promise<void> {
  await importer.importPage({
    ...context,
    endpoint: 'employeeRating',
    page: 1,
    contentType: 'application/json',
    body: body(payload),
  });
}

beforeAll(async () => prisma.$connect());
beforeEach(clearDatabase);
afterAll(async () => {
  await clearDatabase();
  await prisma.$disconnect();
});

describe('ImportPageService', () => {
  it('creates expected counts and a second import does not inflate them', async () => {
    const context = await createContext();
    const importer = service();

    await importPayload(importer, context, fixture());
    await importPayload(importer, context, fixture());

    await expect(prisma.employee.count()).resolves.toBe(2);
    await expect(prisma.product.count()).resolves.toBe(2);
    await expect(prisma.order.count()).resolves.toBe(3);
    await expect(prisma.orderItem.count()).resolves.toBe(4);
    await expect(prisma.rawSnapshot.count()).resolves.toBe(2);
    await expect(prisma.syncRun.findUniqueOrThrow({ where: { id: context.syncRunId } })).resolves.toMatchObject({
      employeesCount: 2,
      productsCount: 2,
      ordersCount: 3,
      orderItemsCount: 4,
    });
  });

  it('updates mutable product names and discounted prices without changing identity', async () => {
    const context = await createContext();
    const importer = service();
    await importPayload(importer, context, fixture());
    const originalProduct = await prisma.product.findUniqueOrThrow({
      where: {
        restaurantId_sourceId: {
          restaurantId: context.restaurantId,
          sourceId: '50000000-0000-4000-8000-000000000001',
        },
      },
    });
    const payload = fixture();
    const rows = (payload.data as {
      rows: Array<{
        orders: Array<{
          price: { value: string };
          items: Array<{
            id: string;
            product: { id: string; name: string };
            priceWithDiscountForOrder: { value: string };
          }>;
        }>;
      }>;
    }).rows;
    rows[0]!.orders[0]!.price.value = '105.00';
    rows[0]!.orders[0]!.items[0]!.priceWithDiscountForOrder.value = '55.00';
    rows[0]!.orders[0]!.items[0]!.product.name = 'Synthetic Green Tea';
    rows[0]!.orders[1]!.items[0]!.product.name = 'Synthetic Green Tea';

    await importPayload(importer, context, payload);

    const updatedProduct = await prisma.product.findUniqueOrThrow({
      where: { id: originalProduct.id },
    });
    const updatedItem = await prisma.orderItem.findFirstOrThrow({
      where: {
        restaurantId: context.restaurantId,
        sourceId: '40000000-0000-4000-8000-000000000001',
      },
    });
    expect(updatedProduct).toMatchObject({
      id: originalProduct.id,
      displayName: 'Synthetic Green Tea',
    });
    expect(updatedItem.priceWithDiscountForOrder.toFixed(2)).toBe('55.00');
  });

  it('retains the encrypted snapshot but rolls back normalized changes on duplicate IDs', async () => {
    const context = await createContext();
    const importer = service();
    const payload = fixture();
    const items = (payload.data as {
      rows: Array<{ orders: Array<{ items: Array<{ id: string }> }> }>;
    }).rows[0]!.orders[0]!.items;
    items[1]!.id = items[0]!.id;

    await expect(importPayload(importer, context, payload)).rejects.toMatchObject({
      code: 'SOURCE_DUPLICATE_ID',
    } satisfies Partial<SourceError>);

    await expect(prisma.rawSnapshot.count()).resolves.toBe(1);
    await expect(prisma.employee.count()).resolves.toBe(0);
    await expect(prisma.order.count()).resolves.toBe(0);
    await expect(prisma.orderItem.count()).resolves.toBe(0);
  });

  it('marks records absent from a complete non-empty re-import as non-current', async () => {
    const firstRun = await createContext();
    const importer = service();
    await importPayload(importer, firstRun, fixture());
    await importer.finalizeSync({
      ...firstRun,
      beginDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
    });

    const secondRun = await nextRun(firstRun);
    const reduced = fixture();
    const data = reduced.data as { totalRows: number; rows: Array<{ orders: unknown[] }> };
    data.rows = data.rows.slice(0, 1);
    data.rows[0]!.orders = data.rows[0]!.orders.slice(0, 1);
    data.totalRows = 1;
    await importPayload(importer, secondRun, reduced);
    await importer.finalizeSync({
      ...secondRun,
      beginDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
    });

    await expect(prisma.order.count({ where: { isCurrent: true } })).resolves.toBe(1);
    await expect(prisma.orderItem.count({ where: { isCurrent: true } })).resolves.toBe(2);
    await expect(prisma.order.count({ where: { isCurrent: false } })).resolves.toBe(2);
  });

  it('rejects an unexpectedly empty re-import without deactivating current records', async () => {
    const firstRun = await createContext();
    const importer = service();
    await importPayload(importer, firstRun, fixture());
    await importer.finalizeSync({
      ...firstRun,
      beginDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
    });

    const secondRun = await nextRun(firstRun);
    await importPayload(importer, secondRun, fixture('employees-rating.empty.json'));

    await expect(
      importer.finalizeSync({
        ...secondRun,
        beginDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_EMPTY_UNEXPECTED' });
    await expect(prisma.order.count({ where: { isCurrent: true } })).resolves.toBe(3);
    await expect(prisma.rawSnapshot.count()).resolves.toBe(2);
  });
});
