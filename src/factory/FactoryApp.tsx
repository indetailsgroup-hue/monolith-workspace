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
import { enableMockApi } from "./api/mockData";

type View = "dashboard" | "job-detail";

export interface FactoryAppProps {
  /** Enable mock API for development */
  useMockApi?: boolean;
}

export function FactoryApp({
  useMockApi = true,
}: FactoryAppProps): React.ReactElement {
  const [view, setView] = useState<View>("dashboard");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

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
  if (view === "job-detail" && selectedJobId) {
    return <JobDetail jobId={selectedJobId} onBack={handleBack} />;
  }

  return <Dashboard onSelectJob={handleSelectJob} />;
}

export default FactoryApp;
