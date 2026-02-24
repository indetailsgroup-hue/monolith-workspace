/**
 * Factory Dashboard - Main job list view
 * P1.1 Factory Ops UX + PR-P1.1-C.2 Dashboard Filters
 *
 * Shows all jobs with status grouping, search, and filters.
 * Read-only by design - no editing capabilities.
 *
 * @version 0.12.0
 */

import React, { useEffect, useCallback, useMemo } from "react";
import { useFactoryStore } from "../state/factoryStore";
import type { JobStatus } from "../types/job";
import { IncidentBanner } from "../components/IncidentBanner";
import { DashboardToolbar } from "../components/dashboard/DashboardToolbar";
import { StatusFilterChips } from "../components/dashboard/StatusFilterChips";
import { JobGroups, FilterEmptyState } from "../components/dashboard/JobGroups";
import { useDashboardQueryState, type DashboardQueryState } from "../components/dashboard/useDashboardQueryState";
import {
  DashboardHeaderSkeleton,
  JobListSkeleton,
} from "../components/LoadingSkeleton";

export interface DashboardProps {
  onSelectJob: (jobId: string) => void;
}

export function Dashboard({ onSelectJob }: DashboardProps): React.ReactElement {
  const {
    jobs,
    jobsLoading,
    jobsError,
    dashboardQuery,
    dashboardStatusFilters,
    dashboardSort,
    setDashboardQuery,
    setDashboardStatusFilters,
    toggleDashboardStatusFilter,
    clearDashboardStatusFilters,
    setDashboardSort,
    refreshJobs,
    getDashboardGroupedJobs,
    getJobCounts,
  } = useFactoryStore();

  // URL sync for dashboard state
  const { updateUrl } = useDashboardQueryState({
    onInitialState: useCallback(
      (state: DashboardQueryState) => {
        if (state.query) setDashboardQuery(state.query);
        if (state.statusFilters.length > 0) setDashboardStatusFilters(state.statusFilters);
        if (state.sort) setDashboardSort(state.sort);
      },
      [setDashboardQuery, setDashboardStatusFilters, setDashboardSort]
    ),
  });

  // Update URL when state changes
  useEffect(() => {
    updateUrl({
      query: dashboardQuery,
      statusFilters: dashboardStatusFilters,
      sort: dashboardSort,
    });
  }, [dashboardQuery, dashboardStatusFilters, dashboardSort, updateUrl]);

  // Load jobs on mount
  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  // Get grouped jobs
  const groupedJobs = getDashboardGroupedJobs();
  const jobCounts = getJobCounts();

  // Convert status filters array to Set for StatusFilterChips
  const selectedFilters = useMemo(
    () => new Set(dashboardStatusFilters),
    [dashboardStatusFilters]
  );

  // Check if filter is active
  const hasActiveFilters = dashboardQuery.trim() !== "" || dashboardStatusFilters.length > 0;

  // Check if all groups are empty
  const allGroupsEmpty =
    groupedJobs.incoming.length === 0 &&
    groupedJobs.blocked.length === 0 &&
    groupedJobs.history.length === 0;

  // Check if no jobs at all (before filtering)
  const noJobsAtAll = jobs.length === 0;

  // Handle toggle status filter
  const handleToggleFilter = useCallback(
    (status: JobStatus) => {
      toggleDashboardStatusFilter(status);
    },
    [toggleDashboardStatusFilter]
  );

  // Handle clear all filters
  const handleClearFilters = useCallback(() => {
    setDashboardQuery("");
    clearDashboardStatusFilters();
  }, [setDashboardQuery, clearDashboardStatusFilters]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "#0a0a15",
        color: "#fff",
      }}
    >
      {/* Incident Banner (always on top) */}
      <IncidentBanner />

      {/* Header */}
      <header
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: 20,
          borderBottom: "1px solid #3a3a5a",
          backgroundColor: "#1a1a2e",
        }}
      >
        {/* Title Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            Factory Dashboard
          </h1>

          {/* Job count summary */}
          <div
            style={{
              display: "flex",
              gap: 16,
              fontSize: 13,
              color: "#888",
            }}
          >
            <span>
              <strong style={{ color: "#22c55e" }}>{jobCounts.SIGNED}</strong> incoming
            </span>
            <span>
              <strong style={{ color: "#ef4444" }}>{jobCounts.BLOCKED}</strong> blocked
            </span>
            <span>
              <strong style={{ color: "#6b7280" }}>{jobCounts.ALL}</strong> total
            </span>
          </div>
        </div>

        {/* Toolbar Row (Search + Sort + Refresh) */}
        <DashboardToolbar
          query={dashboardQuery}
          onQueryChange={setDashboardQuery}
          sort={dashboardSort}
          onSortChange={setDashboardSort}
          onRefresh={refreshJobs}
          loading={jobsLoading}
        />

        {/* Status Filter Chips */}
        <StatusFilterChips
          selected={selectedFilters}
          onToggle={handleToggleFilter}
          onClear={clearDashboardStatusFilters}
        />
      </header>

      {/* Content */}
      <main
        style={{
          flex: 1,
          overflow: "auto",
          padding: 20,
        }}
      >
        {/* Error State */}
        {jobsError && <ErrorMessage message={jobsError} onRetry={refreshJobs} />}

        {/* Loading State */}
        {jobsLoading && noJobsAtAll && <LoadingState />}

        {/* Filter Empty State (has jobs but filters yield nothing) */}
        {!jobsLoading && !noJobsAtAll && allGroupsEmpty && hasActiveFilters && (
          <FilterEmptyState onClearFilters={handleClearFilters} />
        )}

        {/* Job Groups (normal state) */}
        {!jobsLoading && (
          <JobGroups
            groups={groupedJobs}
            onOpenJob={onSelectJob}
            isEmpty={noJobsAtAll && !hasActiveFilters}
          />
        )}
      </main>
    </div>
  );
}

// ============================================================================
// Loading State
// ============================================================================

function LoadingState(): React.ReactElement {
  return (
    <div>
      <DashboardHeaderSkeleton />
      <div style={{ marginTop: 20 }}>
        <JobListSkeleton count={5} />
      </div>
    </div>
  );
}

// ============================================================================
// Error Message
// ============================================================================

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

function ErrorMessage({ message, onRetry }: ErrorMessageProps): React.ReactElement {
  return (
    <div
      style={{
        padding: 16,
        backgroundColor: "#ef444420",
        border: "1px solid #ef444440",
        borderRadius: 8,
        color: "#ef4444",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span>Error: {message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: "6px 12px",
            backgroundColor: "#ef4444",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

export default Dashboard;
