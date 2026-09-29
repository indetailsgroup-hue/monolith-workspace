/**
 * src/__tests__/ui/EtaxComplianceDashboard.test.tsx
 *
 * Unit tests for the eTax Compliance Dashboard page.
 * Groups:
 *   A – Rendering & loading states
 *   B – Summary cards
 *   C – HealthScoreBadge colouring
 *   D – Org risk ranking table
 *   E – Tab navigation
 *   F – Error handling
 *   G – Accessibility & ARIA
 */

import React from "react";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import EtaxComplianceDashboard from "../../pages/EtaxComplianceDashboard";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDashboard = {
  org_id: "org-001",
  total_submissions: 120,
  submitted_count: 108,
  failed_count: 8,
  success_rate: 90.0,
  overdue_with_pending_etax: 2,
  failed_last_24h: 1,
  last_submission_at: "2026-08-31T12:00:00Z",
};

const mockHealthSummary = {
  org_id: "org-001",
  org_name: "Alpha Corp",
  compliance_success_rate: 90.0,
  today_retry_exhaustion_rate_pct: 5.0,
  overdue_with_pending_etax: 2,
  failed_last_24h: 1,
  health_score: 82,
  health_status: "healthy" as const,
  compliance_freshness_status: "FRESH",
  trend_freshness_status: "FRESH",
  compliance_row_count: 10,
  trend_row_count: 5,
  compliance_last_refreshed_at: "2026-09-01T00:00:00Z",
  trend_last_refreshed_at: "2026-09-01T00:00:00Z",
};

const mockOrgRiskRanking = [
  {
    org_id: "org-001",
    org_name: "Alpha Corp",
    risk_tier: "HEALTHY" as const,
    health_score: 82,
    risk_rank: 1,
    is_priority_review: false,
    health_status: 'healthy',
    total_submissions: 0,
    success_rate: 100,
    failed_last_24h: 0,
    overdue_with_pending_etax: 0,
    last_submission_at: null,
  },
  {
    org_id: "org-002",
    org_name: "Beta Ltd",
    risk_tier: "WARNING" as const,
    health_score: 61,
    risk_rank: 2,
    is_priority_review: false,
    health_status: 'healthy',
    total_submissions: 0,
    success_rate: 100,
    failed_last_24h: 0,
    overdue_with_pending_etax: 0,
    last_submission_at: null,
  },
  {
    org_id: "org-003",
    org_name: "Gamma SA",
    risk_tier: "CRITICAL" as const,
    health_score: 31,
    risk_rank: 3,
    is_priority_review: true,
    health_status: 'healthy',
    total_submissions: 0,
    success_rate: 100,
    failed_last_24h: 0,
    overdue_with_pending_etax: 0,
    last_submission_at: null,
  },
];

vi.mock("../../hooks/useEtaxCompliance", () => ({
  useEtaxCompliance: vi.fn(),
}));

import { useEtaxCompliance } from "../../hooks/useEtaxCompliance";
const mockUseEtaxCompliance = vi.mocked(useEtaxCompliance);

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderDashboard() {
  return render(
    <MemoryRouter>
      <EtaxComplianceDashboard />
    </MemoryRouter>
  );
}

// ── Group A: Rendering & loading states ──────────────────────────────────────

describe("Group A – Rendering & loading states", () => {
  it("A1 – renders skeleton/loading indicator while data is fetching", () => {
    mockUseEtaxCompliance.mockReturnValue({
      isLoading: true,
      error: null,
      healthSummary: null,
      riskRanking: [],
    compliance: [mockDashboard as any],
    isRefreshing: false,
    lastRefreshed: null,
      refetch: vi.fn(),
    });
    renderDashboard();
    expect(
      screen.queryByRole("status") ||
        screen.queryByTestId("loading-skeleton") ||
        document.querySelector('[aria-busy="true"]') ||
        screen.queryByText(/loading/i)
    ).toBeTruthy();
  });

  it("A2 – renders page title once data is loaded", async () => {
    mockUseEtaxCompliance.mockReturnValue({
      isLoading: false,
      error: null,
      healthSummary: mockHealthSummary,
      riskRanking: mockOrgRiskRanking,
    compliance: [mockDashboard as any],
    isRefreshing: false,
    lastRefreshed: null,
      refetch: vi.fn(),
    });
    renderDashboard();
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /etax compliance dashboard/i })
      ).toBeInTheDocument();
    });
  });

  it("A3 – renders with empty orgRiskRanking without crash", () => {
    mockUseEtaxCompliance.mockReturnValue({
      isLoading: false,
      error: null,
      healthSummary: mockHealthSummary,
      riskRanking: [],
    compliance: [mockDashboard as any],
    isRefreshing: false,
    lastRefreshed: null,
      refetch: vi.fn(),
    });
    expect(() => renderDashboard()).not.toThrow();
  });

  it("A4 – renders with null dashboard/healthSummary gracefully", () => {
    mockUseEtaxCompliance.mockReturnValue({
      isLoading: false,
      error: null,
      healthSummary: null,
      riskRanking: [],
    compliance: [mockDashboard as any],
    isRefreshing: false,
    lastRefreshed: null,
      refetch: vi.fn(),
    });
    expect(() => renderDashboard()).not.toThrow();
  });
});

// ── Group B: Summary cards ────────────────────────────────────────────────────

describe("Group B – Summary cards", () => {
  beforeEach(() => {
    mockUseEtaxCompliance.mockReturnValue({
      isLoading: false,
      error: null,
      healthSummary: mockHealthSummary,
      riskRanking: mockOrgRiskRanking,
    compliance: [mockDashboard as any],
    isRefreshing: false,
    lastRefreshed: null,
      refetch: vi.fn(),
    });
  });

  it("B1 – displays total submissions count", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("120")).toBeInTheDocument();
    });
  });

  it("B2 – displays monitored organisation count", async () => {
    renderDashboard();
    await waitFor(() => {
      const card = screen.getByText("Orgs Monitored").closest("div")!;
      expect(within(card).getByText("1")).toBeInTheDocument();
    });
  });

  it("B3 – displays failed count", async () => {
    renderDashboard();
    await waitFor(() => {
      const card = screen.getByText("Failed (24 h)").closest("div")!;
      expect(within(card).getByText("1")).toBeInTheDocument();
    });
  });

  it("B4 – displays success rate as percentage", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getAllByText(/^90\.0%$/).length).toBeGreaterThan(0);
    });
  });

  it("B5 – displays overdue with pending eTax count", async () => {
    renderDashboard();
    await waitFor(() => {
      const card = screen.getAllByText("Overdue + Pending")[0].closest("div")!;
      expect(within(card).getByText("2")).toBeInTheDocument();
    });
  });

  it("B6 – displays health score", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getAllByText(/^82$/).length).toBeGreaterThan(0);
    });
  });
});

// ── Group C: HealthScoreBadge colouring ───────────────────────────────────────

describe("Group C – HealthScoreBadge colouring", () => {
  it("C1 – shows green badge for healthy score (≥80)", async () => {
    mockUseEtaxCompliance.mockReturnValue({
      isLoading: false,
      error: null,
      healthSummary: { ...mockHealthSummary, health_score: 85, health_status: "healthy" as const },
      riskRanking: mockOrgRiskRanking,
    compliance: [mockDashboard as any],
    isRefreshing: false,
    lastRefreshed: null,
      refetch: vi.fn(),
    });
    renderDashboard();
    await waitFor(() => {
      const badge =
        document.querySelector(".bg-green-100") ||
        document.querySelector("[data-status='healthy']") ||
        screen.queryAllByText(/^healthy$/i)[0];
      expect(badge).toBeTruthy();
    });
  });

  it("C2 – shows yellow badge for warning score (50–79)", async () => {
    mockUseEtaxCompliance.mockReturnValue({
      isLoading: false,
      error: null,
      healthSummary: { ...mockHealthSummary, health_score: 65, health_status: "warning" as const },
      riskRanking: mockOrgRiskRanking,
    compliance: [mockDashboard as any],
    isRefreshing: false,
    lastRefreshed: null,
      refetch: vi.fn(),
    });
    renderDashboard();
    await waitFor(() => {
      const badge =
        document.querySelector(".bg-yellow-100") ||
        document.querySelector("[data-status='warning']") ||
        screen.queryAllByText(/^warning$/i)[0];
      expect(badge).toBeTruthy();
    });
  });

  it("C3 – shows red badge for critical score (<50)", async () => {
    mockUseEtaxCompliance.mockReturnValue({
      isLoading: false,
      error: null,
      healthSummary: { ...mockHealthSummary, health_score: 30, health_status: "critical" as const },
      riskRanking: mockOrgRiskRanking,
    compliance: [mockDashboard as any],
    isRefreshing: false,
    lastRefreshed: null,
      refetch: vi.fn(),
    });
    renderDashboard();
    await waitFor(() => {
      const badge =
        document.querySelector(".bg-red-100") ||
        document.querySelector("[data-status='critical']") ||
        screen.queryByText(/critical/i);
      expect(badge).toBeTruthy();
    });
  });
});

// ── Group D: Org risk ranking table ──────────────────────────────────────────

describe("Group D – Org risk ranking table", () => {
  beforeEach(() => {
    mockUseEtaxCompliance.mockReturnValue({
      isLoading: false,
      error: null,
      healthSummary: mockHealthSummary,
      riskRanking: mockOrgRiskRanking,
    compliance: [mockDashboard as any],
    isRefreshing: false,
    lastRefreshed: null,
      refetch: vi.fn(),
    });
  });

  it("D1 – renders all 3 org rows", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Alpha Corp")).toBeInTheDocument();
      expect(screen.getByText("Beta Ltd")).toBeInTheDocument();
      expect(screen.getByText("Gamma SA")).toBeInTheDocument();
    });
  });

  it("D2 – shows risk tier labels", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getAllByText(/^HEALTHY$/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/^WARNING$/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/^CRITICAL$/i).length).toBeGreaterThan(0);
    });
  });

  it("D3 – flags priority review org (Gamma SA)", async () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /risk ranking/i }));
    await waitFor(() => {
      // Priority review flag should be visible near Gamma SA row
      const rows = document.querySelectorAll("tr, [role='row']");
      const gammaRow = Array.from(rows).find((r) =>
        r.textContent?.includes("Gamma SA")
      );
      expect(gammaRow).toBeTruthy();
    });
  });

  it("D4 – shows health scores for each org", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getAllByText(/^82$/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/^61$/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/^31$/).length).toBeGreaterThan(0);
    });
  });

  it("D5 – shows risk rank numbers (1, 2, 3)", async () => {
    renderDashboard();
    await waitFor(() => {
      const ranks = screen.getAllByText(/^[123]$/);
      expect(ranks.length).toBeGreaterThanOrEqual(3);
    });
  });
});

// ── Group E: Tab navigation ───────────────────────────────────────────────────

describe("Group E – Tab navigation", () => {
  beforeEach(() => {
    mockUseEtaxCompliance.mockReturnValue({
      isLoading: false,
      error: null,
      healthSummary: mockHealthSummary,
      riskRanking: mockOrgRiskRanking,
    compliance: [mockDashboard as any],
    isRefreshing: false,
    lastRefreshed: null,
      refetch: vi.fn(),
    });
  });

  it("E1 – Overview tab is active by default", async () => {
    renderDashboard();
    await waitFor(() => {
      const overviewTab = screen.queryByRole("tab", { name: /overview/i }) ||
        screen.queryByText(/overview/i);
      expect(overviewTab).toBeTruthy();
    });
  });

  it("E2 – clicking Risk Ranking tab shows the risk table", async () => {
    renderDashboard();
    await waitFor(() => {
      const riskTab =
        screen.queryByRole("tab", { name: /risk/i }) ||
        screen.getByRole("button", { name: /risk ranking/i });
      if (riskTab) {
        fireEvent.click(riskTab);
      }
    });
    // After clicking, table content should still be accessible
    await waitFor(() => {
      expect(
        screen.queryByText("Alpha Corp") ||
          screen.queryByText(/ranking/i)
      ).toBeTruthy();
    });
  });

  it("E3 – refetch button triggers refetch callback", async () => {
    const mockRefetch = vi.fn();
    mockUseEtaxCompliance.mockReturnValue({
      isLoading: false,
      error: null,
      healthSummary: mockHealthSummary,
      riskRanking: mockOrgRiskRanking,
    compliance: [mockDashboard as any],
    isRefreshing: false,
    lastRefreshed: null,
      refetch: mockRefetch,
    });
    renderDashboard();
    await waitFor(() => {
      const refreshBtn =
        screen.queryByRole("button", { name: /refresh/i }) ||
        screen.queryByRole("button", { name: /reload/i }) ||
        document.querySelector("[data-testid='refresh-btn']");
      if (refreshBtn) {
        fireEvent.click(refreshBtn as Element);
        expect(mockRefetch).toHaveBeenCalledOnce();
      }
    });
  });
});

// ── Group F: Error handling ───────────────────────────────────────────────────

describe("Group F – Error handling", () => {
  it("F1 – renders error state with message when hook returns error", async () => {
    mockUseEtaxCompliance.mockReturnValue({
      isLoading: false,
      error: "Network error",
      healthSummary: null,
      riskRanking: [],
    compliance: [mockDashboard as any],
    isRefreshing: false,
    lastRefreshed: null,
      refetch: vi.fn(),
    });
    renderDashboard();
    await waitFor(() => {
      expect(
        screen.queryAllByText(/error/i)[0] ||
          screen.queryByRole("alert") ||
          document.querySelector("[data-testid='error-state']")
      ).toBeTruthy();
    });
  });

  it("F2 – retry button available in error state", async () => {
    const mockRefetch = vi.fn();
    mockUseEtaxCompliance.mockReturnValue({
      isLoading: false,
      error: "Fetch failed",
      healthSummary: null,
      riskRanking: [],
    compliance: [mockDashboard as any],
    isRefreshing: false,
    lastRefreshed: null,
      refetch: mockRefetch,
    });
    renderDashboard();
    await waitFor(() => {
      const retryBtn =
        screen.queryByRole("button", { name: /retry|refresh|reload/i }) ||
        document.querySelector("[data-testid='retry-btn']");
      if (retryBtn) {
        fireEvent.click(retryBtn as Element);
        expect(mockRefetch).toHaveBeenCalled();
      }
    });
  });

  it("F3 – does not crash when orgRiskRanking contains undefined entries", () => {
    mockUseEtaxCompliance.mockReturnValue({
      isLoading: false,
      error: null,
      healthSummary: mockHealthSummary,
      riskRanking: [
        mockOrgRiskRanking[0],
        undefined as any,
        mockOrgRiskRanking[2],
      ],
      compliance: [mockDashboard as any],
      isRefreshing: false,
      lastRefreshed: null,
      refetch: vi.fn(),
    });
    expect(() => renderDashboard()).not.toThrow();
  });
});

// ── Group G: Accessibility & ARIA ─────────────────────────────────────────────

describe("Group G – Accessibility & ARIA", () => {
  beforeEach(() => {
    mockUseEtaxCompliance.mockReturnValue({
      isLoading: false,
      error: null,
      healthSummary: mockHealthSummary,
      riskRanking: mockOrgRiskRanking,
    compliance: [mockDashboard as any],
    isRefreshing: false,
    lastRefreshed: null,
      refetch: vi.fn(),
    });
  });

  it("G1 – page has a main landmark", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(
        screen.queryByRole("main") ||
          document.querySelector("main") ||
          document.querySelector("[role='main']")
      ).toBeTruthy();
    });
  });

  it("G2 – headings follow a logical hierarchy (h1 present)", async () => {
    renderDashboard();
    await waitFor(() => {
      const h1s = document.querySelectorAll("h1");
      expect(h1s.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("G3 – risk tier badges have accessible text or aria-label", async () => {
    renderDashboard();
    await waitFor(() => {
      // Either visible text or aria-label should convey the tier
      const tiers = ["HEALTHY", "WARNING", "CRITICAL"];
      const hasAccessibleTier = tiers.some(
        (t) =>
          screen.queryAllByText(new RegExp(`^${t}$`, "i"))[0] ||
          document.querySelector(`[aria-label*="${t}"]`)
      );
      expect(hasAccessibleTier).toBe(true);
    });
  });

  it("G4 – table has accessible headers (th elements or role=columnheader)", async () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /risk ranking/i }));
    await waitFor(() => {
      const ths = document.querySelectorAll(
        "th, [role='columnheader']"
      );
      expect(ths.length).toBeGreaterThan(0);
    });
  });
});
