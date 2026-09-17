import { addDays, format, isValid, parseISO } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { Prisma } from '@prisma/client';

import { ApplicationError } from '../common/application.error.js';
import type { PrismaService } from '../db/prisma.service.js';
import { SourceError } from '../source/source.errors.js';
import {
  parseEmployeeRatingResponse,
  parseMaterialAutoCostsResponse,
  parseProductAutoCostsResponse,
} from '../source/source.schemas.js';
import { normalizeCosts, type NormalizedCosts } from './cost-normalizer.js';
import { normalizePages, type NormalizedPage } from './normalizer.js';
import { RawSnapshotRepository, type StoreRawSnapshotInput } from './raw-snapshot.repository.js';

export type RawImportPage = Omit<StoreRawSnapshotInput, 'syncRunId' | 'restaurantId'>;

export type ImportRunInput = {
  syncRunId: string;
  restaurantId: string;
  beginDate: string;
  endDate: string;
  timezone: string;
  pages: RawImportPage[];
  costPages?: RawImportPage[];
  sourceUnitId?: string;
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

const EMPTY_COSTS: NormalizedCosts = { productCosts: [], materialCosts: [] };

export class ImportPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: RawSnapshotRepository,
  ) {}

  async storeRawPage(identity: RunIdentity, page: RawImportPage): Promise<void> {
    await this.snapshots.store({ ...identity, ...page });
  }

  async importRun(input: ImportRunInput): Promise<void> {
    for (const page of [...input.pages, ...(input.costPages ?? [])]) {
      await this.storeRawPage(input, page);
    }
    await this.importStoredRun(input);
  }

  async importStoredRun(input: ImportRunInput): Promise<void> {
    const normalized = normalizePages(
      input.pages.map((page) => parseEmployeeRatingResponse(parseBody(page.body))),
    );
    let costs = EMPTY_COSTS;
    if (input.costPages) {
      if (!input.sourceUnitId) throw new SourceError('SOURCE_CONTRACT_INVALID');
      costs = normalizeCosts(
        input.costPages
          .filter((page) => page.endpoint === 'productAutoCosts')
          .map((page) => parseProductAutoCostsResponse(parseBody(page.body))),
        input.costPages
          .filter((page) => page.endpoint === 'materialAutoCosts')
          .map((page) => parseMaterialAutoCostsResponse(parseBody(page.body))),
        {
          sourceUnitId: input.sourceUnitId,
          productDate: input.endDate,
          beginDate: input.beginDate,
          endDate: input.endDate,
        },
      );
    }
    await this.#persistCompleteRun(
      input,
      normalized,
      costs,
      periodBoundsUtc(input.beginDate, input.endDate, input.timezone),
    );
  }

  async #persistCompleteRun(
    input: ImportRunInput,
    normalized: NormalizedPage,
    costs: NormalizedCosts,
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
        const currentCount = await transaction.order.count({ where: { ...period, isCurrent: true } });
        if (currentCount > 0) throw new SourceError('SOURCE_EMPTY_UNEXPECTED');
      }

      const productNames = new Map<string, string>();
      for (const product of normalized.products) productNames.set(product.sourceId, product.displayName);
      for (const cost of costs.productCosts) {
        const existing = productNames.get(cost.productSourceId);
        if (existing && existing !== cost.productName) throw new SourceError('SOURCE_DUPLICATE_ID');
        productNames.set(cost.productSourceId, cost.productName);
      }

      const employees = new Map<string, string>();
      for (const employee of normalized.employees) {
        const record = await transaction.employee.upsert({
          where: {
            restaurantId_sourceId: { restaurantId: input.restaurantId, sourceId: employee.sourceId },
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
      for (const [sourceId, displayName] of productNames) {
        const record = await transaction.product.upsert({
          where: { restaurantId_sourceId: { restaurantId: input.restaurantId, sourceId } },
          create: { restaurantId: input.restaurantId, sourceId, displayName },
          update: { displayName },
        });
        products.set(sourceId, record.id);
      }

      const orders = new Map<string, string>();
      for (const order of normalized.orders) {
        const employeeId = employees.get(order.employeeSourceId);
        if (!employeeId) throw new SourceError('SOURCE_CONTRACT_INVALID');
        const record = await transaction.order.upsert({
          where: {
            restaurantId_sourceId: { restaurantId: input.restaurantId, sourceId: order.sourceId },
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
        if (!orderId || !productId) throw new SourceError('SOURCE_CONTRACT_INVALID');
        await transaction.orderItem.upsert({
          where: {
            restaurantId_sourceId: { restaurantId: input.restaurantId, sourceId: item.sourceId },
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

      const materials = new Map<string, string>();
      for (const cost of costs.materialCosts) {
        const record = await transaction.material.upsert({
          where: {
            restaurantId_sourceId: {
              restaurantId: input.restaurantId,
              sourceId: cost.materialSourceId,
            },
          },
          create: {
            restaurantId: input.restaurantId,
            sourceId: cost.materialSourceId,
            displayName: cost.materialName,
            materialType: cost.materialType,
            unitOfMeasure: cost.unitOfMeasure,
          },
          update: {
            displayName: cost.materialName,
            materialType: cost.materialType,
            unitOfMeasure: cost.unitOfMeasure,
          },
        });
        materials.set(cost.materialSourceId, record.id);
      }

      for (const cost of costs.productCosts) {
        const productId = products.get(cost.productSourceId);
        if (!productId) throw new SourceError('SOURCE_CONTRACT_INVALID');
        const identity = {
          restaurantId: input.restaurantId,
          productId,
          effectiveDate: cost.effectiveDate,
          sourceUnitId: cost.sourceUnitId,
          sourceTradeAreaId: cost.sourceTradeAreaId,
        };
        const values = {
          autoCost: cost.autoCost,
          averageAutoCost: cost.averageAutoCost,
          reportedPrice: cost.reportedPrice,
          fc: cost.fc,
          extraCharge: cost.extraCharge,
          isTotalCost: cost.isTotalCost,
          lastSeenSyncRunId: input.syncRunId,
        };
        await transaction.productCostSnapshot.upsert({
          where: {
            restaurantId_productId_effectiveDate_sourceUnitId_sourceTradeAreaId: identity,
          },
          create: { ...identity, ...values },
          update: values,
        });
      }

      for (const cost of costs.materialCosts) {
        const materialId = materials.get(cost.materialSourceId);
        if (!materialId) throw new SourceError('SOURCE_CONTRACT_INVALID');
        const identity = {
          restaurantId: input.restaurantId,
          materialId,
          effectiveDate: cost.effectiveDate,
          sourceUnitId: cost.sourceUnitId,
          sourceDepartmentId: cost.sourceDepartmentId,
        };
        const values = {
          autoCost: cost.autoCost,
          sourceCurrencyCode: cost.sourceCurrencyCode,
          lastSeenSyncRunId: input.syncRunId,
        };
        await transaction.materialCostSnapshot.upsert({
          where: {
            restaurantId_materialId_effectiveDate_sourceUnitId_sourceDepartmentId: identity,
          },
          create: { ...identity, ...values },
          update: values,
        });
      }

      if (normalized.orders.length > 0) {
        const periodOrders = await transaction.order.findMany({ where: period, select: { id: true } });
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
          where: { ...period, lastSeenSyncRunId: { not: input.syncRunId } },
          data: { isCurrent: false },
        });
      }

      await transaction.syncRun.update({
        where: { id: input.syncRunId },
        data: {
          employeesCount: normalized.employees.length,
          productsCount: normalized.products.length,
          ordersCount: normalized.orders.length,
          orderItemsCount: normalized.items.length,
          productCostSnapshotsCount: costs.productCosts.length,
          materialCostSnapshotsCount: costs.materialCosts.length,
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
    }, { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS });
  }
}
