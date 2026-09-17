import { SourceError } from './source.errors.js';
import { type SourceHttpResponse, SourceHttpClient } from './source-http.client.js';
import {
  parseEmployeeRatingResponse,
  parseMaterialAutoCostsResponse,
  parsePermissionsResponse,
  parseProductAutoCostsResponse,
  parseSuccessfulResponse,
  type EmployeeRatingResponse,
  type MaterialAutoCostsResponse,
  type ProductAutoCostsResponse,
} from './source.schemas.js';

export type CollectReportRequest = {
  sourceUnitId: string;
  sourceRole: string;
  beginDate: string;
  endDate: string;
  pageSize: number;
  correlationId: string;
};

export type CollectedPage = {
  body: Buffer;
  contentType: string;
  page: number;
  response: EmployeeRatingResponse;
};

export type RawCollectedPage = Omit<CollectedPage, 'response'>;
export type RawPageHook = (page: RawCollectedPage) => void | Promise<void>;

export type CollectedReport = {
  kind: 'data' | 'empty';
  pages: CollectedPage[];
  totalRows: number;
};

export type RawCostPage = RawCollectedPage & {
  endpoint: 'productAutoCosts' | 'materialAutoCosts';
};

export type CollectedCostHistory = {
  productPages: Array<RawCostPage & { response: ProductAutoCostsResponse }>;
  materialPages: Array<RawCostPage & { response: MaterialAutoCostsResponse }>;
};

export type RawCostPageHook = (page: RawCostPage) => void | Promise<void>;

export type DiscoveredSourceUnit = {
  id: string;
  roles: string[];
};

type SourceCredentials = {
  login: string;
  password: string;
};

function decodeJson(response: SourceHttpResponse): unknown {
  try {
    return JSON.parse(response.body.toString('utf8')) as unknown;
  } catch {
    throw new SourceError('SOURCE_CONTRACT_INVALID');
  }
}

export class SourceConnector {
  constructor(
    private readonly client: SourceHttpClient,
    private readonly credentials: SourceCredentials,
  ) {}

  async discover(correlationId: string): Promise<DiscoveredSourceUnit[]> {
    const permissions = await this.#permissions(correlationId);
    return permissions.data.units.map((unit) => ({ id: unit.id, roles: [...unit.roles] }));
  }

  async collectReport(
    request: CollectReportRequest,
    onRawPage?: RawPageHook,
  ): Promise<CollectedReport> {
    await this.#selectRole(request);
    return this.#collectPages(request, onRawPage);
  }

  async collectCostHistory(
    request: CollectReportRequest,
    onRawPage?: RawCostPageHook,
  ): Promise<CollectedCostHistory> {
    if (!Number.isInteger(request.pageSize) || request.pageSize < 1) {
      throw new SourceError('SOURCE_PAGINATION_INVALID', 'costHistory', request.correlationId);
    }
    await this.#selectRole(request);
    return {
      productPages: await this.#collectProductCosts(request, onRawPage),
      materialPages: await this.#collectMaterialCosts(request, onRawPage),
    };
  }

  async #permissions(correlationId: string) {
    const authentication = await this.client.execute(
      { kind: 'authenticate', ...this.credentials },
      correlationId,
    );
    parseSuccessfulResponse(decodeJson(authentication));
    const permissionsResult = await this.client.execute({ kind: 'permissions' }, correlationId);
    return parsePermissionsResponse(decodeJson(permissionsResult));
  }

  async #selectRole(request: CollectReportRequest): Promise<void> {
    const permissions = await this.#permissions(request.correlationId);
    const unit = permissions.data.units.find((candidate) => candidate.id === request.sourceUnitId);
    if (!unit?.roles.includes(request.sourceRole)) {
      throw new SourceError('SOURCE_UNIT_UNAVAILABLE', 'permissions', request.correlationId);
    }
    const roleResult = await this.client.execute(
      { kind: 'setRole', unitId: request.sourceUnitId, role: request.sourceRole },
      request.correlationId,
    );
    parseSuccessfulResponse(decodeJson(roleResult));
  }

  async #collectProductCosts(
    request: CollectReportRequest,
    onRawPage?: RawCostPageHook,
  ): Promise<CollectedCostHistory['productPages']> {
    const pages: CollectedCostHistory['productPages'] = [];
    const ids = new Set<string>();
    let expectedTotal: number | undefined;
    let collected = 0;
    for (let page = 0; page < 10_000; page += 1) {
      const raw = await this.client.execute(
        { kind: 'productAutoCosts', date: request.endDate, page, count: request.pageSize },
        request.correlationId,
      );
      const rawPage: RawCostPage = {
        endpoint: 'productAutoCosts',
        page,
        body: raw.body,
        contentType: raw.contentType,
      };
      await onRawPage?.(rawPage);
      const response = parseProductAutoCostsResponse(decodeJson(raw));
      expectedTotal ??= response.totalRows;
      if (
        response.totalRows !== expectedTotal ||
        response.values.length > request.pageSize ||
        (expectedTotal > collected && response.values.length === 0)
      ) {
        throw new SourceError('SOURCE_PAGINATION_INVALID', 'productAutoCosts', request.correlationId);
      }
      for (const value of response.values) {
        if (ids.has(value.productId)) {
          throw new SourceError('SOURCE_PAGINATION_INVALID', 'productAutoCosts', request.correlationId);
        }
        ids.add(value.productId);
      }
      collected += response.values.length;
      if (collected > expectedTotal) {
        throw new SourceError('SOURCE_PAGINATION_INVALID', 'productAutoCosts', request.correlationId);
      }
      pages.push({ ...rawPage, response });
      if (collected === expectedTotal) return pages;
    }
    throw new SourceError('SOURCE_PAGINATION_INVALID', 'productAutoCosts', request.correlationId);
  }

  async #collectMaterialCosts(
    request: CollectReportRequest,
    onRawPage?: RawCostPageHook,
  ): Promise<CollectedCostHistory['materialPages']> {
    const pages: CollectedCostHistory['materialPages'] = [];
    const ids = new Set<string>();
    let expectedTotal: number | undefined;
    let collected = 0;
    for (let page = 1; page <= 10_000; page += 1) {
      const raw = await this.client.execute(
        {
          kind: 'materialAutoCosts',
          startDate: `${request.beginDate}T00:00:00.000Z`,
          endDate: request.endDate,
          page,
          count: request.pageSize,
          includeHalfFinished: false,
        },
        request.correlationId,
      );
      const rawPage: RawCostPage = {
        endpoint: 'materialAutoCosts',
        page,
        body: raw.body,
        contentType: raw.contentType,
      };
      await onRawPage?.(rawPage);
      const response = parseMaterialAutoCostsResponse(decodeJson(raw));
      expectedTotal ??= response.data.totalRows;
      if (
        response.data.totalRows !== expectedTotal ||
        response.data.values.length > request.pageSize ||
        (expectedTotal > collected && response.data.values.length === 0)
      ) {
        throw new SourceError('SOURCE_PAGINATION_INVALID', 'materialAutoCosts', request.correlationId);
      }
      for (const value of response.data.values) {
        if (ids.has(value.materialId)) {
          throw new SourceError('SOURCE_PAGINATION_INVALID', 'materialAutoCosts', request.correlationId);
        }
        ids.add(value.materialId);
      }
      collected += response.data.values.length;
      if (collected > expectedTotal) {
        throw new SourceError('SOURCE_PAGINATION_INVALID', 'materialAutoCosts', request.correlationId);
      }
      pages.push({ ...rawPage, response });
      if (collected === expectedTotal) return pages;
    }
    throw new SourceError('SOURCE_PAGINATION_INVALID', 'materialAutoCosts', request.correlationId);
  }

  async #collectPages(
    request: CollectReportRequest,
    onRawPage?: RawPageHook,
  ): Promise<CollectedReport> {
    if (!Number.isInteger(request.pageSize) || request.pageSize < 1) {
      throw new SourceError('SOURCE_PAGINATION_INVALID', 'employeeRating', request.correlationId);
    }
    const pages: CollectedPage[] = [];
    const employeeIds = new Set<string>();
    const orderIds = new Set<string>();
    const itemIds = new Set<string>();
    const productNames = new Map<string, string>();
    let expectedTotal: number | undefined;
    let collectedRows = 0;
    for (let page = 1; page <= 10_000; page += 1) {
      const raw = await this.client.execute(
        {
          kind: 'employeeRating',
          beginDate: request.beginDate,
          endDate: request.endDate,
          page,
          pageSize: request.pageSize,
        },
        request.correlationId,
      );
      await onRawPage?.({ body: raw.body, contentType: raw.contentType, page });
      const response = parseEmployeeRatingResponse(decodeJson(raw));
      expectedTotal ??= response.data.totalRows;
      if (
        response.data.totalRows !== expectedTotal ||
        response.data.rows.length > request.pageSize ||
        (expectedTotal > collectedRows && response.data.rows.length === 0)
      ) {
        throw new SourceError('SOURCE_PAGINATION_INVALID', 'employeeRating', request.correlationId);
      }
      for (const employee of response.data.rows) {
        if (employeeIds.has(employee.id)) {
          throw new SourceError('SOURCE_PAGINATION_INVALID', 'employeeRating', request.correlationId);
        }
        employeeIds.add(employee.id);
        for (const order of employee.orders) {
          if (orderIds.has(order.id)) {
            throw new SourceError('SOURCE_PAGINATION_INVALID', 'employeeRating', request.correlationId);
          }
          orderIds.add(order.id);
          for (const item of order.items) {
            if (itemIds.has(item.id)) {
              throw new SourceError('SOURCE_PAGINATION_INVALID', 'employeeRating', request.correlationId);
            }
            itemIds.add(item.id);
            const existingName = productNames.get(item.product.id);
            if (existingName !== undefined && existingName !== item.product.name) {
              throw new SourceError('SOURCE_PAGINATION_INVALID', 'employeeRating', request.correlationId);
            }
            productNames.set(item.product.id, item.product.name);
          }
        }
      }
      collectedRows += response.data.rows.length;
      if (collectedRows > expectedTotal) {
        throw new SourceError('SOURCE_PAGINATION_INVALID', 'employeeRating', request.correlationId);
      }
      pages.push({ body: raw.body, contentType: raw.contentType, page, response });
      if (collectedRows === expectedTotal) {
        return { kind: expectedTotal === 0 ? 'empty' : 'data', pages, totalRows: expectedTotal };
      }
    }
    throw new SourceError('SOURCE_PAGINATION_INVALID', 'employeeRating', request.correlationId);
  }
}
