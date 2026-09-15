import { describe, expect, it } from 'vitest';

import { LoginRateLimiter } from './rate-limiter.service.js';

describe('LoginRateLimiter', () => {
  it('blocks username rotation after the per-IP attempt limit', () => {
    const limiter = new LoginRateLimiter();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(limiter.consume('192.0.2.10', `user-${attempt}`, 1_000)).toBe(true);
    }

    expect(limiter.consume('192.0.2.10', 'rotated-user', 1_000)).toBe(false);
    expect(limiter.consume('192.0.2.11', 'rotated-user', 1_000)).toBe(true);
  });

  it('evicts expired buckets and never exceeds its configured bound', () => {
    const limiter = new LoginRateLimiter(2);

    expect(limiter.consume('192.0.2.1', 'first', 1_000)).toBe(true);
    expect(limiter.consume('192.0.2.2', 'second', 1_000)).toBe(true);
    expect(limiter.consume('192.0.2.3', 'third', 1_000)).toBe(true);
    expect(limiter.bucketCount).toBeLessThanOrEqual(2);

    expect(limiter.consume('192.0.2.4', 'fourth', 1_000 + 15 * 60 * 1_000)).toBe(true);
    expect(limiter.bucketCount).toBe(1);
  });
});
