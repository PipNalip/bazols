import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { addDays, parseISO } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

import { ApplicationError } from '../common/application.error.js';
import { PrismaService } from '../db/prisma.service.js';

export type ProductRankingSort = 'unitsSold' | 'revenue';

type ProductOrderItem = {
  sourceId: string;
  priceWithDiscountForOrder: Prisma.Decimal;
  currency: string;
  product: { sourceId: string; displayName: string };
};

type ProductAccumulator = {
  productId: string;
  name: string;
  revenue: Prisma.Decimal;
  itemIds: Set<string>;
  currency: string;
};

export type ProductRankingRow = {
  rank: number;
  productId: string;
  name: string;
  unitsSold: number;
  revenue: string;
  currency: string;
};

const nameCollator = new Intl.Collator('ru', { sensitivity: 'base' });

export function aggregateProductRanking(
  items: ProductOrderItem[],
  sort: ProductRankingSort,
): ProductRankingRow[] {
  const products = new Map<string, ProductAccumulator>();
  const seenItems = new Set<string>();
  for (const item of items) {
    if (seenItems.has(item.sourceId)) continue;
    seenItems.add(item.sourceId);
    const current = products.get(item.product.sourceId) ?? {
      productId: item.product.sourceId,
      name: item.product.displayName,
      revenue: new Prisma.Decimal(0),
      itemIds: new Set<string>(),
      currency: item.currency,
    };
    if (current.currency !== item.currency) {
      throw new ApplicationError('REPORT_CURRENCY_CONFLICT', 409);
    }
    current.itemIds.add(item.sourceId);
    current.revenue = current.revenue.plus(item.priceWithDiscountForOrder);
    products.set(item.product.sourceId, current);
  }

  const rows = [...products.values()];
  rows.sort((left, right) => {
    const metric =
      sort === 'unitsSold'
        ? right.itemIds.size - left.itemIds.size
        : right.revenue.comparedTo(left.revenue);
    if (metric !== 0) return metric;
    const byName = nameCollator.compare(left.name, right.name);
    return byName !== 0 ? byName : left.productId.localeCompare(right.productId);
  });

  return rows.map((row, index) => ({
    rank: index + 1,
    productId: row.productId,
    name: row.name,
    unitsSold: row.itemIds.size,
    revenue: row.revenue.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
    currency: row.currency,
  }));
}

@Injectable()
export class ProductRankingService {
  constructor(private readonly prisma: PrismaService) {}

  async get(
    restaurantId: string,
    from: string,
    to: string,
    sort: ProductRankingSort,
  ): Promise<ProductRankingRow[]> {
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
        priceWithDiscountForOrder: true,
        currency: true,
        product: { select: { sourceId: true, displayName: true } },
      },
    });
    return aggregateProductRanking(items, sort);
  }
}
