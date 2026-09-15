import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Integration suites share one disposable PostgreSQL schema and clean it
    // between tests, so running test files concurrently creates FK races.
    fileParallelism: false,
  },
});
