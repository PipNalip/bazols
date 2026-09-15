import { z } from 'zod';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createSyncRunSchema = z.object({
  restaurantId: z.uuid(),
  beginDate: dateSchema,
  endDate: dateSchema,
});

export const syncHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
