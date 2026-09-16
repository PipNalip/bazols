import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  ProductRankingService,
  aggregateProductRanking,
} from './product-ranking.service.js';

const items = [
  {
    sourceId: 'item-a',
    priceWithDiscountForOrder: new Prisma.Decimal('40.10'),
    currency: 'RUB',
    product: { sourceId: 'product-b', displayName: 'Борщ' },
  },
  {
    sourceId: 'item-b',
    priceWithDiscountForOrder: new Prisma.Decimal('60.10'),
    currency: 'RUB',
    product: { sourceId: 'product-b', displayName: 'Борщ' },
  },
  {
    sourceId: 'item-c',
    priceWithDiscountForOrder: new Prisma.Decimal('100.20'),
    currency: 'RUB',
    product: { sourceId: 'product-a', displayName: 'Айран' },
  },
];

describe('product ranking', () => {
  it('counts unique items as units and sums discounted revenue', () => {
    expect(aggregateProductRanking([...items, items[0]!], 'revenue')).toEqual([
      {
        rank: 1,
        productId: 'product-a',
        name: 'Айран',
        unitsSold: 1,
        revenue: '100.20',
        currency: 'RUB',
      },
      {
        rank: 2,
        productId: 'product-b',
        name: 'Борщ',
        unitsSold: 2,
        revenue: '100.20',
        currency: 'RUB',
      },
    ]);
  });

  it('supports sold-units sorting with stable tie-breaks', () => {
    expect(aggregateProductRanking(items, 'unitsSold').map((row) => row.productId)).toEqual([
      'product-b',
      'product-a',
    ]);
  });

  it('queries only current items whose orders fall inside local dates', async () => {
    const findMany = vi.fn(async () => items);
    const prisma = {
      restaurant: { findUnique: vi.fn(async () => ({ timezone: 'Europe/Moscow' })) },
      orderItem: { findMany },
    } as never;
    const service = new ProductRankingService(prisma);

    await service.get('restaurant-a', '2026-09-01', '2026-09-01', 'unitsSold');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        restaurantId: 'restaurant-a',
        isCurrent: true,
        order: {
          isCurrent: true,
          occurredAt: {
            gte: new Date('2026-08-31T21:00:00.000Z'),
            lt: new Date('2026-09-01T21:00:00.000Z'),
          },
        },
      },
      select: {
        sourceId: true,
        priceWithDiscountForOrder: true,
        currency: true,
        product: { select: { sourceId: true, displayName: true } },
      },
    });
  });
});
