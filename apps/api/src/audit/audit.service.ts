import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../db/prisma.service.js';

export type AuditInput = {
  actorId?: string;
  eventType: string;
  restaurantId?: string;
  syncRunId?: string;
  correlationId: string;
  safeMetadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    await this.prisma.auditEvent.create({ data: input });
  }
}
