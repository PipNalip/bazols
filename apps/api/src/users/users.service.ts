import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PasswordService } from '../auth/password.service.js';
import { ApplicationError } from '../common/application.error.js';
import { PrismaService } from '../db/prisma.service.js';

export type CreateManagerInput = {
  username: string;
  temporaryPassword: string;
  restaurantIds: string[];
};

function view(user: {
  id: string;
  username: string;
  role: string;
  active: boolean;
  restaurants: { restaurantId: string }[];
}) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    active: user.active,
    restaurantIds: user.restaurants.map(({ restaurantId }) => restaurantId).sort(),
  };
}

const managerInclude = {
  restaurants: { select: { restaurantId: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async list() {
    const users = await this.prisma.user.findMany({
      where: { role: 'MANAGER' },
      include: managerInclude,
      orderBy: [{ username: 'asc' }, { id: 'asc' }],
    });
    return users.map(view);
  }

  async create(input: CreateManagerInput, actorId: string, correlationId: string) {
    await this.#validateRestaurants(input.restaurantIds);
    const passwordHash = await this.passwords.hash(input.temporaryPassword);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            username: input.username.trim().toLowerCase(),
            passwordHash,
            role: 'MANAGER',
            restaurants: {
              create: input.restaurantIds.map((restaurantId) => ({ restaurantId })),
            },
          },
          include: managerInclude,
        });
        await tx.auditEvent.create({
          data: {
            actorId,
            eventType: 'MANAGER_CREATED',
            correlationId,
            safeMetadata: { targetUserId: created.id },
          },
        });
        return created;
      });
      return view(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApplicationError('RESOURCE_CONFLICT', 409);
      }
      throw error;
    }
  }

  async replaceAssignments(
    id: string,
    restaurantIds: string[],
    actorId: string,
    correlationId: string,
  ) {
    await this.#requireManager(id);
    await this.#validateRestaurants(restaurantIds);
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.userRestaurant.deleteMany({ where: { userId: id } });
      if (restaurantIds.length) {
        await tx.userRestaurant.createMany({
          data: restaurantIds.map((restaurantId) => ({ userId: id, restaurantId })),
        });
      }
      await tx.auditEvent.create({
        data: {
          actorId,
          eventType: 'MANAGER_ASSIGNMENTS_REPLACED',
          correlationId,
          safeMetadata: { targetUserId: id, assignmentCount: restaurantIds.length },
        },
      });
      return tx.user.findUniqueOrThrow({ where: { id }, include: managerInclude });
    });
    return view(user);
  }

  async resetPassword(
    id: string,
    temporaryPassword: string,
    actorId: string,
    correlationId: string,
  ) {
    await this.#requireManager(id);
    const passwordHash = await this.passwords.hash(temporaryPassword);
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { passwordHash },
        include: managerInclude,
      });
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditEvent.create({
        data: {
          actorId,
          eventType: 'MANAGER_PASSWORD_RESET',
          correlationId,
          safeMetadata: { targetUserId: id },
        },
      });
      return updated;
    });
    return view(user);
  }

  async block(id: string, actorId: string, correlationId: string) {
    await this.#requireManager(id);
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { active: false },
        include: managerInclude,
      });
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditEvent.create({
        data: {
          actorId,
          eventType: 'MANAGER_BLOCKED',
          correlationId,
          safeMetadata: { targetUserId: id },
        },
      });
      return updated;
    });
    return view(user);
  }

  async #requireManager(id: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id, role: 'MANAGER' }, select: { id: true } });
    if (!user) {
      throw new ApplicationError('RESOURCE_NOT_FOUND', 404);
    }
  }

  async #validateRestaurants(ids: string[]): Promise<void> {
    if (!ids.length) {
      return;
    }
    const count = await this.prisma.restaurant.count({ where: { id: { in: ids }, active: true } });
    if (count !== ids.length) {
      throw new ApplicationError('INPUT_INVALID', 400);
    }
  }
}
