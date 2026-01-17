/**
 * Export Types - Request/Response types for Factory Export
 * P2.2 Export UX (Gated)
 *
 * @version 0.12.0
 */

// ============================================================================
// Machine Dialects & Profiles
// ============================================================================

export type ExportDialect = "KDT" | "BIESSE" | "HOMAG";

export type ExportProfileId =
  | "kdt_mvp_v1"
  | "kdt_pro_v1"
  | "biesse_iso_v1"
  | "homag_iso_v1"
  | "homag_weeke_v1";

export interface ExportProfile {
  id: ExportProfileId;
  name: string;
  dialect: ExportDialect;
  description?: string;
  /** Whether this profile is available for use */
  enabled: boolean;
}

// ============================================================================
// Export Target & Mode
// ============================================================================

export type ExportTarget = "GCODE" | "DXF" | "BUNDLE" | "MANIFEST";

export type ExportMode = "PER_SHEET" | "PER_JOB";

// ============================================================================
// Export Request
// ============================================================================

export interface ExportRequest {
  /** Target output type */
  target: ExportTarget;
  /** Machine dialect */
  dialect: ExportDialect;
  /** Profile ID */
  profileId: ExportProfileId;
  /** Export mode: per-sheet or per-job bundle */
  mode: ExportMode;
  /** Include options */
  include?: {
    /** Include signed manifest */
    manifest?: boolean;
    /** Include packet JSON */
    packet?: boolean;
    /** Include DXF drawings */
    dxf?: boolean;
  };
}

// ============================================================================
// Export Response
// ============================================================================

export interface ExportResponseSuccess {
  ok: true;
  /** Unique export ID for audit trail */
  exportId: string;
  /** SHA-256 of the export file */
  sha256: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Filename for download */
  filename: string;
  /** Download path (relative) */
  downloadPath: string;
  /** Export timestamp */
  exportedAt: string;
  /** Dialect used */
  dialect: ExportDialect;
  /** Profile used */
  profileId: ExportProfileId;
  /** Contents summary */
  contents: {
    sheets: number;
    files: number;
    hasManifest: boolean;
    hasPacket: boolean;
  };
}

export interface ExportResponseError {
  ok: false;
  code: ExportErrorCode;
  message: string;
  /** Details about the error */
  details?: {
    /** Verify verdict if export was locked */
    verifyVerdict?: string;
    /** Verify error code */
    verifyCode?: string;
  };
}

export type ExportResponse = ExportResponseSuccess | ExportResponseError;

// ============================================================================
// Error Codes
// ============================================================================

export type ExportErrorCode =
  | "E_EXPORT_LOCKED"      // Verify not PASS
  | "E_EXPORT_JOB_NOT_FOUND"
  | "E_EXPORT_PACKET_MISSING"
  | "E_EXPORT_DIALECT_INVALID"
  | "E_EXPORT_PROFILE_INVALID"
  | "E_EXPORT_GENERATION_FAILED"
  | "E_EXPORT_INTERNAL";

// ============================================================================
// Export Options Response (GET /export/options)
// ============================================================================

export interface ExportOptionsResponse {
  dialects: {
    id: ExportDialect;
    name: string;
    profiles: ExportProfile[];
  }[];
  modes: {
    id: ExportMode;
    name: string;
    description: string;
  }[];
  targets: {
    id: ExportTarget;
    name: string;
    description: string;
    enabled: boolean;
  }[];
}

// ============================================================================
// Export Audit Entry
// ============================================================================

export interface ExportAuditEntry {
  exportId: string;
  jobId: string;
  dialect: ExportDialect;
  profileId: ExportProfileId;
  target: ExportTarget;
  mode: ExportMode;
  sha256: string;
  sizeBytes: number;
  exportedAt: string;
  exportedBy: string;
  /** IP address if available */
  clientIp?: string;
  /** Duration in ms */
  durationMs?: number;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isExportSuccess(
  response: ExportResponse
): response is ExportResponseSuccess {
  return response.ok === true;
}

export function isExportError(
  response: ExportResponse
): response is ExportResponseError {
  return response.ok === false;
}

export function isValidDialect(dialect: string): dialect is ExportDialect {
  return ["KDT", "BIESSE", "HOMAG"].includes(dialect);
}

export function isValidProfileId(profileId: string): profileId is ExportProfileId {
  return [
    "kdt_mvp_v1",
    "kdt_pro_v1",
    "biesse_iso_v1",
    "homag_iso_v1",
    "homag_weeke_v1",
  ].includes(profileId);
}
