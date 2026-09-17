import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { SessionGuard } from '../../src/auth/auth.guards.js';
import { SessionService } from '../../src/auth/session.service.js';
import { SESSION_COOKIE } from '../../src/auth/tokens.js';
import { PrismaService } from '../../src/db/prisma.service.js';
import { EmployeeRankingService } from '../../src/reports/employee-ranking.service.js';
import { ProductRankingService } from '../../src/reports/product-ranking.service.js';
import { ReportsController } from '../../src/reports/reports.controller.js';
import { RestaurantAccessService } from '../../src/restaurants/restaurant-access.service.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://bazols:***@127.0.0.1:5432/bazols';
const prisma = new PrismaService(databaseUrl);
const sessions = new SessionService(prisma, 'test-session-secret');

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

async function auth(username: string) {
  const user = await prisma.user.create({
    data: { username, passwordHash: 'synthetic-hash', role: 'MANAGER' },
  });
  const session = await sessions.create(user.id);
  return { user, cookie: `${SESSION_COOKIE}=${session.token}` };
}

async function createApp() {
  const moduleRef = await Test.createTestingModule({
    controllers: [ReportsController],
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: SessionService, useValue: sessions },
      SessionGuard,
      RestaurantAccessService,
      EmployeeRankingService,
      ProductRankingService,
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

beforeAll(async () => prisma.$connect());
beforeEach(clearDatabase);
afterAll(async () => {
  await clearDatabase();
  await prisma.$disconnect();
});

describe('ranking reports HTTP API', () => {
  it('returns employee and product formulas for an assigned restaurant', async () => {
    const manager = await auth('report-manager');
    const restaurant = await prisma.restaurant.create({
      data: {
        displayName: 'Restaurant A',
        sourceUnitId: 'report-unit-a',
        sourceRole: 'REPORT_VIEWER',
        timezone: 'Europe/Moscow',
        users: { create: { userId: manager.user.id } },
      },
    });
    const employee = await prisma.employee.create({
      data: { restaurantId: restaurant.id, sourceId: 'employee-a', displayName: 'Анна' },
    });
    const product = await prisma.product.create({
      data: { restaurantId: restaurant.id, sourceId: 'product-a', displayName: 'Айран' },
    });
    const sync = await prisma.syncRun.create({
      data: {
        restaurantId: restaurant.id,
        requestedById: manager.user.id,
        beginDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-01T00:00:00.000Z'),
        status: 'SUCCEEDED',
      },
    });
    const order = await prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        sourceId: 'order-a',
        employeeId: employee.id,
        occurredAt: new Date('2026-09-01T20:59:59.000Z'),
        price: '125.50',
        currency: 'RUB',
        lastSeenSyncRunId: sync.id,
      },
    });
    await prisma.orderItem.create({
      data: {
        restaurantId: restaurant.id,
        sourceId: 'item-a',
        orderId: order.id,
        productId: product.id,
        priceWithDiscountForOrder: '125.50',
        currency: 'RUB',
        lastSeenSyncRunId: sync.id,
      },
    });
    const app = await createApp();

    const employees = await request(app.getHttpServer())
      .get(
        `/api/restaurants/${restaurant.id}/reports/employees?from=2026-09-01&to=2026-09-01&sort=revenue`,
      )
      .set('Cookie', manager.cookie)
      .expect(200);
    expect(employees.body).toEqual([
      expect.objectContaining({
        rank: 1,
        employeeId: 'employee-a',
        revenue: '125.50',
        ordersCount: 1,
        averageCheque: '125.50',
      }),
    ]);

    const products = await request(app.getHttpServer())
      .get(
        `/api/restaurants/${restaurant.id}/reports/products?from=2026-09-01&to=2026-09-01&sort=unitsSold`,
      )
      .set('Cookie', manager.cookie)
      .expect(200);
    expect(products.body).toEqual([
      expect.objectContaining({
        rank: 1,
        productId: 'product-a',
        unitsSold: 1,
        revenue: '125.50',
      }),
    ]);

    await app.close();
  });

  it('rejects another restaurant and invalid periods without leaking data', async () => {
    const manager = await auth('isolated-manager');
    const restaurant = await prisma.restaurant.create({
      data: {
        displayName: 'Restaurant B',
        sourceUnitId: 'report-unit-b',
        sourceRole: 'REPORT_VIEWER',
        timezone: 'UTC',
      },
    });
    const app = await createApp();

    await request(app.getHttpServer())
      .get(
        `/api/restaurants/${restaurant.id}/reports/employees?from=2026-09-01&to=2026-09-01&sort=revenue`,
      )
      .set('Cookie', manager.cookie)
      .expect(403);
    await request(app.getHttpServer())
      .get(
        `/api/restaurants/${restaurant.id}/reports/products?from=2026-09-02&to=2026-09-01&sort=revenue`,
      )
      .set('Cookie', manager.cookie)
      .expect(400);

    await app.close();
  });
});
