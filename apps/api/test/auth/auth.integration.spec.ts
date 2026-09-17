import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuditService } from '../../src/audit/audit.service.js';
import { AuthController } from '../../src/auth/auth.controller.js';
import { CsrfGuard, OriginGuard, SessionGuard } from '../../src/auth/auth.guards.js';
import { PasswordService } from '../../src/auth/password.service.js';
import { LoginRateLimiter } from '../../src/auth/rate-limiter.service.js';
import { SessionService } from '../../src/auth/session.service.js';
import { APP_ORIGIN, COOKIE_SECURE } from '../../src/auth/tokens.js';
import { PrismaService } from '../../src/db/prisma.service.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://bazols:bazols-local-only@127.0.0.1:5432/bazols';
const prisma = new PrismaService(databaseUrl);
const passwordService = new PasswordService();
const sessionService = new SessionService(prisma, 'test-session-secret');
const origin = 'http://app.example.invalid';

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
    controllers: [AuthController],
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: PasswordService, useValue: passwordService },
      { provide: SessionService, useValue: sessionService },
      LoginRateLimiter,
      SessionGuard,
      OriginGuard,
      CsrfGuard,
      { provide: APP_ORIGIN, useValue: origin },
      { provide: COOKIE_SECURE, useValue: false },
      AuditService,
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

describe('authentication HTTP API', () => {
  it('logs in with a secure session cookie and bootstraps the session', async () => {
    await prisma.user.create({
      data: {
        username: 'api-manager',
        passwordHash: await passwordService.hash('manager-password-long'),
        role: 'MANAGER',
      },
    });
    const app = await createApp();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ username: 'api-manager', password: 'manager-password-long' })
      .expect(200);
    const cookie = login.headers['set-cookie']?.[0] as string;
    expect(cookie).toContain('bazols_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
    expect(login.body).toMatchObject({
      user: { username: 'api-manager', role: 'MANAGER' },
    });
    expect(login.body.csrfToken).toHaveLength(64);

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(me.body).toEqual(login.body);
    const loginAudit = await prisma.auditEvent.findFirstOrThrow({ where: { eventType: 'AUTH_LOGIN' } });
    expect(loginAudit.actorId).toBe(login.body.user.id);
    expect(JSON.stringify(loginAudit)).not.toContain('manager-password-long');
    expect(JSON.stringify(loginAudit)).not.toContain(login.body.csrfToken as string);

    await app.close();
  });

  it('uses a generic invalid-login response and requires the configured Origin', async () => {
    await prisma.user.create({
      data: {
        username: 'inactive-user',
        passwordHash: await passwordService.hash('inactive-password-long'),
        role: 'MANAGER',
        active: false,
      },
    });
    const app = await createApp();

    const missingUser = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ username: 'missing-user', password: 'wrong-password-long' })
      .expect(401);
    expect(missingUser.body).toMatchObject({ message: 'Invalid credentials' });

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'missing-user', password: 'wrong-password-long' })
      .expect(403);
    const inactive = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ username: 'inactive-user', password: 'inactive-password-long' })
      .expect(401);
    expect(inactive.body).toMatchObject({ message: 'Invalid credentials' });

    for (let attempt = 3; attempt <= 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', origin)
        .send({ username: 'missing-user', password: 'wrong-password-long' })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ username: 'missing-user', password: 'wrong-password-long' })
      .expect(429);

    await app.close();
  });

  it('requires CSRF for logout and revokes the database session', async () => {
    await prisma.user.create({
      data: {
        username: 'logout-manager',
        passwordHash: await passwordService.hash('manager-password-long'),
        role: 'MANAGER',
      },
    });
    const app = await createApp();
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ username: 'logout-manager', password: 'manager-password-long' })
      .expect(200);
    const cookie = login.headers['set-cookie']?.[0] as string;

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', login.body.csrfToken as string)
      .expect(204);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    await expect(
      prisma.auditEvent.findMany({
        where: { eventType: { in: ['AUTH_LOGIN', 'AUTH_LOGOUT'] } },
        orderBy: { createdAt: 'asc' },
        select: { eventType: true },
      }),
    ).resolves.toEqual([{ eventType: 'AUTH_LOGIN' }, { eventType: 'AUTH_LOGOUT' }]);

    await app.close();
  });
});
