import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { addDays, parseISO } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

import { ApplicationError } from '../common/application.error.js';
import { PrismaService } from '../db/prisma.service.js';

export type EmployeeRankingSort = 'revenue' | 'ordersCount' | 'averageCheque';

type EmployeeOrder = {
  sourceId: string;
  price: Prisma.Decimal;
  currency: string;
  employee: { sourceId: string; displayName: string };
};

type EmployeeAccumulator = {
  employeeId: string;
  name: string;
  revenue: Prisma.Decimal;
  orderIds: Set<string>;
  currency: string;
};

export type EmployeeRankingRow = {
  rank: number;
  employeeId: string;
  name: string;
  revenue: string;
  ordersCount: number;
  averageCheque: string;
  currency: string;
};

const nameCollator = new Intl.Collator('ru', { sensitivity: 'base' });

function money(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}

export function aggregateEmployeeRanking(
  orders: EmployeeOrder[],
  sort: EmployeeRankingSort,
): EmployeeRankingRow[] {
  const employees = new Map<string, EmployeeAccumulator>();
  for (const order of orders) {
    const current = employees.get(order.employee.sourceId) ?? {
      employeeId: order.employee.sourceId,
      name: order.employee.displayName,
      revenue: new Prisma.Decimal(0),
      orderIds: new Set<string>(),
      currency: order.currency,
    };
    if (current.currency !== order.currency) {
      throw new ApplicationError('REPORT_CURRENCY_CONFLICT', 409);
    }
    if (!current.orderIds.has(order.sourceId)) {
      current.orderIds.add(order.sourceId);
      current.revenue = current.revenue.plus(order.price);
    }
    employees.set(order.employee.sourceId, current);
  }

  const rows = [...employees.values()].map((employee) => {
    const ordersCount = employee.orderIds.size;
    const averageCheque =
      ordersCount === 0 ? new Prisma.Decimal(0) : employee.revenue.dividedBy(ordersCount);
    return {
      employeeId: employee.employeeId,
      name: employee.name,
      revenueDecimal: employee.revenue,
      ordersCount,
      averageChequeDecimal: averageCheque,
      currency: employee.currency,
    };
  });

  rows.sort((left, right) => {
    const metric =
      sort === 'ordersCount'
        ? right.ordersCount - left.ordersCount
        : sort === 'averageCheque'
          ? right.averageChequeDecimal.comparedTo(left.averageChequeDecimal)
          : right.revenueDecimal.comparedTo(left.revenueDecimal);
    if (metric !== 0) return metric;
    const byName = nameCollator.compare(left.name, right.name);
    return byName !== 0 ? byName : left.employeeId.localeCompare(right.employeeId);
  });

  return rows.map((row, index) => ({
    rank: index + 1,
    employeeId: row.employeeId,
    name: row.name,
    revenue: money(row.revenueDecimal),
    ordersCount: row.ordersCount,
    averageCheque: money(row.averageChequeDecimal),
    currency: row.currency,
  }));
}

@Injectable()
export class EmployeeRankingService {
  constructor(private readonly prisma: PrismaService) {}

  async get(
    restaurantId: string,
    from: string,
    to: string,
    sort: EmployeeRankingSort,
  ): Promise<EmployeeRankingRow[]> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    if (!restaurant) {
      throw new ApplicationError('RESOURCE_NOT_FOUND', 404);
    }
    const start = fromZonedTime(parseISO(from), restaurant.timezone);
    const endExclusive = fromZonedTime(addDays(parseISO(to), 1), restaurant.timezone);
    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        isCurrent: true,
        occurredAt: { gte: start, lt: endExclusive },
      },
      select: {
        sourceId: true,
        price: true,
        currency: true,
        employee: { select: { sourceId: true, displayName: true } },
      },
    });
    return aggregateEmployeeRanking(orders, sort);
  }
}
