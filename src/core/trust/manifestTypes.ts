/**
 * manifestTypes.ts - Job Manifest Types for Export Traceability
 *
 * ARCHITECTURE:
 * - JobManifest: comprehensive record of validation and exports
 * - Contains TrustReport with hash for integrity
 * - Tracks all exported artifacts (DXF, CSV, G-code)
 *
 * FACTORY REQUIREMENT:
 * - Export requires valid TrustReport
 * - Hash must match to prevent tampering
 */

import type { TrustReport } from './trustReportTypes';

// ============================================
// EXPORT ARTIFACT
// ============================================

/**
 * Export format types
 */
export type ExportKind = 'DXF' | 'CSV' | 'GCODE' | 'PDF' | 'JSON';

/**
 * Single exported artifact
 */
export interface ExportArtifact {
  /** Export format */
  kind: ExportKind;
  /** File path or identifier */
  path: string;
  /** Optional hash of exported content */
  hash?: string;
  /** Export timestamp */
  timestampIso: string;
  /** File size in bytes */
  sizeBytes?: number;
}

// ============================================
// JOB MANIFEST
// ============================================

/**
 * Manifest version
 */
export type ManifestVersion = '1.0';

/**
 * Job manifest for factory traceability
 */
export interface JobManifest {
  /** Manifest version */
  version: ManifestVersion;
  /** Job/project identifier */
  jobId: string;
  /** Creation timestamp */
  createdIso: string;
  /** Last updated timestamp */
  updatedIso: string;

  // ---- Trust Report ----
  /** Trust report snapshot */
  trustReport: TrustReport;
  /** Hash of trust report (for integrity verification) */
  trustReportHash: string;

  // ---- Exports ----
  /** List of exported artifacts */
  exports: ExportArtifact[];

  // ---- Optional metadata ----
  /** User who created/approved */
  createdBy?: string;
  /** Notes or comments */
  notes?: string;
}

// ============================================
// CREATION HELPERS
// ============================================

/**
 * Create new job manifest
 */
export function createJobManifest(args: {
  jobId: string;
  trustReport: TrustReport;
  trustReportHash: string;
  createdBy?: string;
}): JobManifest {
  const now = new Date().toISOString();

  return {
    version: '1.0',
    jobId: args.jobId,
    createdIso: now,
    updatedIso: now,
    trustReport: args.trustReport,
    trustReportHash: args.trustReportHash,
    exports: [],
    createdBy: args.createdBy,
  };
}

/**
 * Add export to manifest
 */
export function addExportToManifest(
  manifest: JobManifest,
  artifact: Omit<ExportArtifact, 'timestampIso'>
): JobManifest {
  return {
    ...manifest,
    updatedIso: new Date().toISOString(),
    exports: [
      ...manifest.exports,
      {
        ...artifact,
        timestampIso: new Date().toISOString(),
      },
    ],
  };
}

// ============================================
// VALIDATION
// ============================================

/**
 * Check if manifest is valid for export
 */
export function isManifestValidForExport(manifest: JobManifest): boolean {
  // Trust report must be valid (gate ok, no collision)
  if (!manifest.trustReport) return false;
  if (!manifest.trustReport.gate.ok) return false;
  if (manifest.trustReport.collision.blocked) return false;

  return true;
}

/**
 * Get export status from manifest
 */
export function getManifestExportStatus(
  manifest: JobManifest
): 'ALLOWED' | 'BLOCKED' {
  return isManifestValidForExport(manifest) ? 'ALLOWED' : 'BLOCKED';
}
