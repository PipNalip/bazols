import { addDays, format, isValid, parseISO } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { Prisma } from '@prisma/client';

import { ApplicationError } from '../common/application.error.js';
import type { PrismaService } from '../db/prisma.service.js';
import { SourceError } from '../source/source.errors.js';
import { parseEmployeeRatingResponse } from '../source/source.schemas.js';
import { normalizePages, type NormalizedPage } from './normalizer.js';
import {
  RawSnapshotRepository,
  type StoreRawSnapshotInput,
} from './raw-snapshot.repository.js';

export type RawImportPage = Omit<StoreRawSnapshotInput, 'syncRunId' | 'restaurantId'>;

export type ImportRunInput = {
  syncRunId: string;
  restaurantId: string;
  beginDate: string;
  endDate: string;
  timezone: string;
  pages: RawImportPage[];
  markSucceeded?: boolean;
};

type RunIdentity = Pick<ImportRunInput, 'syncRunId' | 'restaurantId'>;

const TRANSACTION_MAX_WAIT_MS = 10_000;
const TRANSACTION_TIMEOUT_MS = 120_000;

function parseBody(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw new SourceError('SOURCE_CONTRACT_INVALID');
  }
}

export function periodBoundsUtc(
  beginDate: string,
  endDate: string,
  timezone: string,
): { begin: Date; endExclusive: Date } {
  const begin = parseISO(beginDate);
  const end = parseISO(endDate);
  if (!isValid(begin) || !isValid(end) || begin > end) {
    throw new SourceError('SOURCE_CONTRACT_INVALID');
  }

  try {
    const endExclusiveDate = format(addDays(end, 1), 'yyyy-MM-dd');
    const bounds = {
      begin: fromZonedTime(`${beginDate}T00:00:00`, timezone),
      endExclusive: fromZonedTime(`${endExclusiveDate}T00:00:00`, timezone),
    };
    if (!isValid(bounds.begin) || !isValid(bounds.endExclusive)) {
      throw new Error('Invalid timezone boundary');
    }
    return bounds;
  } catch {
    throw new SourceError('SOURCE_CONTRACT_INVALID');
  }
}

export class ImportPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: RawSnapshotRepository,
  ) {}

  async storeRawPage(identity: RunIdentity, page: RawImportPage): Promise<void> {
    await this.snapshots.store({ ...identity, ...page });
  }

  async importRun(input: ImportRunInput): Promise<void> {
    for (const page of input.pages) {
      await this.storeRawPage(input, page);
    }
    await this.importStoredRun(input);
  }

  async importStoredRun(input: ImportRunInput): Promise<void> {
    const normalized = normalizePages(
      input.pages.map((page) => parseEmployeeRatingResponse(parseBody(page.body))),
    );
    const bounds = periodBoundsUtc(input.beginDate, input.endDate, input.timezone);
    await this.#persistCompleteRun(input, normalized, bounds);
  }

  async #persistCompleteRun(
    input: ImportRunInput,
    normalized: NormalizedPage,
    bounds: { begin: Date; endExclusive: Date },
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      let lockedRun: { id: string; requestedById: string; restaurantId: string } | undefined;
      if (input.markSucceeded) {
        const rows = await transaction.$queryRaw<
          Array<{ id: string; requestedById: string; restaurantId: string; status: string }>
        >(Prisma.sql`
          SELECT id, "requestedById", "restaurantId", status::text AS status
          FROM "SyncRun"
          WHERE id = ${input.syncRunId}::uuid
          FOR UPDATE
        `);
        const run = rows[0];
        if (!run || run.status !== 'RUNNING' || run.restaurantId !== input.restaurantId) {
          throw new ApplicationError('SYNC_INVALID_TRANSITION', 409);
        }
        lockedRun = run;
      }

      const period = {
        restaurantId: input.restaurantId,
        occurredAt: { gte: bounds.begin, lt: bounds.endExclusive },
      };

      if (normalized.orders.length === 0) {
        const currentCount = await transaction.order.count({
          where: { ...period, isCurrent: true },
        });
        if (currentCount > 0) {
          throw new SourceError('SOURCE_EMPTY_UNEXPECTED');
        }
        await transaction.syncRun.update({
          where: { id: input.syncRunId },
          data: {
            employeesCount: 0,
            productsCount: 0,
            ordersCount: 0,
            orderItemsCount: 0,
            ...(input.markSucceeded
              ? { status: 'SUCCEEDED' as const, finishedAt: new Date(), safeErrorCode: null }
              : {}),
          },
        });
        if (lockedRun) {
          await transaction.auditEvent.create({
            data: {
              actorId: lockedRun.requestedById,
              eventType: 'SYNC_SUCCEEDED',
              restaurantId: lockedRun.restaurantId,
              syncRunId: lockedRun.id,
              correlationId: `worker:${lockedRun.id}`,
            },
          });
        }
        return;
      }

      const employees = new Map<string, string>();
      for (const employee of normalized.employees) {
        const record = await transaction.employee.upsert({
          where: {
            restaurantId_sourceId: {
              restaurantId: input.restaurantId,
              sourceId: employee.sourceId,
            },
          },
          create: {
            restaurantId: input.restaurantId,
            sourceId: employee.sourceId,
            displayName: employee.displayName,
          },
          update: { displayName: employee.displayName },
        });
        employees.set(employee.sourceId, record.id);
      }

      const products = new Map<string, string>();
      for (const product of normalized.products) {
        const record = await transaction.product.upsert({
          where: {
            restaurantId_sourceId: {
              restaurantId: input.restaurantId,
              sourceId: product.sourceId,
            },
          },
          create: {
            restaurantId: input.restaurantId,
            sourceId: product.sourceId,
            displayName: product.displayName,
          },
          update: { displayName: product.displayName },
        });
        products.set(product.sourceId, record.id);
      }

      const orders = new Map<string, string>();
      for (const order of normalized.orders) {
        const employeeId = employees.get(order.employeeSourceId);
        if (!employeeId) {
          throw new SourceError('SOURCE_CONTRACT_INVALID');
        }
        const record = await transaction.order.upsert({
          where: {
            restaurantId_sourceId: {
              restaurantId: input.restaurantId,
              sourceId: order.sourceId,
            },
          },
          create: {
            restaurantId: input.restaurantId,
            sourceId: order.sourceId,
            employeeId,
            occurredAt: order.occurredAt,
            price: order.price,
            currency: order.currency,
            lastSeenSyncRunId: input.syncRunId,
          },
          update: {
            employeeId,
            occurredAt: order.occurredAt,
            price: order.price,
            currency: order.currency,
            isCurrent: true,
            lastSeenSyncRunId: input.syncRunId,
          },
        });
        orders.set(order.sourceId, record.id);
      }

      for (const item of normalized.items) {
        const orderId = orders.get(item.orderSourceId);
        const productId = products.get(item.productSourceId);
        if (!orderId || !productId) {
          throw new SourceError('SOURCE_CONTRACT_INVALID');
        }
        await transaction.orderItem.upsert({
          where: {
            restaurantId_sourceId: {
              restaurantId: input.restaurantId,
              sourceId: item.sourceId,
            },
          },
          create: {
            restaurantId: input.restaurantId,
            sourceId: item.sourceId,
            orderId,
            productId,
            priceWithDiscountForOrder: item.priceWithDiscountForOrder,
            currency: item.currency,
            lastSeenSyncRunId: input.syncRunId,
          },
          update: {
            orderId,
            productId,
            priceWithDiscountForOrder: item.priceWithDiscountForOrder,
            currency: item.currency,
            isCurrent: true,
            lastSeenSyncRunId: input.syncRunId,
          },
        });
      }

      const periodOrders = await transaction.order.findMany({
        where: period,
        select: { id: true },
      });
      const periodOrderIds = periodOrders.map((order) => order.id);
      await transaction.orderItem.updateMany({
        where: {
          restaurantId: input.restaurantId,
          orderId: { in: periodOrderIds },
          lastSeenSyncRunId: { not: input.syncRunId },
        },
        data: { isCurrent: false },
      });
      await transaction.order.updateMany({
        where: {
          ...period,
          lastSeenSyncRunId: { not: input.syncRunId },
        },
        data: { isCurrent: false },
      });

      await transaction.syncRun.update({
        where: { id: input.syncRunId },
        data: {
          employeesCount: normalized.employees.length,
          productsCount: normalized.products.length,
          ordersCount: normalized.orders.length,
          orderItemsCount: normalized.items.length,
          ...(input.markSucceeded
            ? { status: 'SUCCEEDED' as const, finishedAt: new Date(), safeErrorCode: null }
            : {}),
        },
      });
      if (lockedRun) {
        await transaction.auditEvent.create({
          data: {
            actorId: lockedRun.requestedById,
            eventType: 'SYNC_SUCCEEDED',
            restaurantId: lockedRun.restaurantId,
            syncRunId: lockedRun.id,
            correlationId: `worker:${lockedRun.id}`,
          },
        });
      }
    }, {
      maxWait: TRANSACTION_MAX_WAIT_MS,
      timeout: TRANSACTION_TIMEOUT_MS,
    });
  }
}
