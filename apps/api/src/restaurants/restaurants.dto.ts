import { z } from 'zod';

export const restaurantMappingSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  sourceUnitId: z.string().trim().min(1).max(200),
  sourceRole: z.string().trim().min(1).max(200),
  timezone: z.string().trim().min(1).max(100),
});
