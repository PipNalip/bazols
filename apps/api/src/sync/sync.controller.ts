import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedRequest } from '../auth/auth-request.js';
import { CsrfGuard, OriginGuard, SessionGuard } from '../auth/auth.guards.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ApplicationError } from '../common/application.error.js';
import { createSyncRunSchema, syncHistoryQuerySchema } from './sync.dto.js';
import { SyncService } from './sync.service.js';

function correlationId(request: AuthenticatedRequest): string {
  const value = request.headers['x-correlation-id'];
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value)
    ? value
    : randomUUID();
}

async function mapApplicationError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ApplicationError) {
      throw new HttpException({ code: error.code, message: error.code }, error.status);
    }
    throw error;
  }
}

@Controller('/api/sync-runs')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post()
  @HttpCode(202)
  @UseGuards(OriginGuard, CsrfGuard)
  enqueue(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<unknown> {
    const parsed = createSyncRunSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid sync request');
    }
    return mapApplicationError(() =>
      this.sync.enqueue(parsed.data, request.authUser!.id, correlationId(request)),
    );
  }

  @Get()
  list(@Query() query: unknown): Promise<unknown> {
    const parsed = syncHistoryQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException('Invalid pagination');
    }
    return this.sync.list(parsed.data.page, parsed.data.pageSize);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<unknown> {
    return mapApplicationError(() => this.sync.get(id));
  }
}
