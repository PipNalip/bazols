import { describe, expect, it } from 'vitest';

import { healthResponseSchema } from './index.js';

describe('health response contract', () => {
  it('accepts the public live health response', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok' }).success).toBe(true);
  });
});
