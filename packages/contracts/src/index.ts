import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const employeeRankingRowSchema = z.object({
  rank: z.number().int().positive(),
  employeeId: z.string().min(1),
  name: z.string().min(1),
  revenue: z.string().regex(/^\d+\.\d{2}$/),
  ordersCount: z.number().int().nonnegative(),
  averageCheque: z.string().regex(/^\d+\.\d{2}$/),
  currency: z.string().min(1),
});

export const productRankingRowSchema = z.object({
  rank: z.number().int().positive(),
  productId: z.string().min(1),
  name: z.string().min(1),
  unitsSold: z.number().int().nonnegative(),
  revenue: z.string().regex(/^\d+\.\d{2}$/),
  cogs: z.string().regex(/^\d+\.\d{2}$/).nullable(),
  grossMargin: z.string().regex(/^-?\d+\.\d{2}$/).nullable(),
  grossMarginRate: z.string().regex(/^-?\d+\.\d{2}$/).nullable(),
  currency: z.string().min(1),
});

export const productRankingCoverageSchema = z.object({
  costedUnits: z.number().int().nonnegative(),
  totalUnits: z.number().int().nonnegative(),
  percentage: z.string().regex(/^\d+\.\d{2}$/),
});

export const employeeRankingResponseSchema = z.array(employeeRankingRowSchema);
export const productRankingResponseSchema = z.object({
  rows: z.array(productRankingRowSchema),
  coverage: productRankingCoverageSchema,
});

export type EmployeeRankingRow = z.infer<typeof employeeRankingRowSchema>;
export type ProductRankingRow = z.infer<typeof productRankingRowSchema>;
export type ProductRankingResponse = z.infer<typeof productRankingResponseSchema>;
