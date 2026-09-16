import { describe, expect, it } from 'vitest';

import { SourceHttpClient } from '../../apps/api/src/source/source-http.client.js';
import { buildSourceRoute, type SourceOperation } from '../../apps/api/src/source/source-routes.js';

const operations: SourceOperation[] = [
  { kind: 'authenticate', login: 'synthetic-login', password: 'synthetic-password' },
  { kind: 'permissions' },
  { kind: 'setRole', unitId: 'synthetic-unit', role: 'SYNTHETIC_REPORT_VIEWER' },
  { kind: 'employeeRating', beginDate: '2026-09-01', endDate: '2026-09-16', page: 1, pageSize: 50 },
  { kind: 'productCatalog' },
  { kind: 'productionMaterials' },
  { kind: 'productTechnicalCardSummary', productId: 'synthetic-product' },
  { kind: 'technicalCards', productId: 'synthetic-product', startIndex: 0, pageSize: 20 },
  { kind: 'productAutoCosts', date: '2026-09-16', page: 0, count: 1 },
  {
    kind: 'materialAutoCosts',
    startDate: '2026-09-16T00:00:00.000Z',
    endDate: '2026-09-16',
    page: 1,
    count: 1,
    includeHalfFinished: false,
  },
  { kind: 'supplyDepartments', unitId: 'synthetic-unit' },
  {
    kind: 'materialSupplies',
    beginDateTime: '2026-09-16T00:00:00.000Z',
    endDateTime: '2026-09-16T23:59:59.999Z',
    unitId: 'synthetic-unit',
    departmentId: 'synthetic-department',
    startIndex: 0,
    pageSize: 1,
  },
];

describe('source boundary surface', () => {
  it('exposes only the typed execute method and twelve allowlisted GET routes', () => {
    expect(Object.getOwnPropertyNames(SourceHttpClient.prototype).sort()).toEqual(['constructor', 'execute']);
    expect(operations.map((operation) => buildSourceRoute(operation, 'safe-correlation').path)).toEqual([
      '/Infrastructure/Authenticate/Authenticate',
      '/Infrastructure/Authenticate/GetPermissions',
      '/Infrastructure/Authenticate/SetRole',
      '/Reports/EmployeesRating/GetData',
      '/Products/Home/GetAllProducts',
      '/InventoryControl/TechnicalCards/GetAllProductionMaterials',
      '/InventoryControl/TechnicalCards/GetProductById',
      '/InventoryControl/TechnicalCards/GetPagedTechnicalCard',
      '/InventoryControl/AutoCostProduct/GetAutoCostProducts',
      '/InventoryControl/AutoCostMaterials/GetAutoCostMaterials',
      '/InventoryControl/MaterialSupply/GetAvailableDepartments',
      '/InventoryControl/MaterialSupply/GetMaterialSuppliesWithLimit',
    ]);
  });

  it('serializes only the verified cost and supply query parameters', () => {
    const materialCosts = buildSourceRoute(
      {
        kind: 'materialAutoCosts',
        startDate: '2026-09-15T00:00:00.000Z',
        endDate: '2026-09-16',
        page: 1,
        count: 100,
        includeHalfFinished: false,
        departmentIds: ['synthetic-department-a', 'synthetic-department-b'],
      },
      'safe-correlation',
    );
    expect([...materialCosts.query.entries()]).toEqual([
      ['startDate', '2026-09-15T00:00:00.000Z'],
      ['endDate', '2026-09-16'],
      ['page', '1'],
      ['count', '100'],
      ['isReturnHalfFinishedNotPrepareAdvance', 'false'],
      ['departmentIds', 'synthetic-department-a'],
      ['departmentIds', 'synthetic-department-b'],
    ]);

    const supplies = buildSourceRoute(
      {
        kind: 'materialSupplies',
        beginDateTime: '2026-09-15T00:00:00.000Z',
        endDateTime: '2026-09-16T23:59:59.999Z',
        unitId: 'synthetic-unit',
        departmentId: 'synthetic-department',
        startIndex: 0,
        pageSize: 50,
      },
      'safe-correlation',
    );
    expect(Object.fromEntries(supplies.query)).toEqual({
      beginDateTime: '2026-09-15T00:00:00.000Z',
      endDateTime: '2026-09-16T23:59:59.999Z',
      unitId: 'synthetic-unit',
      departmentId: 'synthetic-department',
      startIndex: '0',
      pageSize: '50',
    });
  });
});
