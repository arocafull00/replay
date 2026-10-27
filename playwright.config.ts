import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e', timeout: 100_000, expect: { timeout: 20_000 }, workers: 2,
  use: { baseURL: process.env.TEST_BASE_URL || 'http://localhost:4317', headless: true, viewport: { width: 1280, height: 800 }, trace: 'retain-on-failure' },
  webServer: process.env.TEST_BASE_URL ? undefined : { command: 'pnpm exec serve out -l 4317', url: 'http://localhost:4317', reuseExistingServer: false },
});
