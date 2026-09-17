import { describe, expect, it } from 'vitest';

import { healthResponseSchema, productRankingResponseSchema } from './index.js';

describe('health response contract', () => {
  it('accepts the public live health response', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok' }).success).toBe(true);
  });
});

describe('product ranking response contract', () => {
  it('accepts rows with complete margin data and exact coverage', () => {
    expect(productRankingResponseSchema.parse({
      rows: [{
        rank: 1,
        productId: 'product-a',
        name: 'Айран',
        unitsSold: 2,
        revenue: '125.50',
        cogs: '40.00',
        grossMargin: '85.50',
        grossMarginRate: '68.13',
        currency: 'RUB',
      }],
      coverage: { costedUnits: 2, totalUnits: 2, percentage: '100.00' },
    })).toBeTruthy();
  });

  it('accepts explicit unknown margin data', () => {
    const result = productRankingResponseSchema.parse({
      rows: [{
        rank: 1,
        productId: 'product-a',
        name: 'Айран',
        unitsSold: 1,
        revenue: '10.00',
        cogs: null,
        grossMargin: null,
        grossMarginRate: null,
        currency: 'RUB',
      }],
      coverage: { costedUnits: 0, totalUnits: 1, percentage: '0.00' },
    });
    expect(result.rows[0]?.cogs).toBeNull();
  });
});
