import 'reflect-metadata';

import { z } from 'zod';

import { PasswordService } from './auth/password.service.js';
import { PrismaService } from './db/prisma.service.js';

const usernameSchema = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/);
const passwordSchema = z.string().min(12).max(1_024);

async function readPassword(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error('Password must be provided through stdin');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

let prisma: PrismaService | undefined;

try {
  const username = usernameSchema.parse(process.argv[2]).toLowerCase();
  const password = passwordSchema.parse(await readPassword());
  const databaseUrl = z.string().min(1).parse(process.env.DATABASE_URL);
  prisma = new PrismaService(databaseUrl);
  await prisma.$connect();
  const passwordHash = await new PasswordService().hash(password);
  await prisma.user.create({
    data: { username, passwordHash, role: 'ADMIN' },
  });
  console.log('Administrator created');
} catch {
  console.error('Administrator could not be created');
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect();
}
