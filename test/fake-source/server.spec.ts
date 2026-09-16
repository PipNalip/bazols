import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';

import { startFakeSource } from './server.js';

describe('fake source server', () => {
  it('binds a requested port for real-process E2E use', async () => {
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const address = probe.address();
    if (!address || typeof address === 'string') throw new Error('Port probe failed');
    const requestedPort = address.port;
    await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));

    const source = await startFakeSource({ port: requestedPort });
    try {
      expect(new URL(source.url).hostname).toBe('127.0.0.1');
      expect(Number(new URL(source.url).port)).toBe(requestedPort);
    } finally {
      await source.close();
    }
  });
});
