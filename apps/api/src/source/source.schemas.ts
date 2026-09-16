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

function isCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maximumDay = daysInMonth[month - 1];
  return maximumDay !== undefined && day >= 1 && day <= maximumDay;
}

function isClockTime(hour: number, minute: number, second: number): boolean {
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
}

function isSourceDate(value: string): boolean {
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))?)?$/.exec(
      value,
    );
  if (iso) {
    if (!isCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))) return false;
    if (iso[4] === undefined) return true;
    if (!isClockTime(Number(iso[4]), Number(iso[5]), Number(iso[6]))) return false;
    if (iso[7] === undefined) return true;
    const offsetHour = Number(iso[7]);
    const offsetMinute = Number(iso[8]);
    return (
      offsetHour >= 0 &&
      offsetHour <= 14 &&
      offsetMinute >= 0 &&
      offsetMinute <= 59 &&
      (offsetHour < 14 || offsetMinute === 0)
    );
  }

  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?$/.exec(value);
  if (!dotted) return false;
  if (!isCalendarDate(Number(dotted[3]), Number(dotted[2]), Number(dotted[1]))) return false;
  return (
    dotted[4] === undefined ||
    isClockTime(Number(dotted[4]), Number(dotted[5]), Number(dotted[6]))
  );
}

const sourceDate = z.string().refine(isSourceDate, { message: 'Invalid source date' });

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
    date: sourceDate,
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

const finiteNumber = z.number().finite();
const nonnegativeNumber = finiteNumber.nonnegative();

const productAutoCostsResponse = z
  .object({
    totalRows: z.number().int().nonnegative(),
    values: z.array(
      z
        .object({
          productId: sourceId,
          productName: z.string().min(1),
          productUnitOfMeasure: z.number().int(),
          category: z.number().int(),
          autoCostProductByTradeArea: z.array(
            z
              .object({
                tradeAreaId: sourceId,
                averageAutoCost: nonnegativeNumber,
                extraCharge: finiteNumber,
                fc: finiteNumber,
                price: nonnegativeNumber,
                autoCostProductByUnit: z.array(
                  z
                    .object({
                      autoCost: nonnegativeNumber,
                      isTotalCost: z.boolean(),
                      productId: sourceId,
                      unitId: sourceId,
                    })
                    .passthrough(),
                ),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const materialAutoCostsResponse = z
  .object({
    isSuccess: z.literal(true),
    isFailed: z.literal(false),
    data: z
      .object({
        totalRows: z.number().int().nonnegative(),
        values: z.array(
          z
            .object({
              materialId: sourceId,
              materialName: z.string().min(1),
              materialType: z.number().int(),
              materialUnitOfMeasure: z.number().int(),
              autoCostMaterialViewsByDates: z.array(
                z
                  .object({
                    date: sourceDate,
                    autoCostMaterialViews: z.array(
                      z
                        .object({
                          autoCost: nonnegativeNumber,
                          currency: z.number().int(),
                          departmentId: sourceId,
                          materialId: sourceId,
                          materialName: z.string().min(1),
                          materialUnitOfMeasure: z.number().int(),
                          unitId: sourceId,
                        })
                        .passthrough(),
                    ),
                  })
                  .passthrough(),
              ),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
    errors: z.array(z.unknown()),
  })
  .passthrough();

const supplyDepartmentsResponse = z.array(
  z
    .object({
      Disabled: z.boolean(),
      Group: z.unknown(),
      Selected: z.boolean(),
      Text: z.string().min(1),
      Value: sourceId,
    })
    .passthrough(),
);

const materialSuppliesResponse = z
  .object({
    IsSuccess: z.literal(true),
    IsFailed: z.literal(false),
    Data: z
      .object({
        TotalRows: z.number().int().nonnegative(),
        MaterialSupplies: z.array(
          z
            .object({
              Id: sourceId,
              DepartmentId: sourceId,
              UnitId: sourceId,
              SupplyDateTime: sourceDate,
              Items: z.array(
                z
                  .object({
                    Id: sourceId,
                    MaterialId: sourceId,
                    MaterialName: z.string().min(1),
                    Price: nonnegativeNumber,
                    Tax: nonnegativeNumber,
                    Metrics: z
                      .object({
                        Value: nonnegativeNumber,
                        UnitOfMeasure: z.number().int(),
                      })
                      .passthrough(),
                  })
                  .passthrough(),
              ),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
    Errors: z.array(z.unknown()),
    WarningEntries: z.array(z.unknown()),
    Warnings: z.array(z.unknown()),
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
export type ProductAutoCostsResponse = z.infer<typeof productAutoCostsResponse>;
export type MaterialAutoCostsResponse = z.infer<typeof materialAutoCostsResponse>;
export type SupplyDepartmentsResponse = z.infer<typeof supplyDepartmentsResponse>;
export type MaterialSuppliesResponse = z.infer<typeof materialSuppliesResponse>;

function parseCents(value: string): bigint {
  const [whole, fraction] = value.split('.');
  return BigInt(whole ?? '0') * 100n + BigInt(fraction ?? '0');
}

function assertSuccessfulEnvelope(input: unknown): void {
  if (
    typeof input === 'object' &&
    input !== null &&
    (('isSuccess' in input && input.isSuccess === false) ||
      ('isFailed' in input && input.isFailed === true) ||
      ('IsSuccess' in input && input.IsSuccess === false) ||
      ('IsFailed' in input && input.IsFailed === true))
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

export function parseProductAutoCostsResponse(input: unknown): ProductAutoCostsResponse {
  return parseWithContract(productAutoCostsResponse, input);
}

export function parseMaterialAutoCostsResponse(input: unknown): MaterialAutoCostsResponse {
  return parseWithContract(materialAutoCostsResponse, input);
}

export function parseSupplyDepartmentsResponse(input: unknown): SupplyDepartmentsResponse {
  return parseWithContract(supplyDepartmentsResponse, input);
}

export function parseMaterialSuppliesResponse(input: unknown): MaterialSuppliesResponse {
  return parseWithContract(materialSuppliesResponse, input);
}
