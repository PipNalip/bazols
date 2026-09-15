import { z } from 'zod';

const username = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/);
const password = z.string().min(12).max(1_024);
const restaurantIds = z.array(z.uuid()).max(200).refine(
  (ids) => new Set(ids).size === ids.length,
  'Restaurant IDs must be unique',
);

export const createManagerSchema = z.object({
  username,
  temporaryPassword: password,
  restaurantIds,
});

export const replaceAssignmentsSchema = z.object({ restaurantIds });
export const resetPasswordSchema = z.object({ temporaryPassword: password });
