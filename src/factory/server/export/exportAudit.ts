/**
 * Export Audit - Audit logging for exports
 * P2.2 Export UX (Gated)
 *
 * @version 0.12.0
 */

import type { ExportAuditEntry, ExportDialect, ExportProfileId, ExportTarget, ExportMode } from "./exportTypes";

// ============================================================================
// In-Memory Audit Store (MVP)
// ============================================================================

/** In-memory audit log (replace with persistent storage in production) */
const auditLog: ExportAuditEntry[] = [];

/** Maximum entries to keep in memory */
const MAX_AUDIT_ENTRIES = 1000;

// ============================================================================
// Audit Functions
// ============================================================================

/**
 * Generate a unique export ID.
 */
export function generateExportId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `EXP-${timestamp}-${random}`.toUpperCase();
}

/**
 * Log an export event.
 */
export function logExport(entry: Omit<ExportAuditEntry, "exportedAt">): ExportAuditEntry {
  const fullEntry: ExportAuditEntry = {
    ...entry,
    exportedAt: new Date().toISOString(),
  };

  // Add to beginning of array (newest first)
  auditLog.unshift(fullEntry);

  // Trim if too many entries
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.length = MAX_AUDIT_ENTRIES;
  }

  // Log to console in dev
  if (process.env.NODE_ENV !== "production") {
    console.log("[Export Audit]", JSON.stringify(fullEntry, null, 2));
  }

  return fullEntry;
}

/**
 * Get audit entries for a job.
 */
export function getAuditEntriesForJob(jobId: string): ExportAuditEntry[] {
  return auditLog.filter((e) => e.jobId === jobId);
}

/**
 * Get recent audit entries.
 */
export function getRecentAuditEntries(limit = 50): ExportAuditEntry[] {
  return auditLog.slice(0, limit);
}

/**
 * Get audit entry by export ID.
 */
export function getAuditEntry(exportId: string): ExportAuditEntry | undefined {
  return auditLog.find((e) => e.exportId === exportId);
}

/**
 * Create audit entry builder for easier logging.
 */
export function createAuditBuilder(jobId: string, exportedBy: string = "factory-operator") {
  const startTime = Date.now();
  const exportId = generateExportId();

  return {
    exportId,

    /**
     * Complete the audit entry and log it.
     */
    complete(params: {
      dialect: ExportDialect;
      profileId: ExportProfileId;
      target: ExportTarget;
      mode: ExportMode;
      sha256: string;
      sizeBytes: number;
      clientIp?: string;
    }): ExportAuditEntry {
      return logExport({
        exportId,
        jobId,
        dialect: params.dialect,
        profileId: params.profileId,
        target: params.target,
        mode: params.mode,
        sha256: params.sha256,
        sizeBytes: params.sizeBytes,
        exportedBy,
        clientIp: params.clientIp,
        durationMs: Date.now() - startTime,
      });
    },
  };
}

// ============================================================================
// Audit Report (for admin)
// ============================================================================

export interface AuditSummary {
  totalExports: number;
  byDialect: Record<ExportDialect, number>;
  byTarget: Record<ExportTarget, number>;
  recentExports: ExportAuditEntry[];
}

/**
 * Get audit summary for reporting.
 */
export function getAuditSummary(): AuditSummary {
  const byDialect: Record<ExportDialect, number> = {
    KDT: 0,
    BIESSE: 0,
    HOMAG: 0,
  };

  const byTarget: Record<ExportTarget, number> = {
    GCODE: 0,
    DXF: 0,
    BUNDLE: 0,
    MANIFEST: 0,
  };

  for (const entry of auditLog) {
    byDialect[entry.dialect]++;
    byTarget[entry.target]++;
  }

  return {
    totalExports: auditLog.length,
    byDialect,
    byTarget,
    recentExports: auditLog.slice(0, 10),
  };
}

/**
 * Clear audit log (for testing only).
 */
export function clearAuditLog(): void {
  auditLog.length = 0;
}
