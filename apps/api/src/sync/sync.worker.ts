import type { SyncRun } from '@prisma/client';
import { Inject, Injectable } from '@nestjs/common';

import { type SourceErrorCode } from '../source/source.errors.js';
import { SyncRunRepository } from './sync-run.repository.js';

export type SyncRunProcessor = {
  process(run: SyncRun): Promise<'completed' | void>;
};

export const SYNC_RUN_PROCESSOR = Symbol('SYNC_RUN_PROCESSOR');

const SOURCE_ERROR_CODES = new Set<SourceErrorCode>([
  'SOURCE_AUTH_FAILED',
  'SOURCE_CONTRACT_INVALID',
  'SOURCE_DUPLICATE_ID',
  'SOURCE_EMPTY_UNEXPECTED',
  'SOURCE_MONEY_MISMATCH',
  'SOURCE_OPERATION_UNKNOWN',
  'SOURCE_PAGINATION_INVALID',
  'SOURCE_REDIRECT_BLOCKED',
  'SOURCE_RESPONSE_UNSUCCESSFUL',
  'SOURCE_TRANSPORT_FAILED',
  'SOURCE_UNIT_UNAVAILABLE',
]);

function safeFailureCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    SOURCE_ERROR_CODES.has(error.code as SourceErrorCode)
  ) {
    return error.code;
  }
  return 'SYNC_PROCESSING_FAILED';
}

@Injectable()
export class SyncWorker {
  constructor(
    private readonly repository: SyncRunRepository,
    @Inject(SYNC_RUN_PROCESSOR) private readonly processor: SyncRunProcessor,
  ) {}

  async runOnce(): Promise<boolean> {
    await this.repository.recoverStale();
    const run = await this.repository.claimNext();
    if (!run) {
      return false;
    }

    const heartbeat = setInterval(() => {
      void this.repository.heartbeat(run.id).catch(() => undefined);
    }, 30_000);
    heartbeat.unref();

    try {
      const outcome = await this.processor.process(run);
      if (outcome !== 'completed') {
        await this.repository.succeed(run.id);
      }
    } catch (error) {
      await this.repository.fail(run.id, safeFailureCode(error));
    } finally {
      clearInterval(heartbeat);
    }
    return true;
  }
}
