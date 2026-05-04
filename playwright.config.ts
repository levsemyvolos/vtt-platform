import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/e2e/tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  webServer: [
    {
      command: 'pnpm --filter @vtt/client dev',
      url: 'http://localhost:5173',
      timeout: 120000,
      reuseExistingServer: !process.env['CI'],
    },
    {
      command: 'pnpm --filter @vtt/server dev',
      url: 'http://localhost:4000/health',
      timeout: 120000,
      reuseExistingServer: !process.env['CI'],
    },
  ],

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
