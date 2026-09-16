import { defineConfig, devices } from '@playwright/test';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('TEST_DATABASE_URL or DATABASE_URL is required for Playwright');
}

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
      command:
        'npm run start --workspace @bazols/api',
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        SESSION_SECRET: 'synthetic-e2e-session-secret-at-least-32-characters',
        RAW_DATA_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
        SOURCE_SITE_URL: 'http://127.0.0.1:9999',
        SOURCE_SITE_LOGIN: 'synthetic-login',
        SOURCE_SITE_PASSWORD: 'synthetic-password',
        APP_ORIGIN: 'http://127.0.0.1:5173',
        PORT: '8000',
      },
      url: 'http://127.0.0.1:8000/health/live',
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev --workspace @bazols/web',
      url: 'http://127.0.0.1:5173',
      timeout: 30_000,
      reuseExistingServer: false,
    },
  ],
});
