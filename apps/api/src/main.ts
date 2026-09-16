import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { parseAppEnv } from './config/env.schema.js';

const env = parseAppEnv(process.env);
const app = await NestFactory.create(AppModule.configure(env));
app.enableCors({
  origin: env.APP_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Correlation-ID'],
});
const port = Number(process.env.PORT ?? 8000);
const host = process.env.HOST ?? '127.0.0.1';
await app.listen(port, host);
