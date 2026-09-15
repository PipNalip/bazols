import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SourceError } from './source.errors.js';
import {
  parseEmployeeRatingResponse,
  parsePermissionsResponse,
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
