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

export type PermissionsResponse = z.infer<typeof permissionsResponse>;
export type EmployeeRatingResponse = z.infer<typeof employeeRatingResponse>;
export type EmployeeRatingRow = EmployeeRatingResponse['data']['rows'][number];

function parseCents(value: string): bigint {
  const [whole, fraction] = value.split('.');
  return BigInt(whole ?? '0') * 100n + BigInt(fraction ?? '0');
}

function assertSuccessfulEnvelope(input: unknown): void {
  if (
    typeof input === 'object' &&
    input !== null &&
    'isSuccess' in input &&
    input.isSuccess === false
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
  return parseWithContract(permissionsResponse, input);
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
