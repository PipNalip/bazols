import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/db/prisma.service.js';
import { SourceConnectorFactory } from '../../src/source/source-connector.factory.js';
import { ImportPageService } from '../../src/sync/import-page.service.js';
import { RawSnapshotRepository } from '../../src/sync/raw-snapshot.repository.js';

import { SourceSyncProcessor } from '../../src/sync/source-sync.processor.js';
import { SyncRunRepository } from '../../src/sync/sync-run.repository.js';
import { SyncWorker } from '../../src/sync/sync.worker.js';
import { startFakeSource } from '../../../../test/fake-source/server.js';

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

async function createContext(sourceUnitId = 'queue-unit'): Promise<{
  requestedById: string;
  restaurantId: string;
  correlationId: string;
}> {
  const user = await prisma.user.create({
    data: { username: 'queue-admin', passwordHash: 'synthetic-hash', role: 'ADMIN' },
  });
  const restaurant = await prisma.restaurant.create({
    data: {
      sourceUnitId,
      sourceRole: 'SYNTHETIC_REPORT_VIEWER',
      timezone: 'UTC',
      displayName: 'Queue Restaurant',
    },
  });
  return {
    requestedById: user.id,
    restaurantId: restaurant.id,
    correlationId: 'worker-repository-test',
  };
}

beforeAll(async () => prisma.$connect());
beforeEach(clearDatabase);
afterAll(async () => {
  await clearDatabase();
  await prisma.$disconnect();
});

describe('SyncRunRepository', () => {
  it('enqueues one active run per restaurant and claims it only once', async () => {
    const context = await createContext();
    const repository = new SyncRunRepository(prisma);
    const run = await repository.enqueue({
      ...context,
      beginDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
    });

    await expect(
      repository.enqueue({
        ...context,
        beginDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'SYNC_ACTIVE_CONFLICT' });

    const [firstClaim, secondClaim] = await Promise.all([
      repository.claimNext(),
      repository.claimNext(),
    ]);
    expect([firstClaim?.id, secondClaim?.id].filter(Boolean)).toEqual([run.id]);
    await expect(prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } })).resolves.toMatchObject({
      status: 'RUNNING',
      safeErrorCode: null,
    });
  });

  it('lets concurrent workers claim different queued restaurants', async () => {
    const context = await createContext();
    const secondRestaurant = await prisma.restaurant.create({
      data: {
        sourceUnitId: 'queue-unit-2',
        sourceRole: 'SYNTHETIC_REPORT_VIEWER',
        timezone: 'UTC',
        displayName: 'Queue Restaurant 2',
      },
    });
    const repository = new SyncRunRepository(prisma);
    const first = await repository.enqueue({
      ...context,
      beginDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
    });
    const second = await repository.enqueue({
      ...context,
      restaurantId: secondRestaurant.id,
      beginDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
    });
    const connectionA = new PrismaService(databaseUrl);
    const connectionB = new PrismaService(databaseUrl);
    await Promise.all([connectionA.$connect(), connectionB.$connect()]);
    try {
      const claimed = await Promise.all([
        new SyncRunRepository(connectionA).claimNext(),
        new SyncRunRepository(connectionB).claimNext(),
      ]);
      expect(new Set(claimed.map((run) => run?.id))).toEqual(new Set([first.id, second.id]));
    } finally {
      await Promise.all([connectionA.$disconnect(), connectionB.$disconnect()]);
    }
  });

  it('heartbeats, completes valid transitions and rejects stale transition attempts', async () => {
    const context = await createContext();
    const repository = new SyncRunRepository(prisma);
    const queued = await repository.enqueue({
      ...context,
      beginDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
    });
    const running = await repository.claimNext();
    expect(running?.id).toBe(queued.id);

    const heartbeatAt = new Date('2026-09-15T12:00:00.000Z');
    await repository.heartbeat(queued.id, heartbeatAt);
    await repository.succeed(queued.id, new Date('2026-09-15T12:01:00.000Z'));

    await expect(repository.fail(queued.id, 'SHOULD_NOT_APPLY')).rejects.toMatchObject({
      code: 'SYNC_INVALID_TRANSITION',
    });
    await expect(prisma.syncRun.findUniqueOrThrow({ where: { id: queued.id } })).resolves.toMatchObject({
      status: 'SUCCEEDED',
      heartbeatAt,
      safeErrorCode: null,
    });
  });

  it('recovers only running jobs whose heartbeat is stale', async () => {
    const context = await createContext();
    const repository = new SyncRunRepository(prisma);
    const stale = await repository.enqueue({
      ...context,
      beginDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
    });
    await repository.claimNext(new Date('2026-09-15T10:00:00.000Z'));

    await expect(
      repository.recoverStale(new Date('2026-09-15T10:15:01.000Z')),
    ).resolves.toBe(1);
    await expect(prisma.syncRun.findUniqueOrThrow({ where: { id: stale.id } })).resolves.toMatchObject({
      status: 'FAILED',
      safeErrorCode: 'SYNC_STALE_HEARTBEAT',
      finishedAt: new Date('2026-09-15T10:15:01.000Z'),
    });
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: { syncRunId: stale.id, eventType: 'SYNC_STALE_RECOVERED' },
      }),
    ).resolves.toMatchObject({
      eventType: 'SYNC_STALE_RECOVERED',
      safeMetadata: { safeErrorCode: 'SYNC_STALE_HEARTBEAT' },
    });
  });
});

describe('SyncWorker', () => {
  it('runs the real source ingestion pipeline and persists success counters', async () => {
    const source = await startFakeSource();
    try {
      const user = await prisma.user.create({
        data: { username: 'pipeline-admin', passwordHash: 'synthetic-password-hash', role: 'ADMIN' },
      });
      const restaurant = await prisma.restaurant.create({
        data: {
          sourceUnitId: '10000000-0000-4000-8000-000000000001',
          sourceRole: 'SYNTHETIC_REPORT_VIEWER',
          timezone: 'Europe/Moscow',
          displayName: 'Pipeline Restaurant',
        },
      });
      const repository = new SyncRunRepository(prisma);
      const queued = await repository.enqueue({
        restaurantId: restaurant.id,
        requestedById: user.id,
        beginDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
        correlationId: 'worker-pipeline-test',
      });
      const snapshots = new RawSnapshotRepository(prisma, Buffer.alloc(32, 23));
      const sourceFactory = new SourceConnectorFactory({
        baseUrl: source.url,
        login: 'source-login',
        password: 'source-password',
        allowInsecureForTests: true,
      });
      const worker = new SyncWorker(
        repository,
        new SourceSyncProcessor(
          prisma,
          sourceFactory,
          new ImportPageService(prisma, snapshots),
        ),
      );

      await expect(worker.runOnce()).resolves.toBe(true);
      await expect(prisma.syncRun.findUniqueOrThrow({ where: { id: queued.id } })).resolves.toMatchObject({
        status: 'SUCCEEDED',
        employeesCount: 2,
        productsCount: 2,
        ordersCount: 3,
        orderItemsCount: 4,
        productCostSnapshotsCount: 1,
        materialCostSnapshotsCount: 1,
      });
      await expect(prisma.rawSnapshot.count({ where: { syncRunId: queued.id } })).resolves.toBe(3);
      await expect(prisma.productCostSnapshot.count()).resolves.toBe(1);
      await expect(prisma.materialCostSnapshot.count()).resolves.toBe(1);
      await expect(prisma.productCostSnapshot.findFirstOrThrow()).resolves.toMatchObject({
        effectiveDate: new Date('2026-09-30T00:00:00.000Z'),
        sourceUnitId: '10000000-0000-4000-8000-000000000001',
      });
      expect((await prisma.productCostSnapshot.findFirstOrThrow()).autoCost.toFixed(6)).toBe(
        '120.500001',
      );
      expect((await prisma.materialCostSnapshot.findFirstOrThrow()).autoCost.toFixed(6)).toBe(
        '42.250000',
      );

      const repeated = await repository.enqueue({
        restaurantId: restaurant.id,
        requestedById: user.id,
        beginDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
        correlationId: 'worker-pipeline-repeat',
      });
      await expect(worker.runOnce()).resolves.toBe(true);
      await expect(prisma.productCostSnapshot.count()).resolves.toBe(1);
      await expect(prisma.materialCostSnapshot.count()).resolves.toBe(1);
      await expect(prisma.productCostSnapshot.findFirstOrThrow()).resolves.toMatchObject({
        lastSeenSyncRunId: repeated.id,
      });
    } finally {
      await source.close();
    }
  });

  it('keeps costs unknown when both cost feeds are empty', async () => {
    const source = await startFakeSource({ emptyCosts: true });
    try {
      const context = await createContext('10000000-0000-4000-8000-000000000001');
      const repository = new SyncRunRepository(prisma);
      const queued = await repository.enqueue({
        ...context,
        beginDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
      });
      const worker = new SyncWorker(
        repository,
        new SourceSyncProcessor(
          prisma,
          new SourceConnectorFactory({
            baseUrl: source.url,
            login: 'source-login',
            password: 'source-password',
            allowInsecureForTests: true,
          }),
          new ImportPageService(prisma, new RawSnapshotRepository(prisma, Buffer.alloc(32, 24))),
        ),
      );

      await expect(worker.runOnce()).resolves.toBe(true);
      await expect(prisma.syncRun.findUniqueOrThrow({ where: { id: queued.id } })).resolves.toMatchObject({
        status: 'SUCCEEDED',
        productCostSnapshotsCount: 0,
        materialCostSnapshotsCount: 0,
      });
      await expect(prisma.productCostSnapshot.count()).resolves.toBe(0);
      await expect(prisma.materialCostSnapshot.count()).resolves.toBe(0);
    } finally {
      await source.close();
    }
  });

  it('retains raw evidence but publishes no normalized data when costs are malformed', async () => {
    const source = await startFakeSource({ malformedCosts: true });
    try {
      const context = await createContext('10000000-0000-4000-8000-000000000001');
      const repository = new SyncRunRepository(prisma);
      const queued = await repository.enqueue({
        ...context,
        beginDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
      });
      const worker = new SyncWorker(
        repository,
        new SourceSyncProcessor(
          prisma,
          new SourceConnectorFactory({
            baseUrl: source.url,
            login: 'source-login',
            password: 'source-password',
            allowInsecureForTests: true,
          }),
          new ImportPageService(prisma, new RawSnapshotRepository(prisma, Buffer.alloc(32, 25))),
        ),
      );

      await expect(worker.runOnce()).resolves.toBe(true);
      await expect(prisma.syncRun.findUniqueOrThrow({ where: { id: queued.id } })).resolves.toMatchObject({
        status: 'FAILED',
        safeErrorCode: 'SOURCE_CONTRACT_INVALID',
      });
      await expect(prisma.rawSnapshot.count({ where: { syncRunId: queued.id } })).resolves.toBe(2);
      await expect(prisma.order.count()).resolves.toBe(0);
      await expect(prisma.productCostSnapshot.count()).resolves.toBe(0);
    } finally {
      await source.close();
    }
  });

  it('stores only a safe failure code returned by the processor', async () => {
    const context = await createContext();
    const repository = new SyncRunRepository(prisma);
    const queued = await repository.enqueue({
      ...context,
      beginDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
    });
    const worker = new SyncWorker(repository, {
      async process() {
        throw Object.assign(new Error('sensitive internal detail'), {
          code: 'SOURCE_CONTRACT_INVALID',
        });
      },
    });

    await expect(worker.runOnce()).resolves.toBe(true);
    await expect(prisma.syncRun.findUniqueOrThrow({ where: { id: queued.id } })).resolves.toMatchObject({
      status: 'FAILED',
      safeErrorCode: 'SOURCE_CONTRACT_INVALID',
    });
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { syncRunId: queued.id, eventType: 'SYNC_FAILED' },
    });
    expect(audit).toMatchObject({
      eventType: 'SYNC_FAILED',
      safeMetadata: { safeErrorCode: 'SOURCE_CONTRACT_INVALID' },
    });
    expect(JSON.stringify(audit)).not.toContain('sensitive internal detail');
  });
});
