import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SourceError } from '../source/source.errors.js';
import { parseEmployeeRatingResponse } from '../source/source.schemas.js';
import { normalizePage } from './normalizer.js';

function ratingFixture(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), 'test/fixtures/source/employees-rating.success.json'),
      'utf8',
    ),
  ) as Record<string, unknown>;
}

describe('normalizePage', () => {
  it('maps the fixture into unique employees, products, orders and discounted items', () => {
    const result = normalizePage(parseEmployeeRatingResponse(ratingFixture()));

    expect(result.employees).toHaveLength(2);
    expect(result.products).toHaveLength(2);
    expect(result.orders).toHaveLength(3);
    expect(result.items).toHaveLength(4);
    expect(result.items[0]).toMatchObject({
      priceWithDiscountForOrder: '50.00',
      productSourceId: '50000000-0000-4000-8000-000000000001',
    });
  });

  it('rejects duplicate item IDs inside one payload', () => {
    const payload = ratingFixture();
    const rows = (payload.data as { rows: Array<{ orders: Array<{ items: Array<{ id: string }> }> }> })
      .rows;
    const firstId = rows[0]?.orders[0]?.items[0]?.id;
    const secondItem = rows[0]?.orders[0]?.items[1];
    if (!firstId || !secondItem) {
      throw new Error('Fixture setup is invalid');
    }
    secondItem.id = firstId;

    expect(() => normalizePage(parseEmployeeRatingResponse(payload))).toThrow(
      expect.objectContaining<Partial<SourceError>>({ code: 'SOURCE_DUPLICATE_ID' }),
    );
  });

  it('rejects conflicting product names for one source ID', () => {
    const payload = ratingFixture();
    const rows = (payload.data as {
      rows: Array<{
        orders: Array<{ items: Array<{ product: { id: string; name: string } }> }>;
      }>;
    }).rows;
    const repeatedProduct = rows[0]?.orders[1]?.items[0]?.product;
    if (!repeatedProduct) {
      throw new Error('Fixture setup is invalid');
    }
    repeatedProduct.name = 'Synthetic Conflicting Tea';

    expect(() => normalizePage(parseEmployeeRatingResponse(payload))).toThrow(
      expect.objectContaining<Partial<SourceError>>({ code: 'SOURCE_DUPLICATE_ID' }),
    );
  });
});
