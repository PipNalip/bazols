import { z } from 'zod';

import { SourceError } from './source.errors.js';

const sourceId = z.string().min(1);
const moneyString = z.string().regex(/^\d+\.\d{2}$/);
const money = z
  .object({
    value: moneyString,
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .passthrough();

const permissionUnit = z
  .object({
    id: sourceId,
    roles: z.array(z.string().min(1)).min(1),
  })
  .passthrough();

const permissionsResponse = z
  .object({
    isSuccess: z.literal(true),
    data: z.object({ units: z.array(permissionUnit) }).passthrough(),
  })
  .passthrough();

const currentPermissionsResponse = z
  .object({
    isSuccess: z.literal(true),
    data: z
      .object({
        permissions: z.array(
          z
            .object({
              unitId: sourceId,
              roles: z.array(z.number().int()).min(1),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

const successfulResponse = z
  .object({
    isSuccess: z.literal(true),
    data: z.unknown(),
  })
  .passthrough();

const orderItem = z
  .object({
    id: sourceId,
    product: z
      .object({
        id: sourceId,
        name: z.string().min(1),
      })
      .passthrough(),
    priceWithDiscountForOrder: money,
  })
  .passthrough();

const order = z
  .object({
    id: sourceId,
    date: z.string().refine((value) => Number.isFinite(Date.parse(value))),
    price: money,
    items: z.array(orderItem),
  })
  .passthrough();

const employee = z
  .object({
    id: sourceId,
    displayName: z.string().min(1),
    orders: z.array(order),
  })
  .passthrough();

const employeeRatingResponse = z
  .object({
    isSuccess: z.literal(true),
    data: z
      .object({
        totalRows: z.number().int().nonnegative(),
        rows: z.array(employee),
      })
      .passthrough(),
  })
  .passthrough();

const productCatalogResponse = z.array(
  z
    .object({
      id: sourceId,
      name: z.string().min(1),
      isRemoved: z.boolean(),
      needToPrepare: z.boolean(),
      netWeight: z.number().nonnegative(),
      netWeightUnitOfMeasure: z.number().int(),
      productType: z.number().int(),
    })
    .passthrough(),
);

const productionMaterialsResponse = z.array(
  z
    .object({
      id: sourceId,
      text: z.string().min(1),
      type: z.number().int(),
      category: z.number().int(),
      unitOfMeasure: z.number().int(),
      unitOfMeasureToShortString: z.string().min(1),
      isRemoved: z.boolean(),
    })
    .passthrough(),
);

const productTechnicalCardSummaryResponse = z
  .object({
    isSuccess: z.literal(true),
    data: z
      .object({
        productId: sourceId,
        productName: z.string().min(1),
        areTechnicalCardsExists: z.boolean(),
      })
      .passthrough(),
  })
  .passthrough();

const technicalCardItem = z
  .object({
    id: sourceId,
    materialName: z.string().min(1),
    materialCategory: z.number().int(),
    materialIsRemoved: z.boolean(),
    lossMaterialQuantityToString: z.string().min(1),
    productionMaterialQuantityToString: z.string().min(1),
  })
  .passthrough();

const technicalCardsResponse = z
  .object({
    isSuccess: z.literal(true),
    data: z
      .object({
        cards: z.array(
          z
            .object({
              id: sourceId,
              datePeriod: z.string().min(1),
              isActive: z.boolean(),
              isActiveCurrentCard: z.boolean(),
              isDeactivated: z.boolean(),
              calculationItems: z.array(technicalCardItem),
              packingItems: z.array(technicalCardItem),
            })
            .passthrough(),
        ),
        totalrows: z.number().int().nonnegative(),
      })
      .passthrough(),
  })
  .passthrough();

export type PermissionsResponse = z.infer<typeof permissionsResponse>;
export type EmployeeRatingResponse = z.infer<typeof employeeRatingResponse>;
export type EmployeeRatingRow = EmployeeRatingResponse['data']['rows'][number];
export type ProductCatalogResponse = z.infer<typeof productCatalogResponse>;
export type ProductionMaterialsResponse = z.infer<typeof productionMaterialsResponse>;
export type ProductTechnicalCardSummaryResponse = z.infer<
  typeof productTechnicalCardSummaryResponse
>;
export type TechnicalCardsResponse = z.infer<typeof technicalCardsResponse>;

function parseCents(value: string): bigint {
  const [whole, fraction] = value.split('.');
  return BigInt(whole ?? '0') * 100n + BigInt(fraction ?? '0');
}

function assertSuccessfulEnvelope(input: unknown): void {
  if (
    typeof input === 'object' &&
    input !== null &&
    (('isSuccess' in input && input.isSuccess === false) ||
      ('isFailed' in input && input.isFailed === true))
  ) {
    throw new SourceError('SOURCE_RESPONSE_UNSUCCESSFUL');
  }
}

function parseWithContract<T>(schema: z.ZodType<T>, input: unknown): T {
  assertSuccessfulEnvelope(input);
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new SourceError('SOURCE_CONTRACT_INVALID');
  }
  return result.data;
}

export function parsePermissionsResponse(input: unknown): PermissionsResponse {
  assertSuccessfulEnvelope(input);
  const legacy = permissionsResponse.safeParse(input);
  if (legacy.success) {
    return legacy.data;
  }

  const current = parseWithContract(currentPermissionsResponse, input);
  return {
    isSuccess: true,
    data: {
      units: current.data.permissions.map((permission) => ({
        id: permission.unitId,
        roles: permission.roles.map(String),
      })),
    },
  };
}

export function parseSuccessfulResponse(
  input: unknown,
): z.infer<typeof successfulResponse> {
  return parseWithContract(successfulResponse, input);
}

export function parseEmployeeRatingResponse(input: unknown): EmployeeRatingResponse {
  const response = parseWithContract(employeeRatingResponse, input);

  for (const row of response.data.rows) {
    for (const sourceOrder of row.orders) {
      const itemTotal = sourceOrder.items.reduce(
        (sum, item) => sum + parseCents(item.priceWithDiscountForOrder.value),
        0n,
      );
      const difference = itemTotal - parseCents(sourceOrder.price.value);
      if (difference < -1n || difference > 1n) {
        throw new SourceError('SOURCE_MONEY_MISMATCH');
      }
    }
  }

  return response;
}

export function parseProductCatalogResponse(input: unknown): ProductCatalogResponse {
  return parseWithContract(productCatalogResponse, input);
}

export function parseProductionMaterialsResponse(input: unknown): ProductionMaterialsResponse {
  return parseWithContract(productionMaterialsResponse, input);
}

export function parseProductTechnicalCardSummaryResponse(
  input: unknown,
): ProductTechnicalCardSummaryResponse {
  return parseWithContract(productTechnicalCardSummaryResponse, input);
}

export function parseTechnicalCardsResponse(input: unknown): TechnicalCardsResponse {
  return parseWithContract(technicalCardsResponse, input);
}
