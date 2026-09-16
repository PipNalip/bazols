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
  | { kind: 'technicalCards'; productId: string; startIndex: number; pageSize: number }
  | { kind: 'productAutoCosts'; date: string; page: number; count: number }
  | {
      kind: 'materialAutoCosts';
      startDate: string;
      endDate: string;
      page: number;
      count: number;
      includeHalfFinished: boolean;
      departmentIds?: string[];
    }
  | { kind: 'supplyDepartments'; unitId: string }
  | {
      kind: 'materialSupplies';
      beginDateTime: string;
      endDateTime: string;
      unitId: string;
      departmentId: string;
      startIndex: number;
      pageSize: number;
    };

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
    case 'productAutoCosts':
      return {
        endpoint: operation.kind,
        path: '/InventoryControl/AutoCostProduct/GetAutoCostProducts',
        query: new URLSearchParams({
          date: operation.date,
          page: String(operation.page),
          count: String(operation.count),
        }),
      };
    case 'materialAutoCosts': {
      const query = new URLSearchParams({
        startDate: operation.startDate,
        endDate: operation.endDate,
        page: String(operation.page),
        count: String(operation.count),
        isReturnHalfFinishedNotPrepareAdvance: String(operation.includeHalfFinished),
      });
      operation.departmentIds?.forEach((departmentId) => {
        query.append('departmentIds', departmentId);
      });
      return {
        endpoint: operation.kind,
        path: '/InventoryControl/AutoCostMaterials/GetAutoCostMaterials',
        query,
      };
    }
    case 'supplyDepartments':
      return {
        endpoint: operation.kind,
        path: '/InventoryControl/MaterialSupply/GetAvailableDepartments',
        query: new URLSearchParams({ unitId: operation.unitId }),
      };
    case 'materialSupplies':
      return {
        endpoint: operation.kind,
        path: '/InventoryControl/MaterialSupply/GetMaterialSuppliesWithLimit',
        query: new URLSearchParams({
          beginDateTime: operation.beginDateTime,
          endDateTime: operation.endDateTime,
          unitId: operation.unitId,
          departmentId: operation.departmentId,
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
