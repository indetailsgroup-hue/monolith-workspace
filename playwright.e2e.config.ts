import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for application E2E tests.
 *
 * The default playwright.config.ts is reserved for Storybook/Chromatic visual
 * specs. Keeping an explicit E2E config prevents UI release gates from
 * accidentally starting the Storybook server and selecting visual tests.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    // Local verification can reuse an installed browser (for example
    // PLAYWRIGHT_CHANNEL=chrome) while CI keeps using its pinned Playwright
    // Chromium download.
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
