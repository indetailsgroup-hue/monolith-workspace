/**
 * Jobs API - Fetch job list and job details
 * P1.1 Factory Ops UX
 *
 * @version 0.12.7
 */

import { apiFetch } from "./client";
import type { JobSummary, JobDetailData, ExportResponse, MachineType } from "../types/job";

// ============================================================================
// Fetch Jobs List
// ============================================================================

/**
 * Fetch all jobs from the server
 * GET /factory/jobs
 */
export async function fetchJobsApi(): Promise<JobSummary[]> {
  const { data } = await apiFetch<JobSummary[]>("/factory/jobs");
  return data;
}

// ============================================================================
// Fetch Job Detail
// ============================================================================

/**
 * Fetch detailed information for a specific job
 * GET /factory/jobs/:jobId
 */
export async function fetchJobDetailApi(jobId: string): Promise<JobDetailData> {
  const { data } = await apiFetch<JobDetailData>(
    `/factory/jobs/${encodeURIComponent(jobId)}`
  );
  return data;
}

// ============================================================================
// Legacy Export (non-gated)
// ============================================================================

export interface LegacyExportRequest {
  machine: MachineType;
  format?: "per_job" | "per_sheet";
}

/**
 * Trigger legacy export for a job (non-gated)
 * POST /factory/jobs/:jobId/export
 *
 * Note: For gated exports with dialect/profile, use runGatedExportApi from exportApi.ts
 */
export async function triggerLegacyExportApi(
  jobId: string,
  request: LegacyExportRequest
): Promise<ExportResponse> {
  const { data } = await apiFetch<ExportResponse>(
    `/factory/jobs/${encodeURIComponent(jobId)}/export`,
    {
      method: "POST",
      body: JSON.stringify(request),
    }
  );
  return data;
}
