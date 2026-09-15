import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/db/prisma.service.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://bazols:bazols-local-only@127.0.0.1:5432/bazols';

const prisma = new PrismaService(databaseUrl);

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

describe('database schema invariants', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await clearDatabase();
    await prisma.$disconnect();
  });

  it('enforces restaurant-scoped uniqueness and relationships', async () => {
    const admin = await prisma.user.create({
      data: {
        username: 'schema-admin',
        passwordHash: 'synthetic-password-hash',
        role: 'ADMIN',
      },
    });
    const restaurantA = await prisma.restaurant.create({
      data: {
        sourceUnitId: 'unit-a',
        sourceRole: 'role-a',
        timezone: 'Europe/Moscow',
        displayName: 'Restaurant A',
      },
    });
    const restaurantB = await prisma.restaurant.create({
      data: {
        sourceUnitId: 'unit-b',
        sourceRole: 'role-b',
        timezone: 'Europe/Moscow',
        displayName: 'Restaurant B',
      },
    });

    await prisma.userRestaurant.create({
      data: { userId: admin.id, restaurantId: restaurantA.id },
    });
    await expect(
      prisma.userRestaurant.create({
        data: { userId: admin.id, restaurantId: restaurantA.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const employeeA = await prisma.employee.create({
      data: {
        restaurantId: restaurantA.id,
        sourceId: 'employee-1',
        displayName: 'Employee A',
      },
    });
    await expect(
      prisma.employee.create({
        data: {
          restaurantId: restaurantA.id,
          sourceId: 'employee-1',
          displayName: 'Duplicate Employee',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await prisma.employee.create({
      data: {
        restaurantId: restaurantB.id,
        sourceId: 'employee-1',
        displayName: 'Employee B',
      },
    });

    const syncB = await prisma.syncRun.create({
      data: {
        restaurantId: restaurantB.id,
        beginDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-01T00:00:00.000Z'),
        status: 'SUCCEEDED',
        requestedById: admin.id,
      },
    });

    await expect(
      prisma.order.create({
        data: {
          restaurantId: restaurantB.id,
          sourceId: 'order-1',
          employeeId: employeeA.id,
          occurredAt: new Date('2026-09-01T12:00:00.000Z'),
          price: '10.50',
          currency: 'RUB',
          lastSeenSyncRunId: syncB.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('allows only one active sync per restaurant', async () => {
    const admin = await prisma.user.create({
      data: {
        username: 'sync-admin',
        passwordHash: 'synthetic-password-hash',
        role: 'ADMIN',
      },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        sourceUnitId: 'sync-unit',
        sourceRole: 'sync-role',
        timezone: 'Europe/Moscow',
        displayName: 'Sync Restaurant',
      },
    });
    const period = {
      beginDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-02T00:00:00.000Z'),
      requestedById: admin.id,
      restaurantId: restaurant.id,
    };

    const queued = await prisma.syncRun.create({
      data: { ...period, status: 'QUEUED' },
    });
    await expect(
      prisma.syncRun.create({ data: { ...period, status: 'RUNNING' } }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await prisma.syncRun.update({
      where: { id: queued.id },
      data: { status: 'SUCCEEDED' },
    });
    await expect(
      prisma.syncRun.create({ data: { ...period, status: 'QUEUED' } }),
    ).resolves.toMatchObject({ status: 'QUEUED' });
  });
});
