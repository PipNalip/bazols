import { Injectable } from '@nestjs/common';
import type { SyncRun } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';

import { PrismaService } from '../db/prisma.service.js';
import { SourceError } from '../source/source.errors.js';
import { SourceConnectorFactory } from '../source/source-connector.factory.js';
import { ImportPageService } from './import-page.service.js';
import { SourceIngestionService } from './source-ingestion.service.js';
import type { SyncRunProcessor } from './sync.worker.js';

const SOURCE_PAGE_SIZE = 100;

@Injectable()
export class SourceSyncProcessor implements SyncRunProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceFactory: SourceConnectorFactory,
    private readonly importer: ImportPageService,
  ) {}

  async process(run: SyncRun): Promise<'completed'> {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: run.restaurantId, active: true },
    });
    if (!restaurant) {
      throw new SourceError('SOURCE_UNIT_UNAVAILABLE');
    }
    const ingestion = new SourceIngestionService(this.sourceFactory.create(), this.importer);
    await ingestion.run({
      syncRunId: run.id,
      restaurantId: restaurant.id,
      sourceUnitId: restaurant.sourceUnitId,
      sourceRole: restaurant.sourceRole,
      timezone: restaurant.timezone,
      beginDate: formatInTimeZone(run.beginDate, 'UTC', 'yyyy-MM-dd'),
      endDate: formatInTimeZone(run.endDate, 'UTC', 'yyyy-MM-dd'),
      pageSize: SOURCE_PAGE_SIZE,
      correlationId: `worker:${run.id}`,
      markSucceeded: true,
    });
    return 'completed';
  }
}
