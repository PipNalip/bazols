import { Inject, Injectable } from '@nestjs/common';
import { formatInTimeZone } from 'date-fns-tz';

import { ApplicationError } from '../common/application.error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { PrismaService } from '../db/prisma.service.js';
import { SyncRunRepository } from './sync-run.repository.js';

export type CreateSyncInput = {
  restaurantId: string;
  beginDate: string;
  endDate: string;
};

function parseCalendarDate(value: string): Date | null {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) &&
    formatInTimeZone(parsed, 'UTC', 'yyyy-MM-dd') === value
    ? parsed
    : null;
}

function view(run: {
  id: string;
  restaurantId: string;
  beginDate: Date;
  endDate: Date;
  status: string;
  employeesCount: number;
  productsCount: number;
  ordersCount: number;
  orderItemsCount: number;
  productCostSnapshotsCount: number;
  materialCostSnapshotsCount: number;
  safeErrorCode: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}): Record<string, unknown> {
  return {
    id: run.id,
    restaurantId: run.restaurantId,
    beginDate: formatInTimeZone(run.beginDate, 'UTC', 'yyyy-MM-dd'),
    endDate: formatInTimeZone(run.endDate, 'UTC', 'yyyy-MM-dd'),
    status: run.status,
    employeesCount: run.employeesCount,
    productsCount: run.productsCount,
    ordersCount: run.ordersCount,
    orderItemsCount: run.orderItemsCount,
    productCostSnapshotsCount: run.productCostSnapshotsCount,
    materialCostSnapshotsCount: run.materialCostSnapshotsCount,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    ...(run.safeErrorCode ? { safeErrorCode: run.safeErrorCode } : {}),
  };
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: SyncRunRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async enqueue(
    input: CreateSyncInput,
    actorId: string,
    correlationId: string,
  ): Promise<Record<string, unknown>> {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: input.restaurantId, active: true },
    });
    if (!restaurant) {
      throw new ApplicationError('RESOURCE_NOT_FOUND', 404);
    }
    const beginDate = parseCalendarDate(input.beginDate);
    const endDate = parseCalendarDate(input.endDate);
    const today = formatInTimeZone(this.clock(), restaurant.timezone, 'yyyy-MM-dd');
    if (!beginDate || !endDate || input.beginDate > input.endDate || input.endDate > today) {
      throw new ApplicationError('INPUT_INVALID', 400);
    }

    const run = await this.repository.enqueue({
      restaurantId: restaurant.id,
      requestedById: actorId,
      beginDate,
      endDate,
      correlationId,
    });
    return view(run);
  }

  async get(id: string): Promise<Record<string, unknown>> {
    const run = await this.prisma.syncRun.findUnique({ where: { id } });
    if (!run) {
      throw new ApplicationError('RESOURCE_NOT_FOUND', 404);
    }
    return view(run);
  }

  async list(page: number, pageSize: number): Promise<Record<string, unknown>> {
    const [total, runs] = await this.prisma.$transaction([
      this.prisma.syncRun.count(),
      this.prisma.syncRun.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, items: runs.map(view) };
  }
}
