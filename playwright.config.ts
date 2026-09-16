import { defineConfig, devices } from '@playwright/test';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('TEST_DATABASE_URL or DATABASE_URL is required for Playwright');
}

const serviceEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  SESSION_SECRET: 'synthetic-e2e-session-secret-at-least-32-characters',
  RAW_DATA_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  SOURCE_SITE_URL: 'http://127.0.0.1:9999',
  SOURCE_SITE_LOGIN: 'source-login',
  SOURCE_SITE_PASSWORD: 'source-password',
  APP_ORIGIN: 'http://127.0.0.1:5173',
  PORT: '8000',
};

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'mkdir -p .e2e-logs && exec node --experimental-strip-types test/fake-source/cli.ts > .e2e-logs/fake-source.log 2>&1',
      env: { FAKE_SOURCE_PORT: '9999' },
      url: 'http://127.0.0.1:9999/__health',
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: 'mkdir -p .e2e-logs && exec npm run start --workspace @bazols/api > .e2e-logs/api.log 2>&1',
      env: serviceEnv,
      url: 'http://127.0.0.1:8000/health/live',
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: 'mkdir -p .e2e-logs && exec npm run start:worker --workspace @bazols/api > .e2e-logs/worker.log 2>&1',
      env: serviceEnv,
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: 'mkdir -p .e2e-logs && exec npm run dev --workspace @bazols/web > .e2e-logs/web.log 2>&1',
      url: 'http://127.0.0.1:5173',
      timeout: 30_000,
      reuseExistingServer: false,
    },
  ],
});
