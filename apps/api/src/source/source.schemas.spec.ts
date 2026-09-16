import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SourceError } from './source.errors.js';
import {
  parseEmployeeRatingResponse,
  parsePermissionsResponse,
  parseProductCatalogResponse,
  parseProductTechnicalCardSummaryResponse,
  parseProductionMaterialsResponse,
  parseTechnicalCardsResponse,
} from './source.schemas.js';

const fixtureRoot = join(process.cwd(), 'test/fixtures/source');

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureRoot, name), 'utf8')) as unknown;
}

function validRating(): Record<string, unknown> {
  return structuredClone(fixture('employees-rating.success.json')) as Record<string, unknown>;
}

function expectSourceCode(run: () => unknown, code: string): void {
  expect(run).toThrow(SourceError);
  expect(run).toThrow(expect.objectContaining({ code }));
}

describe('source response schemas', () => {
  it('accepts product catalog data and rejects missing product identity', () => {
    expect(parseProductCatalogResponse(fixture('products.success.json'))).toHaveLength(1);
    expect(parseProductCatalogResponse(fixture('products.empty.json'))).toEqual([]);
    expectSourceCode(
      () => parseProductCatalogResponse(fixture('products.invalid.json')),
      'SOURCE_CONTRACT_INVALID',
    );
  });

  it('accepts the production material contract used by technical cards', () => {
    expect(
      parseProductionMaterialsResponse(fixture('production-materials.success.json')),
    ).toHaveLength(1);

    const invalid = structuredClone(
      fixture('production-materials.success.json'),
    ) as Array<Record<string, unknown>>;
    delete invalid[0]?.id;
    expectSourceCode(
      () => parseProductionMaterialsResponse(invalid),
      'SOURCE_CONTRACT_INVALID',
    );
  });

  it('accepts the product technical-card summary contract', () => {
    expect(
      parseProductTechnicalCardSummaryResponse(
        fixture('product-technical-card-summary.success.json'),
      ).data,
    ).toMatchObject({
      productId: '60000000-0000-4000-8000-000000000001',
      areTechnicalCardsExists: true,
    });

    const missingId = structuredClone(
      fixture('product-technical-card-summary.success.json'),
    ) as { data: Record<string, unknown> };
    delete missingId.data.productId;
    expectSourceCode(
      () => parseProductTechnicalCardSummaryResponse(missingId),
      'SOURCE_CONTRACT_INVALID',
    );

    const contradictoryEnvelope = structuredClone(
      fixture('product-technical-card-summary.success.json'),
    ) as Record<string, unknown>;
    contradictoryEnvelope.isFailed = true;
    expectSourceCode(
      () => parseProductTechnicalCardSummaryResponse(contradictoryEnvelope),
      'SOURCE_RESPONSE_UNSUCCESSFUL',
    );
  });

  it('accepts empty technical cards and rejects a card without identity', () => {
    expect(
      parseTechnicalCardsResponse(fixture('technical-cards.success.json')).data.cards,
    ).toHaveLength(1);
    expect(parseTechnicalCardsResponse(fixture('technical-cards.empty.json')).data).toEqual({
      cards: [],
      totalrows: 0,
    });
    expectSourceCode(
      () => parseTechnicalCardsResponse(fixture('technical-cards.invalid.json')),
      'SOURCE_CONTRACT_INVALID',
    );
  });

  it('accepts the valid permissions and rating fixtures while retaining unknown fields', () => {
    const permissions = parsePermissionsResponse(fixture('permissions.success.json'));
    const response = validRating();
    const data = response.data as Record<string, unknown>;
    data.sourceMetadata = { retained: true };

    const rating = parseEmployeeRatingResponse(response);

    expect(permissions.data.units[0]).toMatchObject({
      id: '10000000-0000-4000-8000-000000000001',
      roles: ['SYNTHETIC_REPORT_VIEWER'],
    });
    expect(rating.data).toMatchObject({ sourceMetadata: { retained: true }, totalRows: 2 });
  });

  it('normalizes the current numeric-role permissions contract', () => {
    expect(parsePermissionsResponse(fixture('permissions.current.json')).data.units).toEqual([
      {
        id: '10000000-0000-4000-8000-000000000001',
        roles: ['1', '3'],
      },
    ]);
  });

  it('rejects a missing order ID', () => {
    expectSourceCode(
      () => parseEmployeeRatingResponse(fixture('employees-rating.invalid.json')),
      'SOURCE_CONTRACT_INVALID',
    );
  });

  it('rejects invalid money', () => {
    const response = validRating();
    const firstOrder = ((response.data as { rows: Array<{ orders: unknown[] }> }).rows[0]
      ?.orders[0] ?? {}) as { price?: { value?: string } };
    firstOrder.price = { value: 'one hundred' };

    expectSourceCode(
      () => parseEmployeeRatingResponse(response),
      'SOURCE_CONTRACT_INVALID',
    );
  });

  it('rejects an invalid order date before persistence', () => {
    const response = validRating();
    const firstOrder = ((response.data as { rows: Array<{ orders: unknown[] }> }).rows[0]
      ?.orders[0] ?? {}) as { date?: string };
    firstOrder.date = 'not-a-date';

    expectSourceCode(
      () => parseEmployeeRatingResponse(response),
      'SOURCE_CONTRACT_INVALID',
    );
  });

  it('rejects a missing items array', () => {
    const response = validRating();
    const firstOrder = ((response.data as { rows: Array<{ orders: unknown[] }> }).rows[0]
      ?.orders[0] ?? {}) as Record<string, unknown>;
    delete firstOrder.items;

    expectSourceCode(
      () => parseEmployeeRatingResponse(response),
      'SOURCE_CONTRACT_INVALID',
    );
  });

  it('rejects an unsuccessful source envelope', () => {
    expectSourceCode(
      () => parseEmployeeRatingResponse({ isSuccess: false, data: null }),
      'SOURCE_RESPONSE_UNSUCCESSFUL',
    );
  });

  it('rejects item totals that differ from the order by more than one cent', () => {
    const response = validRating();
    const firstOrder = ((response.data as { rows: Array<{ orders: unknown[] }> }).rows[0]
      ?.orders[0] ?? {}) as { price: { value: string } };
    firstOrder.price.value = '100.02';

    expectSourceCode(
      () => parseEmployeeRatingResponse(response),
      'SOURCE_MONEY_MISMATCH',
    );
  });
});
