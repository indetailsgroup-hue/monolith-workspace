/**
 * Export Route - API endpoints for Factory Export
 * P2.2 Export UX (Gated)
 *
 * Endpoints:
 * - GET  /factory/jobs/:jobId/export/options
 * - POST /factory/jobs/:jobId/export
 * - GET  /factory/jobs/:jobId/export/:exportId/download
 *
 * @version 0.12.0
 */

import type {
  ExportRequest,
  ExportResponse,
  ExportOptionsResponse,
} from "./exportTypes";
import { getExportOptions } from "./exportOptions";
import { executeAndStoreExport, getExportData } from "./exportService";
import { getAuditEntriesForJob, getAuditEntry } from "./exportAudit";

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /factory/jobs/:jobId/export/options
 *
 * Returns available export options (dialects, profiles, modes).
 */
export function handleGetExportOptions(_jobId: string): ExportOptionsResponse {
  // For now, options are global (not job-specific)
  // In production, could filter based on job's machine compatibility
  return getExportOptions();
}

/**
 * POST /factory/jobs/:jobId/export
 *
 * Execute an export with verify-on-export.
 */
export async function handleExport(
  jobId: string,
  request: ExportRequest,
  options?: {
    exportedBy?: string;
    clientIp?: string;
  }
): Promise<ExportResponse> {
  // Validate job ID format
  if (!isValidJobId(jobId)) {
    return {
      ok: false,
      code: "E_EXPORT_JOB_NOT_FOUND",
      message: "Invalid job ID format",
    };
  }

  // Execute export with verify-on-export
  return executeAndStoreExport(jobId, request, options);
}

/**
 * GET /factory/jobs/:jobId/export/:exportId/download
 *
 * Download an export file.
 */
export function handleDownload(
  jobId: string,
  exportId: string
): { data: Buffer | string; filename: string; contentType: string } | { error: string; code: string } {
  // Validate export ID belongs to this job
  const auditEntry = getAuditEntry(exportId);
  if (!auditEntry || auditEntry.jobId !== jobId) {
    return {
      error: "Export not found or access denied",
      code: "E_EXPORT_NOT_FOUND",
    };
  }

  // Get export data
  const exportData = getExportData(exportId);
  if (!exportData) {
    return {
      error: "Export file not available (may have expired)",
      code: "E_EXPORT_EXPIRED",
    };
  }

  return {
    data: exportData.data,
    filename: exportData.filename,
    contentType: "application/zip",
  };
}

/**
 * GET /factory/jobs/:jobId/export/history
 *
 * Get export history for a job.
 */
export function handleGetExportHistory(jobId: string) {
  return {
    jobId,
    exports: getAuditEntriesForJob(jobId),
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Validate job ID format.
 */
function isValidJobId(jobId: string): boolean {
  // Job IDs should match pattern like "JOB-2026-0012"
  return /^JOB-\d{4}-\d{4}$/.test(jobId);
}

// ============================================================================
// Mock Handler (for Frontend Development)
// ============================================================================

/**
 * Mock export response for development.
 */
export function getMockExportResponse(
  jobId: string,
  request: Partial<ExportRequest>
): ExportResponse {
  const dialect = request.dialect || "KDT";
  const profileId = request.profileId || "kdt_mvp_v1";
  const mode = request.mode || "PER_JOB";
  const target = request.target || "BUNDLE";

  // Simulate blocked job
  if (jobId.includes("0015") || jobId.includes("BLOCKED")) {
    return {
      ok: false,
      code: "E_EXPORT_LOCKED",
      message: "Export blocked: verification did not pass",
      details: {
        verifyVerdict: "FAIL",
        verifyCode: "E_GATE_TOOL",
      },
    };
  }

  // Success response
  const exportId = `EXP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const sha256 = "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678";

  return {
    ok: true,
    exportId,
    sha256,
    sizeBytes: 12345,
    filename: `${jobId}_${dialect.toLowerCase()}_export.zip`,
    downloadPath: `/api/factory/jobs/${jobId}/export/${exportId}/download`,
    exportedAt: new Date().toISOString(),
    dialect,
    profileId: profileId as any,
    contents: {
      sheets: jobId.includes("0012") ? 6 : jobId.includes("0013") ? 4 : 2,
      files: 8,
      hasManifest: true,
      hasPacket: false,
    },
  };
}
