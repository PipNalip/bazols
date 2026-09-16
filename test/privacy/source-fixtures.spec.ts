import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const fixtureDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/source',
);
const expectedFixtureNames = [
  'employees-rating.empty.json',
  'employees-rating.invalid.json',
  'employees-rating.success.json',
  'permissions.current.json',
  'permissions.success.json',
  'product-technical-card-summary.success.json',
  'production-materials.success.json',
  'products.empty.json',
  'products.invalid.json',
  'products.success.json',
  'technical-cards.empty.json',
  'technical-cards.invalid.json',
  'technical-cards.success.json',
];
const allowedKeys = new Set([
  'areTechnicalCardsExists',
  'calculationItems',
  'cards',
  'category',
  'currency',
  'customer',
  'data',
  'date',
  'datePeriod',
  'displayName',
  'email',
  'errors',
  'id',
  'isActive',
  'isActiveCurrentCard',
  'isDeactivated',
  'isFailed',
  'isRemoved',
  'isSuccess',
  'items',
  'lossMaterialQuantityToString',
  'materialCategory',
  'materialIsRemoved',
  'materialName',
  'name',
  'nameDepartment',
  'nameUnit',
  'needToPrepare',
  'netWeight',
  'netWeightUnitOfMeasure',
  'orders',
  'packingItems',
  'permissions',
  'phone',
  'price',
  'priceWithDiscountForOrder',
  'product',
  'productId',
  'productName',
  'productPrice',
  'productType',
  'productionMaterialQuantityToString',
  'roles',
  'rows',
  'text',
  'totalRows',
  'totalrows',
  'type',
  'unitId',
  'unitOfMeasure',
  'unitOfMeasureToShortString',
  'units',
  'value',
  'warningEntries',
  'warnings',
]);
const credentialKey = /(?:authorization|cookie|credential|login|password|secret|token)/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const money = /^\d+\.\d{2}$/;
const syntheticPhone = /^\+1 202-555-01\d{2}$/;
const syntheticEmail = /^[a-z0-9.-]+@example\.invalid$/i;
const socialHandle = /(^|\s)@[a-z0-9_]{2,}/i;
const domainName = /\b(?:[a-z0-9-]+\.)+(?:app|biz|co|com|dev|info|invalid|io|me|net|org|ru)\b/gi;
const credentialAssignment = /(?:authorization|cookie|credential|login|password|secret|token)\s*[:=]/i;

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDirectory, name), 'utf8')) as unknown;
}

function assertSafeString(value: string, key: string, location: string): void {
  expect(socialHandle.test(value), `${location} contains a social handle`).toBe(false);
  expect(
    credentialAssignment.test(value),
    `${location} contains a credential-like value`,
  ).toBe(false);

  const nonReservedDomain = (value.match(domainName) ?? []).find((domain) => {
    const normalized = domain.toLowerCase();
    return normalized !== 'example.invalid' && !normalized.endsWith('.example.invalid');
  });
  expect(nonReservedDomain, `${location} contains a non-reserved domain`).toBeUndefined();

  if (key === 'id' || key === 'productId' || key === 'unitId') {
    expect(uuid.test(value), `${location} must contain a synthetic UUID`).toBe(true);
    return;
  }
  if (key === 'date') {
    expect(isoDate.test(value), `${location} must contain an ISO timestamp`).toBe(true);
    return;
  }
  if (key === 'value') {
    expect(money.test(value), `${location} must contain a decimal money string`).toBe(true);
    return;
  }
  if (key === 'currency') {
    expect(value, `${location} must contain a three-letter currency`).toMatch(/^[A-Z]{3}$/);
    return;
  }
  if (key === 'phone') {
    expect(syntheticPhone.test(value), `${location} must contain a reserved synthetic phone`).toBe(
      true,
    );
    return;
  }
  if (key === 'email') {
    expect(syntheticEmail.test(value), `${location} must use example.invalid`).toBe(true);
    return;
  }
  if (key === 'roles') {
    expect(value, `${location} must contain an approved synthetic role`).toBe(
      'SYNTHETIC_REPORT_VIEWER',
    );
    return;
  }
  if (
    key === 'displayName' ||
    key === 'materialName' ||
    key === 'name' ||
    key === 'nameDepartment' ||
    key === 'nameUnit' ||
    key === 'productName' ||
    key === 'text'
  ) {
    expect(value, `${location} must be explicitly marked synthetic`).toMatch(/^Synthetic /);
    return;
  }
  if (key === 'datePeriod') {
    expect(value, `${location} must contain a synthetic date period`).toMatch(
      /^\d{2}\.\d{2}\.\d{4} - \d{2}\.\d{2}\.\d{4}$/,
    );
    return;
  }
  if (
    key === 'lossMaterialQuantityToString' ||
    key === 'productionMaterialQuantityToString'
  ) {
    expect(value, `${location} must contain a decimal quantity`).toMatch(/^\d+\.\d+$/);
    return;
  }
  if (key === 'unitOfMeasureToShortString') {
    expect(value, `${location} must contain a short unit label`).toMatch(/^[a-z]{1,8}$/);
    return;
  }

  expect.unreachable(`${location} contains unapproved free text`);
}

function visitFixture(value: unknown, location: string, parentKey = ''): void {
  if (typeof value === 'string') {
    assertSafeString(value, parentKey, location);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visitFixture(entry, `${location}[${index}]`, parentKey));
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;
    expect(credentialKey.test(key), `${childLocation} contains a credential-like key`).toBe(false);
    expect(allowedKeys.has(key), `${childLocation} is not allowlisted`).toBe(true);
    visitFixture(child, childLocation, key);
  }
}

describe('source fixture privacy contract', () => {
  it('rejects a handle hidden in an allowlisted text field', () => {
    expect(() =>
      visitFixture(
        { name: 'Synthetic Employee @private_operator' },
        'sentinel.json',
      ),
    ).toThrow(/sentinel\.json\.name contains a social handle/);
  });

  it('rejects a real domain hidden in an allowlisted text field', () => {
    expect(() =>
      visitFixture(
        { name: 'Synthetic Employee private-restaurant.com' },
        'sentinel.json',
      ),
    ).toThrow(/sentinel\.json\.name contains a non-reserved domain/);
  });

  it('contains only allowlisted synthetic data at every nested path', () => {
    const fixtureNames = readdirSync(fixtureDirectory)
      .filter((name) => name.endsWith('.json'))
      .sort();
    expect(fixtureNames).toEqual(expectedFixtureNames);

    fixtureNames.forEach((name) => visitFixture(loadFixture(name), name));
  });

  it('pins the deterministic reporting scenarios', () => {
    const permissions = loadFixture('permissions.success.json') as {
      data: { units: Array<{ roles: string[] }> };
    };
    expect(permissions.data.units).toHaveLength(1);
    expect(permissions.data.units[0]?.roles).toEqual(['SYNTHETIC_REPORT_VIEWER']);

    const success = loadFixture('employees-rating.success.json') as {
      data: {
        totalRows: number;
        rows: Array<{
          email?: string;
          orders: Array<{
            customer?: { email: string; phone: string };
            price: { value: string };
            items: Array<{
              product: { id: string };
              productPrice: { value: string };
              priceWithDiscountForOrder: { value: string };
            }>;
          }>;
          phone?: string;
        }>;
      };
    };
    const orders = success.data.rows.flatMap((employee) => employee.orders);
    const items = orders.flatMap((order) => order.items);
    const employeeRevenue = success.data.rows.map((employee) =>
      employee.orders.reduce((sum, order) => sum + Number(order.price.value), 0),
    );

    expect(success.data.totalRows).toBe(2);
    expect(success.data.rows).toHaveLength(2);
    expect(orders).toHaveLength(3);
    expect(items).toHaveLength(4);
    expect(new Set(items.map((item) => item.product.id)).size).toBe(2);
    expect(success.data.rows[0]).toMatchObject({
      email: 'employee.alpha@example.invalid',
      phone: '+1 202-555-0101',
    });
    expect(orders[0]?.customer).toEqual({
      email: 'customer.one@example.invalid',
      phone: '+1 202-555-0111',
    });
    expect(
      items.some(
        (item) => item.productPrice.value !== item.priceWithDiscountForOrder.value,
      ),
    ).toBe(true);
    expect(employeeRevenue[0]).toBe(employeeRevenue[1]);

    const empty = loadFixture('employees-rating.empty.json') as {
      data: { totalRows: number; rows: unknown[] };
    };
    expect(empty.data).toEqual({ totalRows: 0, rows: [] });

    const invalid = loadFixture('employees-rating.invalid.json') as {
      data: { rows: Array<{ orders: Array<{ id?: string }> }> };
    };
    expect(invalid.data.rows[0]?.orders[0]?.id).toBeUndefined();
  });
});
