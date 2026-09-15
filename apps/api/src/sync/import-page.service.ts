import type { PrismaService } from '../db/prisma.service.js';
import { SourceError } from '../source/source.errors.js';
import { parseEmployeeRatingResponse } from '../source/source.schemas.js';
import { normalizePage, type NormalizedPage } from './normalizer.js';
import {
  RawSnapshotRepository,
  type StoreRawSnapshotInput,
} from './raw-snapshot.repository.js';

export type ImportPageInput = StoreRawSnapshotInput;

export type FinalizeSyncInput = {
  syncRunId: string;
  restaurantId: string;
  beginDate: Date;
  endDate: Date;
};

function parseBody(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw new SourceError('SOURCE_CONTRACT_INVALID');
  }
}

export class ImportPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: RawSnapshotRepository,
  ) {}

  async importPage(input: ImportPageInput): Promise<void> {
    await this.snapshots.store(input);
    const normalized = normalizePage(parseEmployeeRatingResponse(parseBody(input.body)));
    await this.#persistNormalized(input, normalized);
  }

  async #persistNormalized(
    input: ImportPageInput,
    normalized: NormalizedPage,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
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

      const [ordersCount, orderItemsCount, employeeRows, productRows] = await Promise.all([
        transaction.order.count({ where: { lastSeenSyncRunId: input.syncRunId } }),
        transaction.orderItem.count({ where: { lastSeenSyncRunId: input.syncRunId } }),
        transaction.order.findMany({
          where: { lastSeenSyncRunId: input.syncRunId },
          distinct: ['employeeId'],
          select: { employeeId: true },
        }),
        transaction.orderItem.findMany({
          where: { lastSeenSyncRunId: input.syncRunId },
          distinct: ['productId'],
          select: { productId: true },
        }),
      ]);
      await transaction.syncRun.update({
        where: { id: input.syncRunId },
        data: {
          employeesCount: employeeRows.length,
          productsCount: productRows.length,
          ordersCount,
          orderItemsCount,
        },
      });
    });
  }

  async finalizeSync(input: FinalizeSyncInput): Promise<void> {
    const endExclusive = new Date(input.endDate);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    await this.prisma.$transaction(async (transaction) => {
      const period = {
        restaurantId: input.restaurantId,
        occurredAt: { gte: input.beginDate, lt: endExclusive },
      };
      const importedCount = await transaction.order.count({
        where: { ...period, lastSeenSyncRunId: input.syncRunId },
      });
      const currentCount = await transaction.order.count({
        where: { ...period, isCurrent: true },
      });

      if (importedCount === 0) {
        if (currentCount > 0) {
          throw new SourceError('SOURCE_EMPTY_UNEXPECTED');
        }
        return;
      }

      const periodOrders = await transaction.order.findMany({
        where: period,
        select: { id: true },
      });
      const orderIds = periodOrders.map((order) => order.id);
      await transaction.orderItem.updateMany({
        where: {
          restaurantId: input.restaurantId,
          orderId: { in: orderIds },
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
    });
  }
}
