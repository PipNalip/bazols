import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { addDays, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import { ApplicationError } from '../common/application.error.js';
import { PrismaService } from '../db/prisma.service.js';

export type ProductRankingSort = 'unitsSold' | 'revenue' | 'cogs' | 'grossMargin';

type ProductOrderItem = {
  sourceId: string;
  productId: string;
  priceWithDiscountForOrder: Prisma.Decimal;
  currency: string;
  order: { occurredAt: Date };
  product: { sourceId: string; displayName: string };
};

type ProductCost = {
  productId: string;
  effectiveDate: Date;
  autoCost: Prisma.Decimal;
  sourceTradeAreaId: string;
};

type ProductAccumulator = {
  productId: string;
  name: string;
  revenue: Prisma.Decimal;
  cogs: Prisma.Decimal;
  itemIds: Set<string>;
  costedUnits: number;
  currency: string;
};

export type ProductRankingRow = {
  rank: number;
  productId: string;
  name: string;
  unitsSold: number;
  revenue: string;
  cogs: string | null;
  grossMargin: string | null;
  grossMarginRate: string | null;
  currency: string;
};

export type ProductRankingResponse = {
  rows: ProductRankingRow[];
  coverage: { costedUnits: number; totalUnits: number; percentage: string };
};

const nameCollator = new Intl.Collator('ru', { sensitivity: 'base' });
const fixed = (value: Prisma.Decimal) =>
  value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);

export function aggregateProductRanking(
  items: ProductOrderItem[],
  costs: ProductCost[],
  sort: ProductRankingSort,
  timezone: string,
): ProductRankingResponse {
  const costsByProduct = new Map<string, { date: string; autoCost: Prisma.Decimal }[]>();
  const uniqueCosts = new Map<string, Prisma.Decimal>();
  for (const cost of costs) {
    const date = formatInTimeZone(cost.effectiveDate, 'UTC', 'yyyy-MM-dd');
    const key = `${cost.productId}:${date}`;
    const existing = uniqueCosts.get(key);
    if (existing && !existing.equals(cost.autoCost)) {
      throw new ApplicationError('REPORT_COST_CONFLICT', 409);
    }
    if (existing) continue;
    uniqueCosts.set(key, cost.autoCost);
    const history = costsByProduct.get(cost.productId) ?? [];
    history.push({ date, autoCost: cost.autoCost });
    costsByProduct.set(cost.productId, history);
  }
  for (const history of costsByProduct.values()) {
    history.sort((left, right) => right.date.localeCompare(left.date));
  }

  const products = new Map<string, ProductAccumulator>();
  const seenItems = new Set<string>();
  let costedUnits = 0;
  for (const item of items) {
    if (seenItems.has(item.sourceId)) continue;
    seenItems.add(item.sourceId);
    if (item.currency !== 'RUB') {
      throw new ApplicationError('REPORT_UNSUPPORTED_CURRENCY', 409);
    }
    const current = products.get(item.product.sourceId) ?? {
      productId: item.product.sourceId,
      name: item.product.displayName,
      revenue: new Prisma.Decimal(0),
      cogs: new Prisma.Decimal(0),
      itemIds: new Set<string>(),
      costedUnits: 0,
      currency: item.currency,
    };
    if (current.currency !== item.currency) {
      throw new ApplicationError('REPORT_CURRENCY_CONFLICT', 409);
    }
    const saleDate = formatInTimeZone(item.order.occurredAt, timezone, 'yyyy-MM-dd');
    const itemCost = costsByProduct.get(item.productId)?.find((cost) => cost.date <= saleDate)?.autoCost;
    current.itemIds.add(item.sourceId);
    current.revenue = current.revenue.plus(item.priceWithDiscountForOrder);
    if (itemCost) {
      current.cogs = current.cogs.plus(itemCost);
      current.costedUnits += 1;
      costedUnits += 1;
    }
    products.set(item.product.sourceId, current);
  }

  const rows = [...products.values()];
  rows.sort((left, right) => {
    const leftComplete = left.costedUnits === left.itemIds.size;
    const rightComplete = right.costedUnits === right.itemIds.size;
    let metric: number;
    if (sort === 'unitsSold') {
      metric = right.itemIds.size - left.itemIds.size;
    } else if (sort === 'revenue') {
      metric = right.revenue.comparedTo(left.revenue);
    } else if (leftComplete !== rightComplete) {
      metric = leftComplete ? -1 : 1;
    } else if (!leftComplete) {
      metric = 0;
    } else if (sort === 'cogs') {
      metric = right.cogs.comparedTo(left.cogs);
    } else {
      metric = right.revenue.minus(right.cogs).comparedTo(left.revenue.minus(left.cogs));
    }
    if (metric !== 0) return metric;
    const byName = nameCollator.compare(left.name, right.name);
    return byName !== 0 ? byName : left.productId.localeCompare(right.productId);
  });

  const totalUnits = seenItems.size;
  return {
    rows: rows.map((row, index) => {
      const completeCost = row.costedUnits === row.itemIds.size;
      const grossMargin = row.revenue.minus(row.cogs);
      return {
        rank: index + 1,
        productId: row.productId,
        name: row.name,
        unitsSold: row.itemIds.size,
        revenue: fixed(row.revenue),
        cogs: completeCost ? fixed(row.cogs) : null,
        grossMargin: completeCost ? fixed(grossMargin) : null,
        grossMarginRate: completeCost && !row.revenue.isZero()
          ? fixed(grossMargin.dividedBy(row.revenue).times(100))
          : null,
        currency: row.currency,
      };
    }),
    coverage: {
      costedUnits,
      totalUnits,
      percentage: totalUnits === 0
        ? '0.00'
        : fixed(new Prisma.Decimal(costedUnits).dividedBy(totalUnits).times(100)),
    },
  };
}

@Injectable()
export class ProductRankingService {
  constructor(private readonly prisma: PrismaService) {}

  async get(
    restaurantId: string,
    from: string,
    to: string,
    sort: ProductRankingSort,
  ): Promise<ProductRankingResponse> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    if (!restaurant) {
      throw new ApplicationError('RESOURCE_NOT_FOUND', 404);
    }
    const start = fromZonedTime(parseISO(from), restaurant.timezone);
    const endExclusive = fromZonedTime(addDays(parseISO(to), 1), restaurant.timezone);
    const items = await this.prisma.orderItem.findMany({
      where: {
        restaurantId,
        isCurrent: true,
        order: {
          isCurrent: true,
          occurredAt: { gte: start, lt: endExclusive },
        },
      },
      select: {
        sourceId: true,
        productId: true,
        priceWithDiscountForOrder: true,
        currency: true,
        order: { select: { occurredAt: true } },
        product: { select: { sourceId: true, displayName: true } },
      },
    });
    const productIds = [...new Set(items.map((item) => item.productId))];
    const costs = productIds.length === 0
      ? []
      : await this.prisma.productCostSnapshot.findMany({
          where: {
            restaurantId,
            productId: { in: productIds },
            effectiveDate: { lte: new Date(`${to}T00:00:00.000Z`) },
          },
          select: {
            productId: true,
            effectiveDate: true,
            autoCost: true,
            sourceTradeAreaId: true,
          },
        });
    return aggregateProductRanking(items, costs, sort, restaurant.timezone);
  }
}
