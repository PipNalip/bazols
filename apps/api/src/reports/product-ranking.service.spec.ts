import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  ProductRankingService,
  aggregateProductRanking,
} from './product-ranking.service.js';

const item = (
  sourceId: string,
  productId: string,
  productSourceId: string,
  name: string,
  revenue: string,
  occurredAt = '2026-09-10T12:00:00.000Z',
  currency = 'RUB',
) => ({
  sourceId,
  productId,
  priceWithDiscountForOrder: new Prisma.Decimal(revenue),
  currency,
  order: { occurredAt: new Date(occurredAt) },
  product: { sourceId: productSourceId, displayName: name },
});

const cost = (productId: string, effectiveDate: string, autoCost: string, tradeArea = 'area-a') => ({
  productId,
  effectiveDate: new Date(`${effectiveDate}T00:00:00.000Z`),
  autoCost: new Prisma.Decimal(autoCost),
  sourceTradeAreaId: tradeArea,
});

describe('product ranking', () => {
  it('returns an empty ranking with explicit zero coverage', () => {
    expect(aggregateProductRanking([], [], 'unitsSold', 'UTC')).toEqual({
      rows: [],
      coverage: { costedUnits: 0, totalUnits: 0, percentage: '0.00' },
    });
  });

  it('uses an exact same-day AutoCost for COGS and gross margin', () => {
    expect(aggregateProductRanking(
      [item('item-a', 'internal-a', 'product-a', 'Айран', '100.00')],
      [cost('internal-a', '2026-09-10', '25.00')],
      'revenue',
      'Europe/Moscow',
    )).toEqual({
      rows: [{
        rank: 1,
        productId: 'product-a',
        name: 'Айран',
        unitsSold: 1,
        revenue: '100.00',
        cogs: '25.00',
        grossMargin: '75.00',
        grossMarginRate: '75.00',
        currency: 'RUB',
      }],
      coverage: { costedUnits: 1, totalUnits: 1, percentage: '100.00' },
    });
  });

  it('uses the latest earlier cost when no same-day snapshot exists', () => {
    const result = aggregateProductRanking(
      [item('item-a', 'internal-a', 'product-a', 'Айран', '100.00', '2026-09-10T22:30:00.000Z')],
      [
        cost('internal-a', '2026-09-01', '20.00'),
        cost('internal-a', '2026-09-10', '25.00'),
        cost('internal-a', '2026-09-12', '90.00'),
      ],
      'revenue',
      'Europe/Moscow',
    );

    expect(result.rows[0]).toMatchObject({ cogs: '25.00', grossMargin: '75.00' });
  });

  it('deduplicates equal trade-area costs and fails closed on same-day conflicts', () => {
    const sale = [item('item-a', 'internal-a', 'product-a', 'Айран', '100.00')];
    expect(aggregateProductRanking(
      sale,
      [cost('internal-a', '2026-09-10', '25.00'), cost('internal-a', '2026-09-10', '25.00', 'area-b')],
      'cogs',
      'Europe/Moscow',
    ).rows[0]?.cogs).toBe('25.00');

    expect(() => aggregateProductRanking(
      sale,
      [cost('internal-a', '2026-09-10', '25.00'), cost('internal-a', '2026-09-10', '26.00', 'area-b')],
      'cogs',
      'Europe/Moscow',
    )).toThrowError(expect.objectContaining({ code: 'REPORT_COST_CONFLICT' }));
  });

  it('sorts COGS and gross margin descending with unknown values last and stable ties', () => {
    const sales = [
      item('item-a', 'internal-a', 'product-z', 'Яблоко', '100.00'),
      item('item-b', 'internal-b', 'product-a', 'Айран', '80.00'),
      item('item-c', 'internal-c', 'product-b', 'Борщ', '200.00'),
    ];
    const costs = [
      cost('internal-a', '2026-09-10', '20.00'),
      cost('internal-b', '2026-09-10', '20.00'),
    ];

    expect(aggregateProductRanking(sales, costs, 'cogs', 'UTC').rows.map((row) => row.productId))
      .toEqual(['product-a', 'product-z', 'product-b']);
    expect(aggregateProductRanking(sales, costs, 'grossMargin', 'UTC').rows.map((row) => row.productId))
      .toEqual(['product-z', 'product-a', 'product-b']);
  });

  it('fails closed when sold-item revenue is not RUB', () => {
    expect(() => aggregateProductRanking(
      [item('item-a', 'internal-a', 'product-a', 'Айран', '100.00', undefined, 'USD')],
      [cost('internal-a', '2026-09-10', '25.00')],
      'revenue',
      'UTC',
    )).toThrowError(expect.objectContaining({ code: 'REPORT_UNSUPPORTED_CURRENCY' }));
  });

  it('keeps partial and future-only costs unknown while reporting unit coverage', () => {
    const result = aggregateProductRanking(
      [
        item('item-a', 'internal-a', 'product-a', 'Айран', '40.00', '2026-09-09T12:00:00.000Z'),
        item('item-b', 'internal-a', 'product-a', 'Айран', '60.00', '2026-09-11T12:00:00.000Z'),
        item('item-c', 'internal-b', 'product-b', 'Борщ', '10.00', '2026-09-09T12:00:00.000Z'),
      ],
      [cost('internal-a', '2026-09-10', '20.00'), cost('internal-b', '2026-09-12', '5.00')],
      'revenue',
      'UTC',
    );

    expect(result.rows).toEqual([
      expect.objectContaining({ productId: 'product-a', cogs: null, grossMargin: null, grossMarginRate: null }),
      expect.objectContaining({ productId: 'product-b', cogs: null, grossMargin: null, grossMarginRate: null }),
    ]);
    expect(result.coverage).toEqual({ costedUnits: 1, totalUnits: 3, percentage: '33.33' });
  });

  it('rounds Decimal money and rate half-up and leaves a zero-revenue rate unknown', () => {
    const rounded = aggregateProductRanking(
      [item('item-a', 'internal-a', 'product-a', 'Айран', '100.00')],
      [cost('internal-a', '2026-09-10', '33.335')],
      'revenue',
      'UTC',
    );
    expect(rounded.rows[0]).toMatchObject({
      cogs: '33.34',
      grossMargin: '66.67',
      grossMarginRate: '66.67',
    });

    const zeroRevenue = aggregateProductRanking(
      [item('item-b', 'internal-a', 'product-a', 'Айран', '0.00')],
      [cost('internal-a', '2026-09-10', '1.00')],
      'revenue',
      'UTC',
    );
    expect(zeroRevenue.rows[0]?.grossMarginRate).toBeNull();
  });

  it('queries only current items whose orders fall inside local dates', async () => {
    const items = [item('item-a', 'internal-a', 'product-a', 'Айран', '100.00')];
    const findMany = vi.fn(async () => items);
    const costFindMany = vi.fn(async () => []);
    const prisma = {
      restaurant: { findUnique: vi.fn(async () => ({ timezone: 'Europe/Moscow' })) },
      orderItem: { findMany },
      productCostSnapshot: { findMany: costFindMany },
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
        productId: true,
        priceWithDiscountForOrder: true,
        currency: true,
        order: { select: { occurredAt: true } },
        product: { select: { sourceId: true, displayName: true } },
      },
    });
    expect(costFindMany).toHaveBeenCalledWith({
      where: {
        restaurantId: 'restaurant-a',
        productId: { in: ['internal-a'] },
        effectiveDate: { lte: new Date('2026-09-01T00:00:00.000Z') },
      },
      select: {
        productId: true,
        effectiveDate: true,
        autoCost: true,
        sourceTradeAreaId: true,
      },
    });
  });
});
