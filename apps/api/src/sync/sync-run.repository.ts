import { Prisma, type SyncRun } from '@prisma/client';
import { Injectable } from '@nestjs/common';

import { ApplicationError } from '../common/application.error.js';
import { PrismaService } from '../db/prisma.service.js';

export type EnqueueSyncRunInput = {
  restaurantId: string;
  requestedById: string;
  beginDate: Date;
  endDate: Date;
  correlationId: string;
};

const STALE_AFTER_MS = 15 * 60 * 1_000;

@Injectable()
export class SyncRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: EnqueueSyncRunInput): Promise<SyncRun> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM "Restaurant" WHERE id = ${input.restaurantId}::uuid FOR SHARE`,
        );
        const { correlationId, ...runInput } = input;
        const run = await transaction.syncRun.create({
          data: { ...runInput, status: 'QUEUED' },
        });
        await transaction.auditEvent.create({
          data: {
            actorId: run.requestedById,
            eventType: 'SYNC_ENQUEUED',
            restaurantId: run.restaurantId,
            syncRunId: run.id,
            correlationId,
          },
        });
        return run;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApplicationError('SYNC_ACTIVE_CONFLICT', 409);
      }
      throw error;
    }
  }

  async claimNext(now = new Date()): Promise<SyncRun | null> {
    const claimed = await this.prisma.$queryRaw<SyncRun[]>(Prisma.sql`
      WITH candidate AS (
        SELECT id
        FROM "SyncRun"
        WHERE status = 'QUEUED'::"SyncRunStatus"
        ORDER BY "createdAt", id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "SyncRun" AS run
      SET status = 'RUNNING'::"SyncRunStatus",
          "startedAt" = ${now},
          "heartbeatAt" = ${now},
          "safeErrorCode" = NULL,
          "finishedAt" = NULL,
          "updatedAt" = ${now}
      FROM candidate
      WHERE run.id = candidate.id
        AND run.status = 'QUEUED'::"SyncRunStatus"
      RETURNING run.*
    `);
    return claimed[0] ?? null;
  }

  async heartbeat(id: string, now = new Date()): Promise<void> {
    await this.#transition(id, { status: 'RUNNING' }, { heartbeatAt: now });
  }

  async succeed(id: string, now = new Date()): Promise<void> {
    await this.#finish(
      id,
      { status: 'SUCCEEDED', finishedAt: now, safeErrorCode: null },
      'SYNC_SUCCEEDED',
    );
  }

  async fail(id: string, safeErrorCode: string, now = new Date()): Promise<void> {
    await this.#finish(
      id,
      { status: 'FAILED', finishedAt: now, safeErrorCode },
      'SYNC_FAILED',
      safeErrorCode,
    );
  }

  async recoverStale(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
    return this.prisma.$transaction(async (transaction) => {
      const staleRuns = await transaction.syncRun.findMany({
        where: { status: 'RUNNING', heartbeatAt: { lt: cutoff } },
        select: { id: true, restaurantId: true, requestedById: true },
      });
      let recovered = 0;
      for (const run of staleRuns) {
        const result = await transaction.syncRun.updateMany({
          where: { id: run.id, status: 'RUNNING', heartbeatAt: { lt: cutoff } },
          data: {
            status: 'FAILED',
            safeErrorCode: 'SYNC_STALE_HEARTBEAT',
            finishedAt: now,
          },
        });
        if (result.count === 1) {
          recovered += 1;
          await transaction.auditEvent.create({
            data: {
              actorId: run.requestedById,
              eventType: 'SYNC_STALE_RECOVERED',
              restaurantId: run.restaurantId,
              syncRunId: run.id,
              correlationId: `worker:${run.id}`,
              safeMetadata: { safeErrorCode: 'SYNC_STALE_HEARTBEAT' },
            },
          });
        }
      }
      return recovered;
    });
  }

  async #finish(
    id: string,
    data: Prisma.SyncRunUpdateManyMutationInput,
    eventType: 'SYNC_SUCCEEDED' | 'SYNC_FAILED',
    safeErrorCode?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.syncRun.updateMany({
        where: { id, status: 'RUNNING' },
        data,
      });
      if (result.count !== 1) {
        throw new ApplicationError('SYNC_INVALID_TRANSITION', 409);
      }
      const run = await transaction.syncRun.findUniqueOrThrow({ where: { id } });
      await transaction.auditEvent.create({
        data: {
          actorId: run.requestedById,
          eventType,
          restaurantId: run.restaurantId,
          syncRunId: run.id,
          correlationId: `worker:${run.id}`,
          ...(safeErrorCode ? { safeMetadata: { safeErrorCode } } : {}),
        },
      });
    });
  }

  async #transition(
    id: string,
    where: { status: 'RUNNING' },
    data: Prisma.SyncRunUpdateManyMutationInput,
  ): Promise<void> {
    const result = await this.prisma.syncRun.updateMany({
      where: { id, ...where },
      data,
    });
    if (result.count !== 1) {
      throw new ApplicationError('SYNC_INVALID_TRANSITION', 409);
    }
  }
}
