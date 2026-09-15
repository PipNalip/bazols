import { describe, expect, it } from 'vitest';

import { parseAppEnv } from './env.schema.js';

const validTestEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://bazols:bazols@127.0.0.1:5432/bazols_test',
  SESSION_SECRET: 'synthetic-test-session-secret-32chars',
  APP_ORIGIN: 'http://app.example.invalid',
  RAW_DATA_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  SOURCE_SITE_URL: 'http://source.example.invalid',
  SOURCE_SITE_LOGIN: 'replace-with-a-fake-login',
  SOURCE_SITE_PASSWORD: 'replace-with-a-fake-password',
} as const;

describe('application environment validation', () => {
  it('rejects a missing DATABASE_URL', () => {
    const env: Record<string, unknown> = { ...validTestEnv };
    delete env.DATABASE_URL;

    expect(() => parseAppEnv(env)).toThrow(/DATABASE_URL/);
  });

  it('rejects a malformed encryption key without exposing its value', () => {
    const secretValue = 'not-a-valid-base64-encryption-key';

    expect(() =>
      parseAppEnv({ ...validTestEnv, RAW_DATA_ENCRYPTION_KEY: secretValue }),
    ).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining(secretValue),
      }),
    );
  });

  it('rejects the placeholder source password outside test mode', () => {
    expect(() =>
      parseAppEnv({
        ...validTestEnv,
        NODE_ENV: 'development',
        SOURCE_SITE_URL: 'https://source.example.invalid',
      }),
    ).toThrow(/SOURCE_SITE_PASSWORD/);
  });

  it('requires an HTTPS application origin in production', () => {
    expect(() =>
      parseAppEnv({
        ...validTestEnv,
        NODE_ENV: 'production',
        APP_ORIGIN: 'http://app.example.invalid',
        SOURCE_SITE_URL: 'https://source.example.invalid',
        SOURCE_SITE_PASSWORD: 'non-placeholder-source-password',
      }),
    ).toThrow(/APP_ORIGIN/);
  });

  it('rejects a short session HMAC secret', () => {
    expect(() => parseAppEnv({ ...validTestEnv, SESSION_SECRET: 'too-short' })).toThrow(
      /SESSION_SECRET/,
    );
  });

  it('rejects the public example encryption key outside test mode', () => {
    expect(() =>
      parseAppEnv({
        ...validTestEnv,
        NODE_ENV: 'development',
        SESSION_SECRET: 'synthetic-development-session-secret',
        SOURCE_SITE_URL: 'https://source.example.invalid',
        SOURCE_SITE_PASSWORD: 'non-placeholder-source-password',
      }),
    ).toThrow(/RAW_DATA_ENCRYPTION_KEY/);
  });

  it('parses a valid test configuration', () => {
    expect(parseAppEnv(validTestEnv)).toEqual(validTestEnv);
  });
});
