import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AuditService } from './audit/audit.service.js';
import { AuthController } from './auth/auth.controller.js';
import { CsrfGuard, OriginGuard, SessionGuard } from './auth/auth.guards.js';
import { PasswordService } from './auth/password.service.js';
import { LoginRateLimiter } from './auth/rate-limiter.service.js';
import { RolesGuard } from './auth/roles.guard.js';
import { SessionService } from './auth/session.service.js';
import { APP_ORIGIN, COOKIE_SECURE } from './auth/tokens.js';
import { CLOCK } from './common/clock.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import type { AppEnv } from './config/env.schema.js';
import { APP_ENV } from './config/tokens.js';
import { PrismaService } from './db/prisma.service.js';
import { HealthController } from './health.controller.js';
import { EmployeeRankingService } from './reports/employee-ranking.service.js';
import { ProductRankingService } from './reports/product-ranking.service.js';
import { ReportsController } from './reports/reports.controller.js';
import { RestaurantAccessService } from './restaurants/restaurant-access.service.js';
import { RestaurantsController } from './restaurants/restaurants.controller.js';
import { RestaurantsService } from './restaurants/restaurants.service.js';
import { SourceDiscoveryController } from './restaurants/source-discovery.controller.js';
import { SourceConnectorFactory } from './source/source-connector.factory.js';
import { ImportPageService } from './sync/import-page.service.js';
import { RawSnapshotRepository } from './sync/raw-snapshot.repository.js';

import { SourceSyncProcessor } from './sync/source-sync.processor.js';
import { SyncController } from './sync/sync.controller.js';
import { SyncRunRepository } from './sync/sync-run.repository.js';
import { SyncService } from './sync/sync.service.js';
import { SYNC_RUN_PROCESSOR, SyncWorker } from './sync/sync.worker.js';
import { UsersController } from './users/users.controller.js';
import { UsersService } from './users/users.service.js';

@Module({ controllers: [HealthController] })
export class AppModule {
  static configure(env: AppEnv): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        AuthController,
        RestaurantsController,
        SourceDiscoveryController,
        SyncController,
        UsersController,
        ReportsController,
      ],
      providers: [
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_ENV, useValue: env },
        { provide: APP_ORIGIN, useValue: env.APP_ORIGIN },
        { provide: COOKIE_SECURE, useValue: env.NODE_ENV === 'production' },
        { provide: CLOCK, useValue: () => new Date() },
        {
          provide: PrismaService,
          useFactory: () => new PrismaService(env.DATABASE_URL),
        },
        PasswordService,
        {
          provide: SessionService,
          inject: [PrismaService],
          useFactory: (prisma: PrismaService) =>
            new SessionService(prisma, env.SESSION_SECRET),
        },
        {
          provide: SourceConnectorFactory,
          useFactory: () =>
            new SourceConnectorFactory({
              baseUrl: env.SOURCE_SITE_URL,
              login: env.SOURCE_SITE_LOGIN,
              password: env.SOURCE_SITE_PASSWORD,
              allowInsecureForTests: env.NODE_ENV === 'test',
              ...(env.NODE_ENV === 'test' ? { insecureTestHostname: 'fake-source' } : {}),
            }),
        },
        {
          provide: RawSnapshotRepository,
          inject: [PrismaService],
          useFactory: (prisma: PrismaService) =>
            new RawSnapshotRepository(
              prisma,
              Buffer.from(env.RAW_DATA_ENCRYPTION_KEY, 'base64'),
            ),
        },
        {
          provide: ImportPageService,
          inject: [PrismaService, RawSnapshotRepository],
          useFactory: (prisma: PrismaService, snapshots: RawSnapshotRepository) =>
            new ImportPageService(prisma, snapshots),
        },

        AuditService,
        LoginRateLimiter,
        OriginGuard,
        SessionGuard,
        CsrfGuard,
        RolesGuard,
        RestaurantAccessService,
        EmployeeRankingService,
        ProductRankingService,
        RestaurantsService,
        SyncRunRepository,
        SyncService,
        {
          provide: SourceSyncProcessor,
          inject: [PrismaService, SourceConnectorFactory, ImportPageService],
          useFactory: (
            prisma: PrismaService,
            sourceFactory: SourceConnectorFactory,
            importer: ImportPageService,
          ) => new SourceSyncProcessor(prisma, sourceFactory, importer),
        },
        { provide: SYNC_RUN_PROCESSOR, useExisting: SourceSyncProcessor },
        SyncWorker,
        UsersService,
      ],
      exports: [PrismaService, SyncWorker],
    };
  }
}
