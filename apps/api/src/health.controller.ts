import { Controller, Get, Optional, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from './db/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  @Get('live')
  live() {
    return { status: 'ok' as const };
  }

  @Get('ready')
  async ready() {
    if (!this.prisma) {
      throw new ServiceUnavailableException('Database unavailable');
    }

    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { status: 'ok' as const };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
