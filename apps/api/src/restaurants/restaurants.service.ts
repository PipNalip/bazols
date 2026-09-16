import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { AuthenticatedUser } from '../auth/session.service.js';
import { ApplicationError } from '../common/application.error.js';
import { PrismaService } from '../db/prisma.service.js';
import { SourceConnectorFactory } from '../source/source-connector.factory.js';

export type RestaurantMappingInput = {
  displayName: string;
  sourceUnitId: string;
  sourceRole: string;
  timezone: string;
};

function view(restaurant: {
  id: string;
  displayName: string;
  sourceUnitId: string;
  sourceRole: string;
  timezone: string;
  active: boolean;
  syncRuns?: Array<{
    status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
    safeErrorCode: string | null;
    finishedAt: Date | null;
  }>;
}) {
  const { syncRuns = [], ...details } = restaurant;
  const latest = syncRuns[0];
  const lastSuccessful = syncRuns.find((run) => run.status === 'SUCCEEDED');
  return {
    ...details,
    lastSuccessfulSyncAt: lastSuccessful?.finishedAt?.toISOString() ?? null,
    latestSync: latest
      ? { status: latest.status, safeErrorCode: latest.safeErrorCode }
      : null,
  };
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceFactory: SourceConnectorFactory,
  ) {}

  async list(user: AuthenticatedUser) {
    const restaurants = await this.prisma.restaurant.findMany({
      where:
        user.role === 'ADMIN'
          ? { active: true }
          : { active: true, users: { some: { userId: user.id } } },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      include: {
        syncRuns: {
          orderBy: { createdAt: 'desc' },
          select: { status: true, safeErrorCode: true, finishedAt: true },
        },
      },
    });
    return restaurants.map(view);
  }

  async create(input: RestaurantMappingInput, actorId: string, correlationId: string) {
    await this.#validateMapping(input, correlationId);
    try {
      const restaurant = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.restaurant.create({ data: input });
        await transaction.auditEvent.create({
          data: {
            actorId,
            restaurantId: created.id,
            eventType: 'RESTAURANT_CREATED',
            correlationId,
          },
        });
        return created;
      });
      return view(restaurant);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApplicationError('RESOURCE_CONFLICT', 409);
      }
      throw error;
    }
  }

  async update(
    id: string,
    input: RestaurantMappingInput,
    actorId: string,
    correlationId: string,
  ) {
    const existing = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!existing) {
      throw new ApplicationError('RESOURCE_NOT_FOUND', 404);
    }
    await this.#validateMapping(input, correlationId);
    try {
      const restaurant = await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM "Restaurant" WHERE id = ${id}::uuid FOR UPDATE`,
        );
        const mappingChanged =
          existing.sourceUnitId !== input.sourceUnitId ||
          existing.sourceRole !== input.sourceRole ||
          existing.timezone !== input.timezone;
        if (mappingChanged && (await transaction.syncRun.count({ where: { restaurantId: id } })) > 0) {
          throw new ApplicationError('RESOURCE_CONFLICT', 409);
        }
        const updated = await transaction.restaurant.update({ where: { id }, data: input });
        await transaction.auditEvent.create({
          data: {
            actorId,
            restaurantId: updated.id,
            eventType: 'RESTAURANT_UPDATED',
            correlationId,
          },
        });
        return updated;
      });
      return view(restaurant);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApplicationError('RESOURCE_CONFLICT', 409);
      }
      throw error;
    }
  }

  async #validateMapping(input: RestaurantMappingInput, correlationId: string): Promise<void> {
    if (!validTimezone(input.timezone)) {
      throw new ApplicationError('INPUT_INVALID', 400);
    }
    const units = await this.sourceFactory.create().discover(correlationId);
    const unit = units.find((candidate) => candidate.id === input.sourceUnitId);
    if (!unit?.roles.includes(input.sourceRole)) {
      throw new ApplicationError('INPUT_INVALID', 400);
    }
  }
}
