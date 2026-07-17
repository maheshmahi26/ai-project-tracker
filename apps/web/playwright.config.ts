import { defineConfig, devices } from '@playwright/test';

// The web dev server proxies `/api` to the NestJS backend, so tests only ever
// talk to the web origin. `PORT` mirrors the API port (see the root .env).
const API_PORT = process.env.PORT ?? '3000';
const WEB_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Boots the full stack for a one-command local run. In CI the servers are
  // started the same way (Mongo/Redis are provided as services/actions).
  webServer: [
    {
      command: 'pnpm --filter @ai-projectos/api dev',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter @ai-projectos/web dev',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
