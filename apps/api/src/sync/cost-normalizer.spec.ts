import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseMaterialAutoCostsResponse,
  parseProductAutoCostsResponse,
} from '../source/source.schemas.js';
import { normalizeCosts } from './cost-normalizer.js';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/source', name), 'utf8'));
}

const input = {
  sourceUnitId: '70000000-0000-4000-8000-000000000001',
  productDate: '2026-09-16',
  beginDate: '2026-09-01',
  endDate: '2026-09-30',
};

describe('normalizeCosts', () => {
  it('preserves exact decimal text and source dimensions', () => {
    const result = normalizeCosts(
      [parseProductAutoCostsResponse(fixture('product-costs.success.json'))],
      [parseMaterialAutoCostsResponse(fixture('material-costs.success.json'))],
      input,
    );

    expect(result.productCosts).toEqual([
      expect.objectContaining({
        productSourceId: '60000000-0000-4000-8000-000000000001',
        autoCost: '120.500001',
        reportedPrice: '199',
        effectiveDate: new Date('2026-09-16T00:00:00.000Z'),
      }),
    ]);
    expect(result.materialCosts).toEqual([
      expect.objectContaining({
        materialSourceId: '80000000-0000-4000-8000-000000000001',
        autoCost: '42.25',
        sourceCurrencyCode: 1,
      }),
    ]);
  });

  it('keeps another unit as unknown instead of fabricating zero', () => {
    expect(
      normalizeCosts(
        [parseProductAutoCostsResponse(fixture('product-costs.success.json'))],
        [parseMaterialAutoCostsResponse(fixture('material-costs.success.json'))],
        { ...input, sourceUnitId: '70000000-0000-4000-8000-000000000099' },
      ),
    ).toEqual({ productCosts: [], materialCosts: [] });
  });

  it('rejects duplicate dimensions and material dates outside the run', () => {
    const product = parseProductAutoCostsResponse(fixture('product-costs.success.json'));
    product.values.push(structuredClone(product.values[0]!));
    expect(() => normalizeCosts([product], [], input)).toThrowError(
      expect.objectContaining({ code: 'SOURCE_DUPLICATE_ID' }),
    );

    const material = parseMaterialAutoCostsResponse(fixture('material-costs.success.json'));
    material.data.values[0]!.autoCostMaterialViewsByDates[0]!.date = '2026-10-01T00:00:00.000Z';
    expect(() => normalizeCosts([], [material], input)).toThrowError(
      expect.objectContaining({ code: 'SOURCE_CONTRACT_INVALID' }),
    );
  });
});
