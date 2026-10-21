import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 90000,
  use: { baseURL: 'http://127.0.0.1:4318', headless: true, channel: 'chrome', trace: 'retain-on-failure', viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:4318/api/health', reuseExistingServer: !process.env.CI, timeout: 60000 },
});
