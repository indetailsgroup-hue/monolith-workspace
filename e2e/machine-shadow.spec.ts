import { test, expect } from '@playwright/test';

/**
 * e2e/machine-shadow.spec.ts
 *
 * Full Digital Shadow flow:
 *   1. SSE alarm arrives  → overallHealth degrades to DEGRADING
 *   2. Stale-features banner appears (cacheAge > 300 s TTL)
 *   3. Clicking force-refresh-btn calls GET /maintenance?force-refresh=true
 *   4. Banner clears on success (staleFeatures=false in fresh response)
 *
 * Route-mock registration order matters in Playwright (LIFO within page.route):
 * register most-specific last so it wins.
 */

const MACHINE_ID    = 'cnc-001';
const ALARM_MESSAGE = 'Spindle bearing degrading';

// ── Maintenance response fixtures ──────────────────────────────────────────────

const maintenanceStale = {
  machineId:        MACHINE_ID,
  assessedAt:       new Date().toISOString(),
  operatingHours:   1200,
  overallHealth:    'DEGRADING',
  criticalCount:    1,
  warningCount:     2,
  cacheAge:         400_000,   // > 300 000 ms TTL → stale
  staleFeatures:    true,
  components: [
    { componentType: 'SPINDLE',        healthStatus: 'DEGRADING', degradationScore: 0.72, remainingUsefulLife: 800, lastUpdated: new Date().toISOString() },
    { componentType: 'BALL_SCREW_X',   healthStatus: 'HEALTHY',   degradationScore: 0.10, remainingUsefulLife: 9000, lastUpdated: new Date().toISOString() },
    { componentType: 'BALL_SCREW_Y',   healthStatus: 'HEALTHY',   degradationScore: 0.12, remainingUsefulLife: 8800, lastUpdated: new Date().toISOString() },
    { componentType: 'BALL_SCREW_Z',   healthStatus: 'HEALTHY',   degradationScore: 0.09, remainingUsefulLife: 9200, lastUpdated: new Date().toISOString() },
    { componentType: 'LINEAR_GUIDE_X', healthStatus: 'HEALTHY',   degradationScore: 0.05, remainingUsefulLife: 9500, lastUpdated: new Date().toISOString() },
    { componentType: 'LINEAR_GUIDE_Y', healthStatus: 'HEALTHY',   degradationScore: 0.06, remainingUsefulLife: 9400, lastUpdated: new Date().toISOString() },
    { componentType: 'LINEAR_GUIDE_Z', healthStatus: 'HEALTHY',   degradationScore: 0.04, remainingUsefulLife: 9600, lastUpdated: new Date().toISOString() },
    { componentType: 'TOOL_HOLDER',    healthStatus: 'WARNING',   degradationScore: 0.55, remainingUsefulLife: 2000, lastUpdated: new Date().toISOString() },
    { componentType: 'VACUUM_PUMP',    healthStatus: 'HEALTHY',   degradationScore: 0.20, remainingUsefulLife: 6000, lastUpdated: new Date().toISOString() },
    { componentType: 'ATC_MAGAZINE',   healthStatus: 'CRITICAL',  degradationScore: 0.88, remainingUsefulLife: 400,  lastUpdated: new Date().toISOString() },
  ],
};

const maintenanceFresh = {
  ...maintenanceStale,
  cacheAge:      5_000,    // fresh — just reset
  staleFeatures: false,
};

// ── Machine list fixture ───────────────────────────────────────────────────────

const machineList = [
  {
    machineId:         MACHINE_ID,
    name:              'CNC Mill 001',
    model:             'DMG MORI NHX 5000',
    location:          'Bay A',
    operationalStatus: 'DEGRADING',
    alarms:            [ALARM_MESSAGE],
    components:        maintenanceStale.components,
  },
];

// ── SSE body ───────────────────────────────────────────────────────────────────

const alarmEvent = `event: alarm\ndata: ${JSON.stringify({
  source: MACHINE_ID,
  data:   { message: ALARM_MESSAGE, machineId: MACHINE_ID },
})}\n\n`;

const stateEvent = `event: state\ndata: ${JSON.stringify({
  data: {
    machineId:         MACHINE_ID,
    operationalStatus: 'DEGRADING',
    alarms:            [ALARM_MESSAGE],
    components:        maintenanceStale.components,
  },
})}\n\n`;

const sseBody = alarmEvent + stateEvent;

// ─────────────────────────────────────────────────────────────────────────────

test.describe('MachineShadow — full Digital Shadow flow', () => {
  test('SSE alarm → stale banner appears → force-refresh clears it', async ({ page }) => {
    let forceRefreshCalled = false;

    // ── Register route mocks (most-specific last = highest priority in Playwright) ──

    // 1. Health check
    await page.route('**/health', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) }),
    );

    // 2. Machine list
    await page.route('**/machines', (route) => {
      // Ignore requests with more path segments (e.g. /machines/cnc-001/...)
      const url = new URL(route.request().url());
      if (url.pathname.replace(/\/$/, '').endsWith('/machines')) {
        return route.fulfill({
          status:      200,
          contentType: 'application/json',
          body:        JSON.stringify(machineList),
        });
      }
      return route.continue();
    });

    // 3. Maintenance endpoint — handles both normal and force-refresh requests
    await page.route(`**/machines/${MACHINE_ID}/maintenance**`, (route) => {
      const url = route.request().url();
      if (url.includes('force-refresh=true')) {
        forceRefreshCalled = true;
        return route.fulfill({
          status:      200,
          contentType: 'application/json',
          body:        JSON.stringify(maintenanceFresh),
        });
      }
      return route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify(maintenanceStale),
      });
    });

    // 4. SSE stream — deliver alarm + state events then keep stream open
    await page.route(`**/machines/${MACHINE_ID}/events`, (route) =>
      route.fulfill({
        status:      200,
        contentType: 'text/event-stream',
        headers:     {
          'Cache-Control': 'no-cache',
          'Connection':    'keep-alive',
        },
        body: sseBody,
      }),
    );

    // ── Navigate to factory page ───────────────────────────────────────────────

    await page.goto('/factory');

    // Open the Digital Shadow tab
    await page.getByRole('button', { name: /digital shadow/i }).click();

    // Select our machine from the list
    await page.getByText(MACHINE_ID).first().click({ timeout: 10_000 });

    // ── Assert: alarm message surfaced ────────────────────────────────────────

    await expect(
      page.getByText(ALARM_MESSAGE),
    ).toBeVisible({ timeout: 10_000 });

    // ── Assert: stale-features banner visible (cacheAge > TTL) ───────────────

    await expect(
      page.getByTestId('stale-features-toast'),
    ).toBeVisible({ timeout: 10_000 });

    // ── Act: click force-refresh-btn ─────────────────────────────────────────

    await page.getByTestId('force-refresh-btn').click();

    // ── Assert: banner clears after fresh maintenance response ───────────────

    await expect(
      page.getByTestId('stale-features-toast'),
    ).not.toBeVisible({ timeout: 10_000 });

    // ── Assert: force-refresh endpoint was actually called ───────────────────

    expect(forceRefreshCalled).toBe(true);
  });
});
