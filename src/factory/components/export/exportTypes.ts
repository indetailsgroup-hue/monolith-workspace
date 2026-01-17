/**
 * Export Types (Frontend)
 * P2.2 Export UX (Gated)
 *
 * @version 0.12.0
 */

// ============================================================================
// Dialect & Profile Types
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
  target: ExportTarget;
  dialect: ExportDialect;
  profileId: ExportProfileId;
  mode: ExportMode;
  include?: {
    manifest?: boolean;
    packet?: boolean;
    dxf?: boolean;
  };
}

// ============================================================================
// Export Response
// ============================================================================

export interface ExportResponseSuccess {
  ok: true;
  exportId: string;
  sha256: string;
  sizeBytes: number;
  filename: string;
  downloadPath: string;
  exportedAt: string;
  dialect: ExportDialect;
  profileId: ExportProfileId;
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
  details?: {
    verifyVerdict?: string;
    verifyCode?: string;
  };
}

export type ExportResponse = ExportResponseSuccess | ExportResponseError;

export type ExportErrorCode =
  | "E_EXPORT_LOCKED"
  | "E_EXPORT_JOB_NOT_FOUND"
  | "E_EXPORT_PACKET_MISSING"
  | "E_EXPORT_DIALECT_INVALID"
  | "E_EXPORT_PROFILE_INVALID"
  | "E_EXPORT_GENERATION_FAILED"
  | "E_EXPORT_INTERNAL";

// ============================================================================
// Export Options Response
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
// Store Types
// ============================================================================

export type ExportStatus = "IDLE" | "LOADING_OPTIONS" | "EXPORTING" | "DONE" | "ERROR";

export interface ExportCacheEntry {
  status: ExportStatus;
  options?: ExportOptionsResponse;
  lastExport?: ExportResponseSuccess;
  error?: ExportResponseError;
  fetchedAt?: string;
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

export function isExportLocked(response: ExportResponse): boolean {
  return !response.ok && response.code === "E_EXPORT_LOCKED";
}
