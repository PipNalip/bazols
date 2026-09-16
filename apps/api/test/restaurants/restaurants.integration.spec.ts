import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuditService } from '../../src/audit/audit.service.js';
import { CsrfGuard, OriginGuard, SessionGuard } from '../../src/auth/auth.guards.js';
import { RolesGuard } from '../../src/auth/roles.guard.js';
import { SessionService } from '../../src/auth/session.service.js';
import { APP_ORIGIN, SESSION_COOKIE } from '../../src/auth/tokens.js';
import { PrismaService } from '../../src/db/prisma.service.js';
import { RestaurantAccessService } from '../../src/restaurants/restaurant-access.service.js';
import { RestaurantsController } from '../../src/restaurants/restaurants.controller.js';
import { RestaurantsService } from '../../src/restaurants/restaurants.service.js';
import { SourceDiscoveryController } from '../../src/restaurants/source-discovery.controller.js';
import { SourceConnectorFactory } from '../../src/source/source-connector.factory.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://bazols:bazols-local-only@127.0.0.1:5432/bazols';
const prisma = new PrismaService(databaseUrl);
const sessions = new SessionService(prisma, 'test-session-secret');
const origin = 'http://app.example.invalid';
const discovered = [
  { id: 'source-unit-a', roles: ['REPORT_VIEWER'] },
  { id: 'source-unit-b', roles: ['REPORT_VIEWER', 'OTHER_ROLE'] },
];
const source = { discover: vi.fn(async () => discovered) };

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

async function createApp() {
  const moduleRef = await Test.createTestingModule({
    controllers: [RestaurantsController, SourceDiscoveryController],
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: SessionService, useValue: sessions },
      { provide: APP_ORIGIN, useValue: origin },
      { provide: SourceConnectorFactory, useValue: { create: () => source } },
      AuditService,
      RestaurantsService,
      RestaurantAccessService,
      SessionGuard,
      OriginGuard,
      CsrfGuard,
      RolesGuard,
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

async function auth(role: 'ADMIN' | 'MANAGER', username: string) {
  const user = await prisma.user.create({
    data: { username, passwordHash: 'synthetic-hash', role },
  });
  const session = await sessions.create(user.id);
  return {
    user,
    cookie: `${SESSION_COOKIE}=${session.token}`,
    csrf: session.csrfToken,
  };
}

beforeAll(async () => prisma.$connect());
beforeEach(async () => {
  await clearDatabase();
  source.discover.mockClear();
});
afterAll(async () => {
  await clearDatabase();
  await prisma.$disconnect();
});

describe('restaurant administration HTTP API', () => {
  it('discovers safe source metadata and creates an audited mapping', async () => {
    const admin = await auth('ADMIN', 'restaurant-admin');
    const app = await createApp();

    await request(app.getHttpServer())
      .get('/api/source-discovery')
      .set('Cookie', admin.cookie)
      .set('X-Correlation-Id', 'discovery-correlation')
      .expect(200, { units: discovered });
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: { eventType: 'SOURCE_DISCOVERY_COMPLETED' },
      }),
    ).resolves.toMatchObject({
      actorId: admin.user.id,
      correlationId: 'discovery-correlation',
      safeMetadata: { unitCount: 2 },
    });

    const created = await request(app.getHttpServer())
      .post('/api/restaurants')
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .set('X-Correlation-Id', 'restaurant-create-correlation')
      .send({
        displayName: 'Restaurant A',
        sourceUnitId: 'source-unit-a',
        sourceRole: 'REPORT_VIEWER',
        timezone: 'Europe/Moscow',
      })
      .expect(201);
    expect(created.body).toMatchObject({
      displayName: 'Restaurant A',
      sourceUnitId: 'source-unit-a',
      sourceRole: 'REPORT_VIEWER',
      timezone: 'Europe/Moscow',
      active: true,
    });
    expect(created.body).not.toHaveProperty('sourceCredentials');
    await expect(
      prisma.auditEvent.findFirstOrThrow({ where: { eventType: 'RESTAURANT_CREATED' } }),
    ).resolves.toMatchObject({
      actorId: admin.user.id,
      restaurantId: created.body.id,
      correlationId: 'restaurant-create-correlation',
    });

    await app.close();
  });

  it('rejects unavailable mappings, invalid timezones and manager mutations', async () => {
    const admin = await auth('ADMIN', 'mapping-admin');
    const manager = await auth('MANAGER', 'mapping-manager');
    const app = await createApp();
    const valid = {
      displayName: 'Restaurant A',
      sourceUnitId: 'source-unit-a',
      sourceRole: 'REPORT_VIEWER',
      timezone: 'UTC',
    };

    await request(app.getHttpServer())
      .post('/api/restaurants')
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send({ ...valid, sourceRole: 'UNAVAILABLE' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/restaurants')
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send({ ...valid, timezone: 'Not/A-Timezone' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/restaurants')
      .set('Origin', origin)
      .set('Cookie', manager.cookie)
      .set('X-CSRF-Token', manager.csrf)
      .send(valid)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/source-discovery')
      .set('Cookie', manager.cookie)
      .expect(403);

    await app.close();
  });

  it('lists only assigned restaurants for managers and all restaurants for admins', async () => {
    const admin = await auth('ADMIN', 'list-admin');
    const manager = await auth('MANAGER', 'list-manager');
    const [restaurantA, restaurantB] = await Promise.all([
      prisma.restaurant.create({
        data: {
          displayName: 'Restaurant A', sourceUnitId: 'source-unit-a',
          sourceRole: 'REPORT_VIEWER', timezone: 'UTC',
        },
      }),
      prisma.restaurant.create({
        data: {
          displayName: 'Restaurant B', sourceUnitId: 'source-unit-b',
          sourceRole: 'REPORT_VIEWER', timezone: 'UTC',
        },
      }),
    ]);
    await prisma.userRestaurant.create({
      data: { userId: manager.user.id, restaurantId: restaurantA.id },
    });
    await prisma.syncRun.createMany({
      data: [
        {
          restaurantId: restaurantA.id,
          requestedById: admin.user.id,
          beginDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2026-09-01T00:00:00.000Z'),
          status: 'SUCCEEDED',
          createdAt: new Date('2026-09-15T09:00:00.000Z'),
          finishedAt: new Date('2026-09-15T10:00:00.000Z'),
        },
        {
          restaurantId: restaurantA.id,
          requestedById: admin.user.id,
          beginDate: new Date('2026-09-02T00:00:00.000Z'),
          endDate: new Date('2026-09-02T00:00:00.000Z'),
          status: 'FAILED',
          safeErrorCode: 'SOURCE_UNAVAILABLE',
          createdAt: new Date('2026-09-16T09:00:00.000Z'),
          finishedAt: new Date('2026-09-16T10:00:00.000Z'),
        },
      ],
    });
    const app = await createApp();

    const managerList = await request(app.getHttpServer())
      .get('/api/restaurants')
      .set('Cookie', manager.cookie)
      .expect(200);
    expect(managerList.body).toEqual([
      expect.objectContaining({
        id: restaurantA.id,
        lastSuccessfulSyncAt: '2026-09-15T10:00:00.000Z',
        latestSync: { status: 'FAILED', safeErrorCode: 'SOURCE_UNAVAILABLE' },
      }),
    ]);

    const adminList = await request(app.getHttpServer())
      .get('/api/restaurants')
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(adminList.body.map((item: { id: string }) => item.id).sort()).toEqual(
      [restaurantA.id, restaurantB.id].sort(),
    );

    const access = new RestaurantAccessService(prisma);
    await expect(access.assertAccess(manager.user, restaurantA.id)).resolves.toBeUndefined();
    await expect(access.assertAccess(manager.user, restaurantB.id)).rejects.toMatchObject({ status: 403 });
    await expect(access.assertAccess(admin.user, restaurantB.id)).resolves.toBeUndefined();

    await app.close();
  });

  it('does not remap a restaurant after a sync run exists', async () => {
    const admin = await auth('ADMIN', 'remap-admin');
    const restaurant = await prisma.restaurant.create({
      data: {
        displayName: 'Restaurant A',
        sourceUnitId: 'source-unit-a',
        sourceRole: 'REPORT_VIEWER',
        timezone: 'UTC',
      },
    });
    await prisma.syncRun.create({
      data: {
        restaurantId: restaurant.id,
        requestedById: admin.user.id,
        beginDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-02T00:00:00.000Z'),
        status: 'QUEUED',
      },
    });
    const app = await createApp();

    await request(app.getHttpServer())
      .patch(`/api/restaurants/${restaurant.id}`)
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send({
        displayName: 'Restaurant A renamed',
        sourceUnitId: 'source-unit-b',
        sourceRole: 'REPORT_VIEWER',
        timezone: 'Europe/Moscow',
      })
      .expect(409);
    await expect(
      prisma.restaurant.findUniqueOrThrow({ where: { id: restaurant.id } }),
    ).resolves.toMatchObject({ sourceUnitId: 'source-unit-a', timezone: 'UTC' });

    await app.close();
  });
});
