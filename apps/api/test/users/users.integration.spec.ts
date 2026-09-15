import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuditService } from '../../src/audit/audit.service.js';
import { CsrfGuard, OriginGuard, SessionGuard } from '../../src/auth/auth.guards.js';
import { PasswordService } from '../../src/auth/password.service.js';
import { RolesGuard } from '../../src/auth/roles.guard.js';
import { SessionService } from '../../src/auth/session.service.js';
import { APP_ORIGIN, SESSION_COOKIE } from '../../src/auth/tokens.js';
import { PrismaService } from '../../src/db/prisma.service.js';
import { UsersController } from '../../src/users/users.controller.js';
import { UsersService } from '../../src/users/users.service.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://bazols:bazols-local-only@127.0.0.1:5432/bazols';
const prisma = new PrismaService(databaseUrl);
const sessions = new SessionService(prisma, 'test-session-secret');
const passwords = new PasswordService();
const origin = 'http://app.example.invalid';

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
    controllers: [UsersController],
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: SessionService, useValue: sessions },
      { provide: PasswordService, useValue: passwords },
      { provide: APP_ORIGIN, useValue: origin },
      AuditService,
      UsersService,
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

async function restaurant(sourceUnitId: string) {
  return prisma.restaurant.create({
    data: {
      displayName: sourceUnitId,
      sourceUnitId,
      sourceRole: 'REPORT_VIEWER',
      timezone: 'UTC',
    },
  });
}

beforeAll(async () => prisma.$connect());
beforeEach(clearDatabase);
afterAll(async () => {
  await clearDatabase();
  await prisma.$disconnect();
});

describe('manager administration HTTP API', () => {
  it('creates and lists a manager without exposing password hashes', async () => {
    const admin = await auth('ADMIN', 'users-admin');
    const restaurantA = await restaurant('users-unit-a');
    const app = await createApp();

    const created = await request(app.getHttpServer())
      .post('/api/users')
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .set('X-Correlation-Id', 'manager-create-correlation')
      .send({
        username: '  New.Manager  ',
        temporaryPassword: 'temporary-password-long',
        restaurantIds: [restaurantA.id],
      })
      .expect(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      username: 'new.manager',
      role: 'MANAGER',
      active: true,
      restaurantIds: [restaurantA.id],
    });
    expect(JSON.stringify(created.body)).not.toContain('password');
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    await expect(passwords.verify(stored.passwordHash, 'temporary-password-long')).resolves.toBe(true);

    const list = await request(app.getHttpServer())
      .get('/api/users')
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(list.body).toEqual([created.body]);
    expect(JSON.stringify(list.body)).not.toContain('passwordHash');
    await expect(
      prisma.auditEvent.findFirstOrThrow({ where: { eventType: 'MANAGER_CREATED' } }),
    ).resolves.toMatchObject({ actorId: admin.user.id, correlationId: 'manager-create-correlation' });

    await app.close();
  });

  it('enforces unique usernames, valid assignments and admin-only mutations', async () => {
    const admin = await auth('ADMIN', 'validation-users-admin');
    const manager = await auth('MANAGER', 'validation-users-manager');
    const app = await createApp();
    const body = {
      username: 'duplicate-manager',
      temporaryPassword: 'temporary-password-long',
      restaurantIds: [],
    };

    await request(app.getHttpServer())
      .post('/api/users')
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send({ ...body, restaurantIds: ['00000000-0000-4000-8000-000000000099'] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Origin', origin)
      .set('Cookie', manager.cookie)
      .set('X-CSRF-Token', manager.csrf)
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send(body)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send({ ...body, username: 'DUPLICATE-MANAGER' })
      .expect(409);

    await app.close();
  });

  it('replaces assignments atomically and revokes sessions on reset and block', async () => {
    const admin = await auth('ADMIN', 'lifecycle-admin');
    const [restaurantA, restaurantB] = await Promise.all([
      restaurant('lifecycle-unit-a'),
      restaurant('lifecycle-unit-b'),
    ]);
    const target = await prisma.user.create({
      data: {
        username: 'lifecycle-manager',
        passwordHash: await passwords.hash('original-password-long'),
        role: 'MANAGER',
        restaurants: { create: { restaurantId: restaurantA.id } },
      },
    });
    const targetSession = await sessions.create(target.id);
    const app = await createApp();

    const assigned = await request(app.getHttpServer())
      .put(`/api/users/${target.id}/restaurants`)
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send({ restaurantIds: [restaurantB.id] })
      .expect(200);
    expect(assigned.body.restaurantIds).toEqual([restaurantB.id]);
    await expect(prisma.userRestaurant.findMany({ where: { userId: target.id } })).resolves.toEqual([
      expect.objectContaining({ restaurantId: restaurantB.id }),
    ]);

    await request(app.getHttpServer())
      .post(`/api/users/${target.id}/reset-password`)
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send({ temporaryPassword: 'replacement-password-long' })
      .expect(200);
    await expect(sessions.authenticate(targetSession.token)).resolves.toBeNull();
    const afterReset = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    await expect(passwords.verify(afterReset.passwordHash, 'replacement-password-long')).resolves.toBe(true);

    const blockSession = await sessions.create(target.id);
    const blocked = await request(app.getHttpServer())
      .post(`/api/users/${target.id}/block`)
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send({})
      .expect(200);
    expect(blocked.body).toMatchObject({ id: target.id, active: false });
    await expect(sessions.authenticate(blockSession.token)).resolves.toBeNull();

    const events = await prisma.auditEvent.findMany({
      where: { actorId: admin.user.id },
      orderBy: { createdAt: 'asc' },
      select: { eventType: true },
    });
    expect(events.map((event) => event.eventType)).toEqual([
      'MANAGER_ASSIGNMENTS_REPLACED',
      'MANAGER_PASSWORD_RESET',
      'MANAGER_BLOCKED',
    ]);

    await app.close();
  });
});
