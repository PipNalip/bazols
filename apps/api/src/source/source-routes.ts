import { SourceError } from './source.errors.js';

export type SourceOperation =
  | { kind: 'authenticate'; login: string; password: string }
  | { kind: 'permissions' }
  | { kind: 'setRole'; unitId: string; role: string }
  | {
      kind: 'employeeRating';
      beginDate: string;
      endDate: string;
      page: number;
      pageSize: number;
    }
  | { kind: 'productCatalog' }
  | { kind: 'productionMaterials' }
  | { kind: 'productTechnicalCardSummary'; productId: string }
  | { kind: 'technicalCards'; productId: string; startIndex: number; pageSize: number };

export type SourceEndpoint = SourceOperation['kind'];

export type SourceRoute = {
  endpoint: SourceEndpoint;
  path: string;
  query: URLSearchParams;
};

export function buildSourceRoute(
  operation: SourceOperation,
  correlationId: string,
): SourceRoute {
  switch (operation.kind) {
    case 'authenticate':
      return {
        endpoint: operation.kind,
        path: '/Infrastructure/Authenticate/Authenticate',
        query: new URLSearchParams({
          login: operation.login,
          password: operation.password,
        }),
      };
    case 'permissions':
      return {
        endpoint: operation.kind,
        path: '/Infrastructure/Authenticate/GetPermissions',
        query: new URLSearchParams(),
      };
    case 'setRole':
      return {
        endpoint: operation.kind,
        path: '/Infrastructure/Authenticate/SetRole',
        query: new URLSearchParams({ unitId: operation.unitId, role: operation.role }),
      };
    case 'employeeRating':
      return {
        endpoint: operation.kind,
        path: '/Reports/EmployeesRating/GetData',
        query: new URLSearchParams({
          beginDate: operation.beginDate,
          endDate: operation.endDate,
          employeeType: '',
          employeeSurname: '',
          page: String(operation.page),
          pageSize: String(operation.pageSize),
        }),
      };
    case 'productCatalog':
      return {
        endpoint: operation.kind,
        path: '/Products/Home/GetAllProducts',
        query: new URLSearchParams({ isRemove: 'false' }),
      };
    case 'productionMaterials':
      return {
        endpoint: operation.kind,
        path: '/InventoryControl/TechnicalCards/GetAllProductionMaterials',
        query: new URLSearchParams(),
      };
    case 'productTechnicalCardSummary':
      return {
        endpoint: operation.kind,
        path: '/InventoryControl/TechnicalCards/GetProductById',
        query: new URLSearchParams({ productId: operation.productId }),
      };
    case 'technicalCards':
      return {
        endpoint: operation.kind,
        path: '/InventoryControl/TechnicalCards/GetPagedTechnicalCard',
        query: new URLSearchParams({
          productId: operation.productId,
          startIndex: String(operation.startIndex),
          pageSize: String(operation.pageSize),
        }),
      };
    default:
      throw new SourceError(
        'SOURCE_OPERATION_UNKNOWN',
        undefined,
        correlationId,
      );
  }
}
