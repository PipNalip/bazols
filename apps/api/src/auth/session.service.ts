import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { User, UserRole } from '@prisma/client';

import type { PrismaService } from '../db/prisma.service.js';

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1_000;

export type AuthenticatedUser = Pick<User, 'id' | 'username' | 'role'>;

export type CreatedSession = {
  id: string;
  token: string;
  csrfToken: string;
  expiresAt: Date;
};

type SessionAudit = {
  actorId: string;
  eventType: 'AUTH_LOGIN' | 'AUTH_LOGOUT';
  correlationId: string;
};

export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secret: string,
    private readonly ttlMs = DEFAULT_SESSION_TTL_MS,
  ) {}

  async create(userId: string, now = new Date(), audit?: SessionAudit): Promise<CreatedSession> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    const session = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.session.create({
        data: {
          userId,
          tokenHash: this.#digest('session', token),
          expiresAt,
        },
        select: { id: true },
      });
      if (audit) {
        await transaction.auditEvent.create({ data: audit });
      }
      return created;
    });
    return {
      id: session.id,
      token,
      csrfToken: this.#digest('csrf', token),
      expiresAt,
    };
  }

  async authenticate(token: string, now = new Date()): Promise<AuthenticatedUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.#digest('session', token) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= now) {
      return null;
    }
    if (!session.user.active) {
      await this.prisma.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now },
      });
      return null;
    }
    return {
      id: session.user.id,
      username: session.user.username,
      role: session.user.role as UserRole,
    };
  }

  async revoke(token: string, now = new Date(), audit?: SessionAudit): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.session.updateMany({
        where: {
          tokenHash: this.#digest('session', token),
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      if (audit) {
        await transaction.auditEvent.create({ data: audit });
      }
    });
  }

  async revokeUser(userId: string, now = new Date()): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return result.count;
  }

  validateCsrf(token: string, csrfToken: string): boolean {
    const expected = Buffer.from(this.#digest('csrf', token), 'hex');
    const received = Buffer.from(csrfToken, 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  csrfFor(token: string): string {
    return this.#digest('csrf', token);
  }

  #digest(purpose: 'session' | 'csrf', token: string): string {
    return createHmac('sha256', this.secret)
      .update(`${purpose}:${token}`)
      .digest('hex');
  }
}
