/**
 * FactoryApp - Main Factory Ops Application
 * P1.1 Factory Ops UX
 *
 * Entry point for factory operators.
 * Routes between Dashboard and JobDetail.
 *
 * @version 0.11.0
 */

import React, { useState, useEffect, useCallback } from "react";
import { Dashboard } from "./pages/Dashboard";
import { JobDetail } from "./pages/JobDetail";
import { enableMockApi, shouldUseMockApi } from "./api/mockData";

type View = "dashboard" | "job-detail";

export interface FactoryAppProps {
  /**
   * Enable mock API for development. Defaults to false (real backend) —
   * demo data is an explicit opt-in, and even then only activates when
   * VITE_USE_FACTORY_MOCK is set (see enableMockApi). S18 L2 hygiene.
   */
  useMockApi?: boolean;
}

export function FactoryApp({
  useMockApi = false,
}: FactoryAppProps): React.ReactElement {
  const [view, setView] = useState<View>("dashboard");
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

  // Render current view
  const content =
    view === "job-detail" && selectedJobId ? (
      <JobDetail jobId={selectedJobId} onBack={handleBack} />
    ) : (
      <Dashboard onSelectJob={handleSelectJob} />
    );

  return (
    <>
      {mockActive && <DemoDataBanner />}
      {content}
    </>
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
