/**
 * FactoryApp - Main Factory Ops Application
 * P1.1 Factory Ops UX + Digital Shadow Integration
 *
 * Entry point for factory operators.
 * Routes between Dashboard, JobDetail, and MachineShadow.
 *
 * @version 0.12.0
 */

import React, { useState, useEffect, useCallback } from "react";
import { Dashboard } from "./pages/Dashboard";
import { JobDetail } from "./pages/JobDetail";
import { MachineShadow } from "./pages/MachineShadow";
import { enableMockApi, shouldUseMockApi } from "./api/mockData";

type View = "dashboard" | "job-detail" | "machine-shadow";

export interface FactoryAppProps {
  /**
   * Enable mock API for development. Defaults to false (real backend) —
   * demo data is an explicit opt-in, and even then only activates when
   * VITE_USE_FACTORY_MOCK is set (see enableMockApi). S18 L2 hygiene.
   */
  useMockApi?: boolean;
  /** Open directly to the digital shadow view */
  initialView?: View;
}

// ─── Tab navigation bar ───────────────────────────────────────────────────────

const TABS: Array<{ id: View; label: string; icon: string }> = [
  { id: "dashboard", label: "Jobs", icon: "📋" },
  { id: "machine-shadow", label: "Digital Shadow", icon: "🔬" },
];

function FactoryNav({
  view,
  onSelect,
}: {
  view: View;
  onSelect: (v: View) => void;
}): React.ReactElement {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 16px",
        background: "#0d0d1a",
        borderBottom: "1px solid #1e1e2e",
        height: 40,
        flexShrink: 0,
      }}
    >
      {TABS.map((tab) => {
        const active = view === tab.id || (view === "job-detail" && tab.id === "dashboard");
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: "0 14px",
              height: 40,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: active ? 700 : 500,
              color: active ? "#fff" : "#6b7280",
              borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
              transition: "color 0.15s, border-color 0.15s",
              marginBottom: -1,
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export function FactoryApp({
  useMockApi = false,
  initialView = "dashboard",
}: FactoryAppProps): React.ReactElement {
  const [view, setView] = useState<View>(initialView);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Mock mode is active only when BOTH the prop and the env flag opt in —
  // mirrors the gate inside enableMockApi.
  const mockActive = useMockApi && shouldUseMockApi();

  // Enable mock API on mount
  useEffect(() => {
    if (useMockApi) {
      enableMockApi();
    }
  }, [useMockApi]);

  // Navigate to job detail
  const handleSelectJob = useCallback((jobId: string) => {
    setSelectedJobId(jobId);
    setView("job-detail");
  }, []);

  // Navigate back to dashboard
  const handleBack = useCallback(() => {
    setSelectedJobId(null);
    setView("dashboard");
  }, []);

  // Handle tab selection — reset job detail state when leaving jobs tab
  const handleTabSelect = useCallback((nextView: View) => {
    if (nextView !== "job-detail" && nextView !== "dashboard") {
      setSelectedJobId(null);
    }
    setView(nextView);
  }, []);

  // Render current view
  const content =
    view === "job-detail" && selectedJobId ? (
      <JobDetail jobId={selectedJobId} onBack={handleBack} />
    ) : view === "machine-shadow" ? (
      <MachineShadow />
    ) : (
      <Dashboard onSelectJob={handleSelectJob} />
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {mockActive && <DemoDataBanner />}
      <FactoryNav view={view} onSelect={handleTabSelect} />
      <div style={{ flex: 1, overflow: "hidden" }}>{content}</div>
    </div>
  );
}

/**
 * Persistent strip shown whenever the mock API is active so demo numbers can
 * never be mistaken for factory truth (S18 L2).
 */
function DemoDataBanner(): React.ReactElement {
  return (
    <div
      style={{
        padding: "6px 12px",
        backgroundColor: "#f59e0b",
        color: "#1a1a2e",
        fontSize: 13,
        fontWeight: 700,
        textAlign: "center",
        letterSpacing: 0.5,
      }}
    >
      ⚠ DEMO DATA — mock API active, ไม่ใช่ข้อมูลจริงจากโรงงาน
    </div>
  );
}

export default FactoryApp;
