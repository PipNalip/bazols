import { describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { parseAppEnv } from '../src/config/env.schema.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://bazols:bazols-local-only@127.0.0.1:5432/bazols';

describe('configured API module', () => {
  it('resolves the full DI graph and keeps health public', async () => {
    const env = parseAppEnv({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: 'synthetic-integration-session-secret',
      APP_ORIGIN: 'http://app.example.invalid',
      RAW_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      SOURCE_SITE_URL: 'http://127.0.0.1:1',
      SOURCE_SITE_LOGIN: 'source-login',
      SOURCE_SITE_PASSWORD: 'source-password',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.configure(env)],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).get('/health/live').expect(200, { status: 'ok' });
    const unauthorized = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('X-Correlation-ID', 'app-error-correlation')
      .expect(401);
    expect(unauthorized.body).toMatchObject({
      message: 'Authentication required',
      correlationId: 'app-error-correlation',
    });

    await app.close();
  });
});
