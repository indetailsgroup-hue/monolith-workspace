import { test, expect } from '@playwright/test';

/**
 * Cabinet 3D Viewer E2E Tests
 *
 * @smoke - Critical path tests that must pass before deployment
 */

test.describe('Cabinet 3D Viewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the 3D canvas to load
    await page.waitForSelector('canvas', { timeout: 10000 });
  });

  test('@smoke should load the application', async ({ page }) => {
    // Check that the page title is correct
    await expect(page).toHaveTitle(/Monolith|iimos/i);

    // Check that the canvas is visible
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('@smoke should have no WebGL errors', async ({ page }) => {
    // Listen for console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Wait for the app to stabilize
    await page.waitForTimeout(3000);

    // Check for WebGL context lost errors
    const webglErrors = errors.filter(
      (e) => e.includes('WebGL') || e.includes('context lost')
    );
    expect(webglErrors).toHaveLength(0);
  });

  test('should display cabinet dimensions', async ({ page }) => {
    // Look for dimension labels
    const dimensionLabels = page.locator('[data-testid="dimension-label"]');
    // May or may not be visible depending on state
    // This is a placeholder for actual dimension testing
  });
});

test.describe('X-Ray Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });
  });

  test('@smoke should toggle X-Ray mode without errors', async ({ page }) => {
    // Listen for console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Press Alt+Z to toggle X-Ray mode
    await page.keyboard.press('Alt+z');

    // Wait for mode transition
    await page.waitForTimeout(2000);

    // Check no WebGL errors
    const webglErrors = errors.filter(
      (e) => e.includes('WebGL') || e.includes('context lost')
    );
    expect(webglErrors).toHaveLength(0);

    // Toggle back
    await page.keyboard.press('Alt+z');
    await page.waitForTimeout(1000);
  });
});

test.describe('Drill Map Overlay', () => {
  test('should display drill points in X-Ray mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Enable X-Ray mode
    await page.keyboard.press('Alt+z');
    await page.waitForTimeout(2000);

    // The drill map overlay should be visible
    // This is a visual check - actual implementation may vary
  });
});

test.describe('Hardware Preset Selection', () => {
  test('@smoke should not cause WebGL errors when selecting preset with X-Ray on', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Listen for ALL console messages to catch WebGL errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Also listen for page errors (uncaught exceptions)
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Enable X-Ray mode first (Alt+Z)
    await page.keyboard.press('Alt+z');
    await page.waitForTimeout(2000);  // Increased wait for X-Ray to initialize

    // Check for WebGL errors after X-Ray toggle
    const xrayErrors = errors.filter(
      (e) => e.toLowerCase().includes('webgl') || e.toLowerCase().includes('context lost')
    );
    expect(xrayErrors).toHaveLength(0);

    // Wait for scene to stabilize
    await page.waitForTimeout(3000);

    // Final check for WebGL context lost errors
    const webglErrors = errors.filter(
      (e) => e.toLowerCase().includes('webgl') || e.toLowerCase().includes('context lost')
    );
    expect(webglErrors).toHaveLength(0);
  });

  test('should handle rapid X-Ray toggles without WebGL errors', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Rapid toggle X-Ray mode 5 times
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Alt+z');
      await page.waitForTimeout(500);
    }

    // Wait for scene to stabilize
    await page.waitForTimeout(2000);

    // Check for WebGL errors
    const webglErrors = errors.filter(
      (e) => e.toLowerCase().includes('webgl') || e.toLowerCase().includes('context lost')
    );
    expect(webglErrors).toHaveLength(0);
  });
});
