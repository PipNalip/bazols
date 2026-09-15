import 'reflect-metadata';

import { setTimeout as delay } from 'node:timers/promises';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { parseAppEnv } from './config/env.schema.js';
import { SyncWorker } from './sync/sync.worker.js';

const env = parseAppEnv(process.env);
const app = await NestFactory.createApplicationContext(AppModule.configure(env));
const worker = app.get(SyncWorker);
let stopping = false;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopping = true;
  });
}

try {
  while (!stopping) {
    try {
      const worked = await worker.runOnce();
      if (!worked) {
        await delay(1_000);
      }
    } catch {
      console.error('Sync worker iteration failed');
      await delay(1_000);
    }
  }
} finally {
  await app.close();
}
