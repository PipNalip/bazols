import { createHash } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PasswordService } from '../../src/auth/password.service.js';
import { SessionService } from '../../src/auth/session.service.js';
import { PrismaService } from '../../src/db/prisma.service.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://bazols:bazols-local-only@127.0.0.1:5432/bazols';
const prisma = new PrismaService(databaseUrl);

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

beforeAll(async () => prisma.$connect());
beforeEach(clearDatabase);
afterAll(async () => {
  await clearDatabase();
  await prisma.$disconnect();
});

describe('PasswordService', () => {
  it('hashes and verifies passwords with Argon2id', async () => {
    const service = new PasswordService();
    const hash = await service.hash('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(service.verify(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(service.verify(hash, 'wrong password')).resolves.toBe(false);
  });
});

describe('SessionService', () => {
  it('stores only a token hash and validates the opaque token plus CSRF value', async () => {
    const user = await prisma.user.create({
      data: {
        username: 'session-manager',
        passwordHash: 'synthetic-hash',
        role: 'MANAGER',
      },
    });
    const service = new SessionService(prisma, 'test-session-secret');

    const created = await service.create(user.id, new Date('2026-09-15T12:00:00.000Z'));
    const stored = await prisma.session.findUniqueOrThrow({ where: { id: created.id } });

    expect(created.token).toHaveLength(64);
    expect(stored.tokenHash).not.toContain(created.token);
    expect(stored.tokenHash).toHaveLength(64);
    expect(created.csrfToken).toHaveLength(64);
    await expect(
      service.authenticate(created.token, new Date('2026-09-15T12:01:00.000Z')),
    ).resolves.toMatchObject({ id: user.id, role: 'MANAGER' });
    expect(service.validateCsrf(created.token, created.csrfToken)).toBe(true);
    expect(service.validateCsrf(created.token, createHash('sha256').update('wrong').digest('hex'))).toBe(false);
  });

  it('rejects expired, revoked and inactive-user sessions', async () => {
    const user = await prisma.user.create({
      data: {
        username: 'inactive-manager',
        passwordHash: 'synthetic-hash',
        role: 'MANAGER',
      },
    });
    const service = new SessionService(prisma, 'test-session-secret', 60_000);
    const expired = await service.create(user.id, new Date('2026-09-15T12:00:00.000Z'));
    await expect(
      service.authenticate(expired.token, new Date('2026-09-15T12:01:00.001Z')),
    ).resolves.toBeNull();

    const revoked = await service.create(user.id, new Date('2026-09-15T13:00:00.000Z'));
    await service.revoke(revoked.token, new Date('2026-09-15T13:00:01.000Z'));
    await expect(
      service.authenticate(revoked.token, new Date('2026-09-15T13:00:02.000Z')),
    ).resolves.toBeNull();

    const inactive = await service.create(user.id, new Date('2026-09-15T14:00:00.000Z'));
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    await expect(
      service.authenticate(inactive.token, new Date('2026-09-15T14:00:01.000Z')),
    ).resolves.toBeNull();
    await expect(prisma.session.findUniqueOrThrow({ where: { id: inactive.id } })).resolves.toMatchObject({
      revokedAt: new Date('2026-09-15T14:00:01.000Z'),
    });
  });
});
