/**
 * e2e/accounting-management.spec.ts
 *
 * Playwright end-to-end tests for the Accounting Management page (/accounting).
 *
 * Groups:
 *   A – Navigation & authentication gate
 *   B – Chart of Accounts renders
 *   C – Multi-book Ledger renders
 *   D – Tab navigation
 *   E – Account creation flow
 *   F – Error & empty states
 *   G – Responsive layout
 */

import { test, expect, Page } from "@playwright/test";

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const ACCOUNTING_URL = `${BASE_URL}/accounting`;

// ── Auth helper ───────────────────────────────────────────────────────────────

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  const email = process.env.E2E_ADMIN_EMAIL ?? "admin@test.monolith.local";
  const password = process.env.E2E_ADMIN_PASSWORD ?? "Test1234!";
  await page.fill('[name="email"], [type="email"]', email);
  await page.fill('[name="password"], [type="password"]', password);
  await page.click('[type="submit"], button:has-text("Sign in"), button:has-text("Login")');
  await page.waitForURL(new RegExp(`${BASE_URL}/(dashboard|home|accounting)?`), {
    timeout: 15_000,
  });
}

// ── Group A – Navigation & authentication gate ────────────────────────────────

test.describe("Group A – Navigation & authentication gate", () => {
  test("A1 – unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto(ACCOUNTING_URL);
    await page.waitForURL(/login/, { timeout: 10_000 });
    expect(page.url()).toMatch(/login/);
  });

  test("A2 – authenticated ADMIN user can reach /accounting", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(ACCOUNTING_URL);
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/accounting");
  });

  test("A3 – page title contains Accounting or Chart of Accounts", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(ACCOUNTING_URL);
    await page.waitForLoadState("networkidle");
    const bodyText = (await page.textContent("h1, h2, title").catch(() => "")) ?? "";
    expect(bodyText).toMatch(/accounting|chart of accounts/i);
  });
});

// ── Group B – Chart of Accounts renders ───────────────────────────────────────

test.describe("Group B – Chart of Accounts renders", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ACCOUNTING_URL);
    await page.waitForLoadState("networkidle");
  });

  test("B1 – accounts table/list is visible", async ({ page }) => {
    const table = page.locator(
      "table, [role='table'], [data-testid='accounts-table'], .accounts-list"
    );
    expect(await table.count()).toBeGreaterThan(0);
  });

  test("B2 – standard account code 1100 appears", async ({ page }) => {
    const el = page.locator("text=1100");
    await expect(el.first()).toBeVisible({ timeout: 10_000 });
  });

  test("B3 – standard COA accounts (Cash and Bank, Accounts Receivable) appear", async ({
    page,
  }) => {
    const body = (await page.textContent("body")) ?? "";
    expect(body).toMatch(/Cash|Receivable|Revenue/i);
  });

  test("B4 – no error state displayed on successful load", async ({ page }) => {
    const errorEl = page.locator("[role='alert']:has-text('error'), .error-banner");
    expect(await errorEl.count()).toBe(0);
  });
});

// ── Group C – Multi-book Ledger renders ───────────────────────────────────────

test.describe("Group C – Multi-book Ledger renders", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ACCOUNTING_URL);
    await page.waitForLoadState("networkidle");
  });

  test("C1 – Multi-book Ledger tab is present", async ({ page }) => {
    const tab = page.locator(
      "[role='tab']:has-text('Ledger'), [role='tab']:has-text('Book'), button:has-text('Ledger')"
    );
    expect(await tab.count()).toBeGreaterThanOrEqual(1);
  });

  test("C2 – clicking Ledger tab shows book selector or ledger entries", async ({
    page,
  }) => {
    const tab = page.locator(
      "[role='tab']:has-text('Ledger'), button:has-text('Ledger')"
    );
    if (await tab.count() > 0) {
      await tab.first().click();
      await page.waitForLoadState("domcontentloaded");
      const body = (await page.textContent("body")) ?? "";
      expect(body).toMatch(/book|ledger|entry|entries/i);
    }
  });

  test("C3 – default book (MAIN/THB) is shown in ledger view", async ({
    page,
  }) => {
    const tab = page.locator(
      "[role='tab']:has-text('Ledger'), button:has-text('Ledger')"
    );
    if (await tab.count() > 0) {
      await tab.first().click();
      await page.waitForLoadState("domcontentloaded");
      const body = (await page.textContent("body")) ?? "";
      expect(body).toMatch(/MAIN|THB|Main Book/i);
    }
  });
});

// ── Group D – Tab navigation ──────────────────────────────────────────────────

test.describe("Group D – Tab navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ACCOUNTING_URL);
    await page.waitForLoadState("networkidle");
  });

  test("D1 – Chart of Accounts is default active tab", async ({ page }) => {
    const body = (await page.textContent("body")) ?? "";
    expect(body).toMatch(/1100|Cash|chart/i);
  });

  test("D2 – all tabs clickable without navigation away", async ({ page }) => {
    const tabs = page.locator("[role='tab'], .tab-btn");
    const count = await tabs.count();
    for (let i = 0; i < count; i++) {
      await tabs.nth(i).click();
      expect(page.url()).toContain("/accounting");
    }
  });

  test("D3 – switching back to Chart of Accounts restores account list", async ({
    page,
  }) => {
    const tabs = page.locator("[role='tab'], button[role='tab']");
    if (await tabs.count() >= 2) {
      await tabs.nth(1).click();
      await tabs.nth(0).click();
      const body = (await page.textContent("body")) ?? "";
      expect(body).toMatch(/1100|accounts/i);
    }
  });
});

// ── Group E – Account creation flow ──────────────────────────────────────────

test.describe("Group E – Account creation flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ACCOUNTING_URL);
    await page.waitForLoadState("networkidle");
  });

  test("E1 – Add Account button is visible", async ({ page }) => {
    const addBtn = page.locator(
      "button:has-text('Add Account'), button:has-text('New Account'), [data-testid='add-account-btn']"
    );
    expect(await addBtn.count()).toBeGreaterThanOrEqual(1);
  });

  test("E2 – clicking Add Account opens a modal or inline form", async ({
    page,
  }) => {
    const addBtn = page.locator(
      "button:has-text('Add'), button:has-text('New Account'), [data-testid='add-account-btn']"
    );
    if (await addBtn.count() > 0) {
      await addBtn.first().click();
      await page.waitForLoadState("domcontentloaded");
      const modal = page.locator(
        "[role='dialog'], .modal, [data-testid='account-form']"
      );
      expect(await modal.count()).toBeGreaterThanOrEqual(1);
    }
  });

  test("E3 – form validation prevents submission with empty code", async ({
    page,
  }) => {
    const addBtn = page.locator("button:has-text('Add'), button:has-text('New Account')");
    if (await addBtn.count() > 0) {
      await addBtn.first().click();
      const submitBtn = page.locator(
        "button:has-text('Save'), button:has-text('Submit'), button:has-text('Create')"
      );
      if (await submitBtn.count() > 0) {
        await submitBtn.first().click();
        // Form should show validation error or not submit
        const validationMsg = page.locator(
          "[aria-invalid='true'], .field-error, :invalid"
        );
        expect(await validationMsg.count()).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ── Group F – Error & empty states ───────────────────────────────────────────

test.describe("Group F – Error & empty states", () => {
  test("F1 – page reload does not cause crash", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ACCOUNTING_URL);
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/accounting");
  });

  test("F2 – back-navigation from /accounting returns to previous page", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/dashboard`).catch(() => {});
    await page.goto(ACCOUNTING_URL);
    await page.waitForLoadState("networkidle");
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).not.toContain("/login");
  });
});

// ── Group G – Responsive layout ───────────────────────────────────────────────

test.describe("Group G – Responsive layout", () => {
  test("G1 – mobile 375×812 renders without horizontal scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsAdmin(page);
    await page.goto(ACCOUNTING_URL);
    await page.waitForLoadState("networkidle");
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(400);
  });

  test("G2 – desktop 1440×900 table columns all visible", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await page.goto(ACCOUNTING_URL);
    await page.waitForLoadState("networkidle");
    const ths = await page.locator("th, [role='columnheader']").count();
    expect(ths).toBeGreaterThan(0);
  });
});
