import { describe, expect, it } from 'vitest';

import { employeeReportQuerySchema, productReportQuerySchema } from './reports.dto.js';

describe('report query date validation', () => {
  it.each([
    ['2026-02-31', '2026-03-01'],
    ['2026-99-01', '2026-99-02'],
    ['2026-00-10', '2026-01-10'],
  ])('rejects impossible calendar date %s', (from, to) => {
    expect(
      employeeReportQuerySchema.safeParse({ from, to, sort: 'revenue' }).success,
    ).toBe(false);
    expect(
      productReportQuerySchema.safeParse({ from, to, sort: 'unitsSold' }).success,
    ).toBe(false);
  });

  it('accepts a real leap day', () => {
    expect(
      employeeReportQuerySchema.safeParse({
        from: '2028-02-29',
        to: '2028-02-29',
        sort: 'averageCheque',
      }).success,
    ).toBe(true);
  });
});
