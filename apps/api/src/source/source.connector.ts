import { SourceError } from './source.errors.js';
import {
  type SourceHttpResponse,
  SourceHttpClient,
} from './source-http.client.js';
import {
  parseEmployeeRatingResponse,
  parsePermissionsResponse,
  parseSuccessfulResponse,
  type EmployeeRatingResponse,
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

  async collectReport(
    request: CollectReportRequest,
    onRawPage?: RawPageHook,
  ): Promise<CollectedReport> {
    const authentication = await this.client.execute(
      { kind: 'authenticate', ...this.credentials },
      request.correlationId,
    );
    parseSuccessfulResponse(decodeJson(authentication));

    const permissionsResult = await this.client.execute(
      { kind: 'permissions' },
      request.correlationId,
    );
    const permissions = parsePermissionsResponse(decodeJson(permissionsResult));
    const unit = permissions.data.units.find(
      (candidate) => candidate.id === request.sourceUnitId,
    );
    if (!unit?.roles.includes(request.sourceRole)) {
      throw new SourceError(
        'SOURCE_UNIT_UNAVAILABLE',
        'permissions',
        request.correlationId,
      );
    }

    const roleResult = await this.client.execute(
      {
        kind: 'setRole',
        unitId: request.sourceUnitId,
        role: request.sourceRole,
      },
      request.correlationId,
    );
    parseSuccessfulResponse(decodeJson(roleResult));

    return this.#collectPages(request, onRawPage);
  }

  async #collectPages(
    request: CollectReportRequest,
    onRawPage?: RawPageHook,
  ): Promise<CollectedReport> {
    if (!Number.isInteger(request.pageSize) || request.pageSize < 1) {
      throw new SourceError(
        'SOURCE_PAGINATION_INVALID',
        'employeeRating',
        request.correlationId,
      );
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
        throw new SourceError(
          'SOURCE_PAGINATION_INVALID',
          'employeeRating',
          request.correlationId,
        );
      }

      for (const employee of response.data.rows) {
        if (employeeIds.has(employee.id)) {
          throw new SourceError(
            'SOURCE_PAGINATION_INVALID',
            'employeeRating',
            request.correlationId,
          );
        }
        employeeIds.add(employee.id);

        for (const order of employee.orders) {
          if (orderIds.has(order.id)) {
            throw new SourceError(
              'SOURCE_PAGINATION_INVALID',
              'employeeRating',
              request.correlationId,
            );
          }
          orderIds.add(order.id);

          for (const item of order.items) {
            if (itemIds.has(item.id)) {
              throw new SourceError(
                'SOURCE_PAGINATION_INVALID',
                'employeeRating',
                request.correlationId,
              );
            }
            itemIds.add(item.id);
            const existingName = productNames.get(item.product.id);
            if (existingName !== undefined && existingName !== item.product.name) {
              throw new SourceError(
                'SOURCE_PAGINATION_INVALID',
                'employeeRating',
                request.correlationId,
              );
            }
            productNames.set(item.product.id, item.product.name);
          }
        }
      }

      collectedRows += response.data.rows.length;
      if (collectedRows > expectedTotal) {
        throw new SourceError(
          'SOURCE_PAGINATION_INVALID',
          'employeeRating',
          request.correlationId,
        );
      }
      pages.push({
        body: raw.body,
        contentType: raw.contentType,
        page,
        response,
      });

      if (collectedRows === expectedTotal) {
        return {
          kind: expectedTotal === 0 ? 'empty' : 'data',
          pages,
          totalRows: expectedTotal,
        };
      }
    }

    throw new SourceError(
      'SOURCE_PAGINATION_INVALID',
      'employeeRating',
      request.correlationId,
    );
  }
}
