import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

const app = await NestFactory.create(AppModule);
const port = Number(process.env.PORT ?? 8000);
await app.listen(port, '127.0.0.1');
