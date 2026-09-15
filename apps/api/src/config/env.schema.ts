import { z } from 'zod';

const PLACEHOLDER_SOURCE_PASSWORD = 'replace-with-a-fake-password';

const encryptionKeySchema = z.string().refine((value) => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    return false;
  }

  const decoded = Buffer.from(value, 'base64');
  return decoded.length === 32 && decoded.toString('base64') === value;
}, 'must be base64 encoding of exactly 32 bytes');

const appEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(1),
    RAW_DATA_ENCRYPTION_KEY: encryptionKeySchema,
    SOURCE_SITE_URL: z.url(),
    SOURCE_SITE_LOGIN: z.string().min(1),
    SOURCE_SITE_PASSWORD: z.string().min(1),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV !== 'test' && new URL(env.SOURCE_SITE_URL).protocol !== 'https:') {
      context.addIssue({
        code: 'custom',
        message: 'must use HTTPS outside test mode',
        path: ['SOURCE_SITE_URL'],
      });
    }

    if (
      env.NODE_ENV !== 'test' &&
      env.SOURCE_SITE_PASSWORD === PLACEHOLDER_SOURCE_PASSWORD
    ) {
      context.addIssue({
        code: 'custom',
        message: 'must not use the example placeholder outside test mode',
        path: ['SOURCE_SITE_PASSWORD'],
      });
    }
  });

export type AppEnv = z.infer<typeof appEnvSchema>;

export function parseAppEnv(input: NodeJS.ProcessEnv | Record<string, unknown>): AppEnv {
  const result = appEnvSchema.safeParse(input);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}
