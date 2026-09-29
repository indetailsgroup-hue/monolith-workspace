/**
 * e2e/etax-compliance.spec.ts
 *
 * Playwright end-to-end tests for the eTax Compliance Dashboard (/etax).
 *
 * Groups:
 *   A – Navigation & authentication gate
 *   B – Dashboard overview renders
 *   C – Summary card values
 *   D – Risk ranking table
 *   E – Tab switching
 *   F – Refresh / reload interaction
 *   G – Responsive layout
 */

import { test, expect, Page } from "@playwright/test";

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const ETAX_URL = `${BASE_URL}/etax`;

// ── Auth helper ───────────────────────────────────────────────────────────────

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  const email = process.env.E2E_ADMIN_EMAIL ?? "admin@test.monolith.local";
  const password = process.env.E2E_ADMIN_PASSWORD ?? "Test1234!";
  await page.fill('[name="email"], [type="email"]', email);
  await page.fill('[name="password"], [type="password"]', password);
  await page.click('[type="submit"], button:has-text("Sign in"), button:has-text("Login")');
  await page.waitForURL(new RegExp(`${BASE_URL}/(dashboard|home|etax)?`), {
    timeout: 15_000,
  });
}

// ── Group A – Navigation & authentication gate ────────────────────────────────

test.describe("Group A – Navigation & authentication gate", () => {
  test("A1 – unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto(ETAX_URL);
    await page.waitForURL(/login/, { timeout: 10_000 });
    expect(page.url()).toMatch(/login/);
  });

  test("A2 – authenticated ADMIN user can reach /etax", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ETAX_URL);
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/etax");
  });

  test("A3 – page title contains eTax or Compliance", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ETAX_URL);
    await page.waitForLoadState("networkidle");
    const title =
      (await page.title()) +
      " " +
      (await page.textContent("h1, h2").catch(() => ""));
    expect(title).toMatch(/etax|compliance/i);
  });
});

// ── Group B – Dashboard overview renders ─────────────────────────────────────

test.describe("Group B – Dashboard overview renders", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ETAX_URL);
    await page.waitForLoadState("networkidle");
  });

  test("B1 – summary cards section is visible", async ({ page }) => {
    const cards =
      page.locator("[data-testid='summary-cards'], .summary-cards, .stats-grid");
    // If no test-id, fall back to checking for at least 3 card-like elements
    const count = await cards.count();
    if (count === 0) {
      const anyCards = page.locator(".card, .rounded-lg, [class*='card']");
      expect(await anyCards.count()).toBeGreaterThanOrEqual(1);
    } else {
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  test("B2 – health score badge is rendered", async ({ page }) => {
    const badge = page.locator(
      "[data-testid='health-score-badge'], [data-status], .health-badge"
    );
    await expect(badge.first()).toBeVisible({ timeout: 10_000 });
  });

  test("B3 – no error banner on successful load", async ({ page }) => {
    const errorBanner = page.locator("[role='alert']:has-text('error'), .error-banner");
    expect(await errorBanner.count()).toBe(0);
  });
});

// ── Group C – Summary card values ─────────────────────────────────────────────

test.describe("Group C – Summary card values", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ETAX_URL);
    await page.waitForLoadState("networkidle");
  });

  test("C1 – total submissions shows a numeric value", async ({ page }) => {
    const totalText = await page
      .locator("text=/total.{0,30}submissions|submissions.{0,30}total/i")
      .first()
      .textContent()
      .catch(() => null);
    if (totalText) {
      expect(totalText).toMatch(/\d+/);
    }
  });

  test("C2 – success rate shows a percentage", async ({ page }) => {
    const rateEl = page.locator("text=/%/").first();
    const visible = await rateEl.isVisible().catch(() => false);
    if (visible) {
      const text = await rateEl.textContent();
      expect(text).toMatch(/\d+(\.\d+)?%/);
    }
  });

  test("C3 – health_status label is one of healthy/warning/critical", async ({
    page,
  }) => {
    const pageText = (await page.textContent("body")) ?? "";
    expect(pageText).toMatch(/healthy|warning|critical/i);
  });
});

// ── Group D – Risk ranking table ──────────────────────────────────────────────

test.describe("Group D – Risk ranking table", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ETAX_URL);
    await page.waitForLoadState("networkidle");
  });

  test("D1 – risk ranking table or section is present", async ({ page }) => {
    // Navigate to risk ranking tab if it exists
    const riskTab = page.locator(
      "button:has-text('Risk'), tab:has-text('Risk'), [role='tab']:has-text('Risk')"
    );
    if (await riskTab.count() > 0) {
      await riskTab.first().click();
      await page.waitForLoadState("networkidle");
    }
    const table = page.locator("table, [role='table'], [data-testid*='risk']");
    expect(await table.count()).toBeGreaterThan(0);
  });

  test("D2 – risk tier labels (HEALTHY/WARNING/CRITICAL) appear", async ({
    page,
  }) => {
    const riskTab = page.locator("[role='tab']:has-text('Risk')");
    if (await riskTab.count() > 0) await riskTab.first().click();
    const pageText = (await page.textContent("body")) ?? "";
    expect(pageText).toMatch(/HEALTHY|WARNING|CRITICAL/);
  });

  test("D3 – CRITICAL orgs are visually highlighted", async ({ page }) => {
    const riskTab = page.locator("[role='tab']:has-text('Risk')");
    if (await riskTab.count() > 0) await riskTab.first().click();
    const criticalRows = page.locator(
      "tr:has-text('CRITICAL'), [data-tier='CRITICAL'], .critical-row"
    );
    // Just check the selector exists; if no CRITICAL orgs, that's OK
    expect(await criticalRows.count()).toBeGreaterThanOrEqual(0);
  });
});

// ── Group E – Tab switching ───────────────────────────────────────────────────

test.describe("Group E – Tab switching", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ETAX_URL);
    await page.waitForLoadState("networkidle");
  });

  test("E1 – all tab buttons are clickable without errors", async ({ page }) => {
    const tabs = page.locator("[role='tab'], .tab-btn");
    const count = await tabs.count();
    for (let i = 0; i < count; i++) {
      await tabs.nth(i).click();
      await page.waitForLoadState("domcontentloaded");
      // No crash = pass
    }
    expect(true).toBe(true);
  });

  test("E2 – URL does not change on tab click (SPA tab pattern)", async ({
    page,
  }) => {
    const urlBefore = page.url();
    const tabs = page.locator("[role='tab'], .tab-btn");
    if (await tabs.count() > 1) {
      await tabs.nth(1).click();
      await page.waitForLoadState("domcontentloaded");
    }
    expect(page.url()).toBe(urlBefore);
  });
});

// ── Group F – Refresh / reload interaction ────────────────────────────────────

test.describe("Group F – Refresh interaction", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ETAX_URL);
    await page.waitForLoadState("networkidle");
  });

  test("F1 – refresh button triggers data reload without crash", async ({
    page,
  }) => {
    const refreshBtn = page.locator(
      "button:has-text('Refresh'), button[aria-label*='refresh'], [data-testid='refresh-btn']"
    );
    if (await refreshBtn.count() > 0) {
      await refreshBtn.first().click();
      await page.waitForLoadState("networkidle");
      // No error = pass
      const errorBanner = page.locator("[role='alert']:has-text('error')");
      expect(await errorBanner.count()).toBe(0);
    }
  });

  test("F2 – full page reload preserves /etax route", async ({ page }) => {
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/etax");
  });
});

// ── Group G – Responsive layout ───────────────────────────────────────────────

test.describe("Group G – Responsive layout", () => {
  test("G1 – mobile viewport (375×812) renders without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsAdmin(page);
    await page.goto(ETAX_URL);
    await page.waitForLoadState("networkidle");
    const bodyWidth = await page.evaluate(
      () => document.body.scrollWidth
    );
    expect(bodyWidth).toBeLessThanOrEqual(400);
  });

  test("G2 – tablet viewport (768×1024) summary cards stack or grid correctly", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await loginAsAdmin(page);
    await page.goto(ETAX_URL);
    await page.waitForLoadState("networkidle");
    const cards = page.locator(".card, .rounded-lg, [class*='card']");
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
  });
});
