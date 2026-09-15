import { Controller, Get, HttpException, Req, UseGuards } from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedRequest } from '../auth/auth-request.js';
import { SessionGuard } from '../auth/auth.guards.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { correlationId } from '../common/correlation.js';
import { SourceConnectorFactory } from '../source/source-connector.factory.js';
import { SourceError } from '../source/source.errors.js';

@Controller('/api/source-discovery')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
export class SourceDiscoveryController {
  constructor(
    private readonly sourceFactory: SourceConnectorFactory,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async discover(@Req() request: AuthenticatedRequest) {
    try {
      const requestCorrelationId = correlationId(request);
      const units = await this.sourceFactory.create().discover(requestCorrelationId);
      await this.audit.record({
        actorId: request.authUser!.id,
        eventType: 'SOURCE_DISCOVERY_COMPLETED',
        correlationId: requestCorrelationId,
        safeMetadata: { unitCount: units.length },
      });
      return { units };
    } catch (error) {
      if (error instanceof SourceError) {
        throw new HttpException({ code: error.code, message: error.code }, 502);
      }
      throw error;
    }
  }
}
