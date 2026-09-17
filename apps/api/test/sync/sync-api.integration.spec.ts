import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { CsrfGuard, OriginGuard, SessionGuard } from '../../src/auth/auth.guards.js';
import { RolesGuard } from '../../src/auth/roles.guard.js';
import { SessionService } from '../../src/auth/session.service.js';
import { APP_ORIGIN, SESSION_COOKIE } from '../../src/auth/tokens.js';
import { PrismaService } from '../../src/db/prisma.service.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { CLOCK } from '../../src/common/clock.js';
import { SyncController } from '../../src/sync/sync.controller.js';
import { SyncRunRepository } from '../../src/sync/sync-run.repository.js';
import { SyncService } from '../../src/sync/sync.service.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://bazols:bazols-local-only@127.0.0.1:5432/bazols';
const prisma = new PrismaService(databaseUrl);
const sessions = new SessionService(prisma, 'test-session-secret');
const origin = 'http://app.example.invalid';
const now = new Date('2026-09-15T12:00:00.000Z');

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

async function createApp() {
  const moduleRef = await Test.createTestingModule({
    controllers: [SyncController],
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: SessionService, useValue: sessions },
      { provide: APP_ORIGIN, useValue: origin },
      { provide: CLOCK, useValue: () => now },
      SyncRunRepository,
      SyncService,
      AuditService,
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
beforeEach(clearDatabase);
afterAll(async () => {
  await clearDatabase();
  await prisma.$disconnect();
});

describe('sync HTTP API', () => {
  it('lets an admin enqueue and inspect a run with an audit event', async () => {
    const admin = await auth('ADMIN', 'sync-admin');
    const restaurant = await prisma.restaurant.create({
      data: {
        sourceUnitId: 'sync-api-unit',
        sourceRole: 'SYNTHETIC_REPORT_VIEWER',
        timezone: 'UTC',
        displayName: 'Sync API Restaurant',
      },
    });
    const app = await createApp();

    const created = await request(app.getHttpServer())
      .post('/api/sync-runs')
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .set('X-Correlation-Id', 'sync-api-correlation')
      .send({ restaurantId: restaurant.id, beginDate: '2026-09-01', endDate: '2026-09-10' })
      .expect(202);
    expect(created.body).toMatchObject({ restaurantId: restaurant.id, status: 'QUEUED' });
    expect(created.body).not.toHaveProperty('safeErrorCode');

    const detail = await request(app.getHttpServer())
      .get(`/api/sync-runs/${created.body.id as string}`)
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(detail.body).toMatchObject({ id: created.body.id, status: 'QUEUED' });

    const history = await request(app.getHttpServer())
      .get('/api/sync-runs?page=1&pageSize=20')
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(history.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(history.body.items).toHaveLength(1);
    await expect(prisma.auditEvent.findFirstOrThrow()).resolves.toMatchObject({
      actorId: admin.user.id,
      restaurantId: restaurant.id,
      syncRunId: created.body.id,
      eventType: 'SYNC_ENQUEUED',
      correlationId: 'sync-api-correlation',
    });

    await app.close();
  });

  it('rejects managers, invalid dates, unknown restaurants and duplicate active runs', async () => {
    const admin = await auth('ADMIN', 'validation-admin');
    const manager = await auth('MANAGER', 'validation-manager');
    const restaurant = await prisma.restaurant.create({
      data: {
        sourceUnitId: 'validation-unit',
        sourceRole: 'SYNTHETIC_REPORT_VIEWER',
        timezone: 'UTC',
        displayName: 'Validation Restaurant',
      },
    });
    const app = await createApp();
    const validBody = {
      restaurantId: restaurant.id,
      beginDate: '2026-09-01',
      endDate: '2026-09-10',
    };

    await request(app.getHttpServer())
      .post('/api/sync-runs')
      .set('Origin', origin)
      .set('Cookie', manager.cookie)
      .set('X-CSRF-Token', manager.csrf)
      .send(validBody)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/sync-runs')
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send({ ...validBody, beginDate: '2026-09-11' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/sync-runs')
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send({ ...validBody, endDate: '2026-09-16' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/sync-runs')
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send({ ...validBody, restaurantId: '00000000-0000-4000-8000-000000000099' })
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/sync-runs')
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send(validBody)
      .expect(202);
    await request(app.getHttpServer())
      .post('/api/sync-runs')
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send(validBody)
      .expect(409);

    await app.close();
  });
});
