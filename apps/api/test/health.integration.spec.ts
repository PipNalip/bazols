import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/db/prisma.service.js';
import { HealthController } from '../src/health.controller.js';

describe('GET /health/live', () => {
  it('returns the shared live health contract', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(response.body).toEqual({ status: 'ok' });

    await app.close();
  });
});

describe('GET /health/ready', () => {
  it('returns ok when the database query succeeds', async () => {
    const query = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { $queryRawUnsafe: query } }],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).get('/health/ready').expect(200, { status: 'ok' });
    expect(query).toHaveBeenCalledWith('SELECT 1');

    await app.close();
  });

  it('returns 503 when the database query fails', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRawUnsafe: vi.fn().mockRejectedValue(new Error('db unavailable')) },
        },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).get('/health/ready').expect(503);

    await app.close();
  });
});
