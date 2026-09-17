import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/db/prisma.service.js';
import { RawSnapshotRepository } from '../../src/sync/raw-snapshot.repository.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://bazols:bazols-local-only@127.0.0.1:5432/bazols';
const prisma = new PrismaService(databaseUrl);
const key = Buffer.alloc(32, 9);

async function clearDatabase(): Promise<void> {
  await prisma.auditEvent.deleteMany();
  await prisma.productCostSnapshot.deleteMany();
  await prisma.materialCostSnapshot.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.material.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.rawSnapshot.deleteMany();
  await prisma.syncRun.deleteMany();
  await prisma.userRestaurant.deleteMany();
  await prisma.session.deleteMany();
  await prisma.restaurant.deleteMany();
  await prisma.user.deleteMany();
}

async function createRun(): Promise<{ restaurantId: string; syncRunId: string }> {
  const user = await prisma.user.create({
    data: {
      username: 'snapshot-admin',
      passwordHash: 'synthetic-hash',
      role: 'ADMIN',
    },
  });
  const restaurant = await prisma.restaurant.create({
    data: {
      sourceUnitId: 'snapshot-unit',
      sourceRole: 'SYNTHETIC_REPORT_VIEWER',
      timezone: 'UTC',
      displayName: 'Synthetic Snapshot Restaurant',
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
  return { restaurantId: restaurant.id, syncRunId: syncRun.id };
}

beforeAll(async () => prisma.$connect());
beforeEach(clearDatabase);
afterAll(async () => {
  await clearDatabase();
  await prisma.$disconnect();
});

describe('RawSnapshotRepository', () => {
  it('stores no plaintext response bytes and decrypts them exactly', async () => {
    const context = await createRun();
    const repository = new RawSnapshotRepository(prisma, key);
    const body = Buffer.from('{"customer":"database-pii-sentinel"}', 'utf8');

    const created = await repository.store({
      ...context,
      endpoint: 'employeeRating',
      page: 1,
      contentType: 'application/json',
      body,
    });

    const row = await prisma.rawSnapshot.findUniqueOrThrow({ where: { id: created.id } });
    const storedBytes = Buffer.concat([row.ciphertext, row.iv, row.authTag]).toString('utf8');
    expect(storedBytes).not.toContain('database-pii-sentinel');
    await expect(repository.readBody(created.id)).resolves.toEqual(body);
  });
});
