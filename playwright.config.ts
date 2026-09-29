import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Chromatic visual regression tests.
 *
 * Tests in `*.visual.spec.ts` use `@chromatic-com/playwright` to take
 * named snapshots that are uploaded to Chromatic via:
 *   npx chromatic --playwright --project-token=$CHROMATIC_PLAYWRIGHT_PROJECT_TOKEN
 *
 * Target: Storybook static build served on port 6006.
 * In CI the Storybook is pre-built by a prior step (storybook-static/).
 * Locally, `npm run storybook` is started automatically.
 */

const CI = !!process.env.CI;
const STORYBOOK_PORT = 6007; // offset from dev server to avoid collision

export default defineConfig({
  // Only match visual spec files — keep separate from unit tests
  testDir: './src',
  testMatch: '**/*.visual.spec.ts',

  // Visual tests must run sequentially (one browser at a time for Chromatic)
  fullyParallel: false,
  workers: 1,

  // Retry once in CI to reduce flakiness from animation timing
  retries: CI ? 1 : 0,
  forbidOnly: CI,

  reporter: CI
    ? [['github'], ['html', { open: 'never' }]]
    : 'html',

  use: {
    baseURL: `http://localhost:${STORYBOOK_PORT}`,
    // Capture trace on retry so failures are diagnosable
    trace: 'on-first-retry',
    // Stable viewport for visual consistency
    viewport: { width: 1280, height: 720 },
    // Wait for network to settle before snapshots
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  webServer: CI
    ? {
        // In CI: serve pre-built storybook-static directory
        command: `npx http-server storybook-static --port ${STORYBOOK_PORT} --silent --cors`,
        url: `http://localhost:${STORYBOOK_PORT}`,
        reuseExistingServer: false,
        timeout: 60_000,
      }
    : {
        // Locally: start Storybook dev server (reuse if already running)
        command: `npm run storybook -- --port ${STORYBOOK_PORT} --no-open`,
        url: `http://localhost:${STORYBOOK_PORT}`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
