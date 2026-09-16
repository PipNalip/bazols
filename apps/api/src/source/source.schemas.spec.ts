import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SourceError } from './source.errors.js';
import {
  parseEmployeeRatingResponse,
  parseMaterialAutoCostsResponse,
  parseMaterialSuppliesResponse,
  parsePermissionsResponse,
  parseProductAutoCostsResponse,
  parseProductCatalogResponse,
  parseProductTechnicalCardSummaryResponse,
  parseProductionMaterialsResponse,
  parseSupplyDepartmentsResponse,
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
  it('accepts product AutoCost rows and rejects a row without product identity', () => {
    expect(parseProductAutoCostsResponse(fixture('product-costs.success.json')).values).toHaveLength(
      1,
    );
    expect(parseProductAutoCostsResponse(fixture('product-costs.empty.json'))).toEqual({
      totalRows: 0,
      values: [],
    });

    const invalid = structuredClone(fixture('product-costs.success.json')) as {
      values: Array<Record<string, unknown>>;
    };
    delete invalid.values[0]?.productId;
    expectSourceCode(
      () => parseProductAutoCostsResponse(invalid),
      'SOURCE_CONTRACT_INVALID',
    );

    const nonfinitePrice = structuredClone(fixture('product-costs.success.json')) as {
      values: Array<{ autoCostProductByTradeArea: Array<{ price: number }> }>;
    };
    nonfinitePrice.values[0]!.autoCostProductByTradeArea[0]!.price = Number.NaN;
    expectSourceCode(
      () => parseProductAutoCostsResponse(nonfinitePrice),
      'SOURCE_CONTRACT_INVALID',
    );
  });

  it('accepts material AutoCost history and fails closed on invalid rows and envelopes', () => {
    expect(
      parseMaterialAutoCostsResponse(fixture('material-costs.success.json')).data.values,
    ).toHaveLength(1);
    expect(parseMaterialAutoCostsResponse(fixture('material-costs.empty.json')).data.values).toEqual(
      [],
    );

    const invalid = structuredClone(fixture('material-costs.success.json')) as {
      data: { values: Array<Record<string, unknown>> };
    };
    delete invalid.data.values[0]?.materialId;
    expectSourceCode(
      () => parseMaterialAutoCostsResponse(invalid),
      'SOURCE_CONTRACT_INVALID',
    );

    const impossibleDate = structuredClone(fixture('material-costs.success.json')) as {
      data: {
        values: Array<{ autoCostMaterialViewsByDates: Array<{ date: string }> }>;
      };
    };
    impossibleDate.data.values[0]!.autoCostMaterialViewsByDates[0]!.date =
      '2026-02-30T00:00:00.000Z';
    expectSourceCode(
      () => parseMaterialAutoCostsResponse(impossibleDate),
      'SOURCE_CONTRACT_INVALID',
    );

    const negativeCost = structuredClone(fixture('material-costs.success.json')) as {
      data: {
        values: Array<{
          autoCostMaterialViewsByDates: Array<{
            autoCostMaterialViews: Array<{ autoCost: number }>;
          }>;
        }>;
      };
    };
    negativeCost.data.values[0]!.autoCostMaterialViewsByDates[0]!.autoCostMaterialViews[0]!.autoCost =
      -1;
    expectSourceCode(
      () => parseMaterialAutoCostsResponse(negativeCost),
      'SOURCE_CONTRACT_INVALID',
    );

    const contradictoryEnvelope = structuredClone(
      fixture('material-costs.success.json'),
    ) as Record<string, unknown>;
    contradictoryEnvelope.isFailed = true;
    expectSourceCode(
      () => parseMaterialAutoCostsResponse(contradictoryEnvelope),
      'SOURCE_RESPONSE_UNSUCCESSFUL',
    );
  });

  it('accepts supply departments and rejects a department without identity', () => {
    expect(
      parseSupplyDepartmentsResponse(fixture('supply-departments.success.json')),
    ).toHaveLength(1);
    expect(parseSupplyDepartmentsResponse(fixture('supply-departments.empty.json'))).toEqual([]);

    const invalid = structuredClone(fixture('supply-departments.success.json')) as Array<
      Record<string, unknown>
    >;
    delete invalid[0]?.Value;
    expectSourceCode(
      () => parseSupplyDepartmentsResponse(invalid),
      'SOURCE_CONTRACT_INVALID',
    );
  });

  it('accepts material supply prices and fails closed on invalid or failed envelopes', () => {
    expect(
      parseMaterialSuppliesResponse(fixture('material-supplies.success.json')).Data
        .MaterialSupplies,
    ).toHaveLength(1);
    expect(
      parseMaterialSuppliesResponse(fixture('material-supplies.empty.json')).Data
        .MaterialSupplies,
    ).toEqual([]);

    const invalid = structuredClone(fixture('material-supplies.success.json')) as {
      Data: { MaterialSupplies: Array<{ Items: Array<Record<string, unknown>> }> };
    };
    delete invalid.Data.MaterialSupplies[0]?.Items[0]?.MaterialId;
    expectSourceCode(
      () => parseMaterialSuppliesResponse(invalid),
      'SOURCE_CONTRACT_INVALID',
    );

    const ambiguousDate = structuredClone(fixture('material-supplies.success.json')) as {
      Data: { MaterialSupplies: Array<{ SupplyDateTime: string }> };
    };
    ambiguousDate.Data.MaterialSupplies[0]!.SupplyDateTime = '0';
    expectSourceCode(
      () => parseMaterialSuppliesResponse(ambiguousDate),
      'SOURCE_CONTRACT_INVALID',
    );

    const negativePrice = structuredClone(fixture('material-supplies.success.json')) as {
      Data: { MaterialSupplies: Array<{ Items: Array<{ Price: number }> }> };
    };
    negativePrice.Data.MaterialSupplies[0]!.Items[0]!.Price = -1;
    expectSourceCode(
      () => parseMaterialSuppliesResponse(negativePrice),
      'SOURCE_CONTRACT_INVALID',
    );

    const failed = structuredClone(fixture('material-supplies.empty.json')) as Record<
      string,
      unknown
    >;
    failed.IsFailed = true;
    expectSourceCode(
      () => parseMaterialSuppliesResponse(failed),
      'SOURCE_RESPONSE_UNSUCCESSFUL',
    );
  });

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

  it('rejects malformed and impossible order dates before persistence', () => {
    for (const invalidDate of ['0', '2026-02-30T00:00:00.000Z']) {
      const response = validRating();
      const firstOrder = ((response.data as { rows: Array<{ orders: unknown[] }> }).rows[0]
        ?.orders[0] ?? {}) as { date?: string };
      firstOrder.date = invalidDate;

      expectSourceCode(
        () => parseEmployeeRatingResponse(response),
        'SOURCE_CONTRACT_INVALID',
      );
    }
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
