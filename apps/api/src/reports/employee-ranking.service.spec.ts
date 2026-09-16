import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  EmployeeRankingService,
  aggregateEmployeeRanking,
} from './employee-ranking.service.js';

const orders = [
  {
    sourceId: 'order-a',
    price: new Prisma.Decimal('40.10'),
    currency: 'RUB',
    employee: { sourceId: 'employee-b', displayName: 'Борис' },
  },
  {
    sourceId: 'order-b',
    price: new Prisma.Decimal('60.10'),
    currency: 'RUB',
    employee: { sourceId: 'employee-b', displayName: 'Борис' },
  },
  {
    sourceId: 'order-c',
    price: new Prisma.Decimal('100.20'),
    currency: 'RUB',
    employee: { sourceId: 'employee-a', displayName: 'Анна' },
  },
];

describe('employee ranking', () => {
  it('calculates decimal metrics and applies a stable name/source tie-break', () => {
    expect(aggregateEmployeeRanking(orders, 'revenue')).toEqual([
      {
        rank: 1,
        employeeId: 'employee-a',
        name: 'Анна',
        revenue: '100.20',
        ordersCount: 1,
        averageCheque: '100.20',
        currency: 'RUB',
      },
      {
        rank: 2,
        employeeId: 'employee-b',
        name: 'Борис',
        revenue: '100.20',
        ordersCount: 2,
        averageCheque: '50.10',
        currency: 'RUB',
      },
    ]);
  });

  it('supports order-count and average-cheque sorting', () => {
    expect(aggregateEmployeeRanking(orders, 'ordersCount').map((row) => row.employeeId)).toEqual([
      'employee-b',
      'employee-a',
    ]);
    expect(
      aggregateEmployeeRanking(orders, 'averageCheque').map((row) => row.employeeId),
    ).toEqual(['employee-a', 'employee-b']);
  });

  it('queries only current orders inside inclusive restaurant-local dates', async () => {
    const findMany = vi.fn(async () => orders);
    const prisma = {
      restaurant: {
        findUnique: vi.fn(async () => ({ timezone: 'Europe/Moscow' })),
      },
      order: { findMany },
    } as never;
    const service = new EmployeeRankingService(prisma);

    await service.get('restaurant-a', '2026-09-01', '2026-09-01', 'revenue');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        restaurantId: 'restaurant-a',
        isCurrent: true,
        occurredAt: {
          gte: new Date('2026-08-31T21:00:00.000Z'),
          lt: new Date('2026-09-01T21:00:00.000Z'),
        },
      },
      select: {
        sourceId: true,
        price: true,
        currency: true,
        employee: { select: { sourceId: true, displayName: true } },
      },
    });
  });
});
