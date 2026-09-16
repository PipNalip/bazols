import { describe, expect, it } from 'vitest';

import { SourceHttpClient } from '../../apps/api/src/source/source-http.client.js';
import { buildSourceRoute, type SourceOperation } from '../../apps/api/src/source/source-routes.js';

const operations: SourceOperation[] = [
  { kind: 'authenticate', login: 'synthetic-login', password: 'synthetic-password' },
  { kind: 'permissions' },
  { kind: 'setRole', unitId: 'synthetic-unit', role: 'SYNTHETIC_REPORT_VIEWER' },
  { kind: 'employeeRating', beginDate: '2026-09-01', endDate: '2026-09-16', page: 1, pageSize: 50 },
];

describe('source boundary surface', () => {
  it('exposes only the typed execute method and four allowlisted GET routes', () => {
    expect(Object.getOwnPropertyNames(SourceHttpClient.prototype).sort()).toEqual(['constructor', 'execute']);
    expect(operations.map((operation) => buildSourceRoute(operation, 'safe-correlation').path)).toEqual([
      '/Infrastructure/Authenticate/Authenticate',
      '/Infrastructure/Authenticate/GetPermissions',
      '/Infrastructure/Authenticate/SetRole',
      '/Reports/EmployeesRating/GetData',
    ]);
  });
});
