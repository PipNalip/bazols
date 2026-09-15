import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

const generatedIds = new WeakMap<Request, string>();

export function correlationId(request: Request): string {
  const value = request.headers['x-correlation-id'];
  if (typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value)) {
    return value;
  }
  const existing = generatedIds.get(request);
  if (existing) return existing;
  const generated = randomUUID();
  generatedIds.set(request, generated);
  return generated;
}
