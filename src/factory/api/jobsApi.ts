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
/** ADR-061: factory-api คืน envelope {ok, jobs:[{jobId, specState, ...}]} —
 *  แปลงเป็น JobSummary ด้วยข้อมูลเท่าที่ server รู้จริง (ไม่แต่งตัวเลข) */
interface FactoryApiJob {
  jobId: string;
  specState: 'DRAFT' | 'FROZEN' | 'RELEASED';
  revisionId?: string | null;
  createdAt: string;
  updatedAt: string;
  eventCount?: number;
}

const SPEC_TO_STATUS: Record<FactoryApiJob['specState'], JobSummary['status']> = {
  DRAFT: 'SIGNED',          // ยังแก้ได้ — รอ verify/freeze
  FROZEN: 'VERIFIED',       // spec ล็อกแล้ว พร้อม export
  RELEASED: 'IN_PRODUCTION',
};

function toJobSummary(j: FactoryApiJob): JobSummary {
  return {
    jobId: j.jobId,
    projectName: j.jobId,
    customerName: '—',
    status: SPEC_TO_STATUS[j.specState] ?? 'SIGNED',
    trust: {
      gate: j.specState === 'DRAFT' ? 'PENDING' : 'PASS',
      signature: 'PENDING',
      audit: (j.eventCount ?? 0) > 0 ? 'OK' : 'PENDING',
    },
    panelCount: 0,
    sheetCount: 0,
    machineSupport: [],
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
  };
}

export async function fetchJobsApi(): Promise<JobSummary[]> {
  const { data } = await apiFetch<{ ok: boolean; jobs: FactoryApiJob[] }>("/api/factory/jobs");
  if (!data?.ok || !Array.isArray(data.jobs)) return [];
  return data.jobs.map(toJobSummary);
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
