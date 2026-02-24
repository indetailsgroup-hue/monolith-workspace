// src/core/manufacturing/export/exportGate.v1.ts
/**
 * Export Gate Contracts.
 *
 * Request/response types for factory export with gate enforcement.
 * Nothing reaches the factory without passing ALL gates.
 *
 * v0.10.8.4 - Export Gate Enforcement
 */

// =============================================================================
// EXPORT TYPES
// =============================================================================

/**
 * Export kind.
 */
export type ExportKind =
  | "FACTORY_PACKET_ZIP"
  | "NC_ONLY"
  | "DXF_ONLY"
  | "REPORTS_ONLY";

/**
 * Export request (from UI/API).
 */
export interface ExportRequest {
  /** Request version */
  version: "1.0";

  /** Job identifier */
  jobId: string;

  /** Sheet ID (optional, for single sheet export) */
  sheetId?: string;

  /** Requester info */
  requestedBy: {
    userId: string;
    role?: string;
  };

  /** Export kind */
  kind: ExportKind;

  /** Include options */
  include?: {
    /** Include DXF files */
    dxf?: boolean;

    /** Include NC files */
    nc?: boolean;

    /** Include gate/sim/verify reports */
    reports?: boolean;

    /** Include IR programs */
    ir?: boolean;

    /** Include manifest */
    manifest?: boolean;
  };

  /** Request timestamp */
  requestedAt?: string;
}

/**
 * Export packet file entry.
 */
export interface ExportPacketFile {
  /** File path in packet */
  path: string;

  /** SHA-256 hash */
  hash: string;

  /** File size (bytes) */
  sizeBytes?: number;
}

/**
 * Export packet info.
 */
export interface ExportPacketInfo {
  /** Packet identifier */
  packetId: string;

  /** Manifest hash (chain.manifestHash.hex) */
  manifestHash: string;

  /** ZIP file fingerprint (sha256 of zip bytes) */
  fileFp: string;

  /** ZIP file size (bytes) */
  fileSizeBytes?: number;

  /** Files in packet */
  files: ExportPacketFile[];

  /** Creation timestamp */
  createdAt: string;
}

/**
 * Export result (from worker).
 */
export interface ExportResult {
  /** Result version */
  version: "1.0";

  /** Job identifier */
  jobId: string;

  /** Export status */
  status: "OK" | "BLOCKED";

  /** Block reason (code) */
  reason?: ExportBlockCode;

  /** Block detail (for debugging) */
  detail?: Record<string, unknown>;

  /** Packet info (if OK) */
  packet?: ExportPacketInfo;

  /** Processing time (ms) */
  processingTimeMs?: number;
}

// =============================================================================
// BLOCK CODES
// =============================================================================

/**
 * Export block code.
 *
 * Deterministic codes for export blocking reasons.
 */
export type ExportBlockCode =
  | "E_SPEC_NOT_RELEASED"
  | "E_GATE_NOT_PASS"
  | "E_SIM_FAIL"
  | "E_VERIFY_FAIL"
  | "E_CONSISTENCY_FAIL"
  | "E_MANIFEST_MISSING"
  | "E_MANIFEST_HASH_MISMATCH"
  | "E_SIGNATURE_REQUIRED"
  | "E_ARTIFACT_MISSING"
  | "E_ARTIFACT_HASH_MISMATCH"
  | "E_JOB_NOT_FOUND"
  | "E_PERMISSION_DENIED"
  | "E_INTERNAL_ERROR";

/**
 * Block code descriptions.
 */
export const EXPORT_BLOCK_DESCRIPTIONS: Record<ExportBlockCode, string> = {
  E_SPEC_NOT_RELEASED: "Spec must be RELEASED before export",
  E_GATE_NOT_PASS: "Gate report must PASS",
  E_SIM_FAIL: "Simulation report(s) must PASS",
  E_VERIFY_FAIL: "Verifier report(s) must PASS",
  E_CONSISTENCY_FAIL: "Consistency report(s) must PASS",
  E_MANIFEST_MISSING: "Toolpath manifest is required",
  E_MANIFEST_HASH_MISMATCH: "Manifest hash verification failed (tamper detected)",
  E_SIGNATURE_REQUIRED: "Manifest signature is required for production export",
  E_ARTIFACT_MISSING: "Required artifact not found",
  E_ARTIFACT_HASH_MISMATCH: "Artifact hash verification failed",
  E_JOB_NOT_FOUND: "Job not found",
  E_PERMISSION_DENIED: "User does not have export permission",
  E_INTERNAL_ERROR: "Internal error during export",
};

/**
 * Get human-readable block description.
 */
export function getBlockDescription(code: ExportBlockCode): string {
  return EXPORT_BLOCK_DESCRIPTIONS[code] ?? code;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create export request.
 */
export function createExportRequest(
  jobId: string,
  userId: string,
  kind: ExportKind = "FACTORY_PACKET_ZIP"
): ExportRequest {
  return {
    version: "1.0",
    jobId,
    requestedBy: { userId },
    kind,
    include: {
      dxf: true,
      nc: true,
      reports: true,
      ir: true,
      manifest: true,
    },
    requestedAt: new Date().toISOString(),
  };
}

/**
 * Create blocked result.
 */
export function createBlockedResult(
  jobId: string,
  reason: ExportBlockCode,
  detail?: Record<string, unknown>
): ExportResult {
  return {
    version: "1.0",
    jobId,
    status: "BLOCKED",
    reason,
    detail,
  };
}

/**
 * Create success result.
 */
export function createSuccessResult(
  jobId: string,
  packet: ExportPacketInfo,
  processingTimeMs?: number
): ExportResult {
  return {
    version: "1.0",
    jobId,
    status: "OK",
    packet,
    processingTimeMs,
  };
}

/**
 * Check if result is blocked.
 */
export function isBlocked(result: ExportResult): boolean {
  return result.status === "BLOCKED";
}

/**
 * Check if result is OK.
 */
export function isExportOk(result: ExportResult): boolean {
  return result.status === "OK" && !!result.packet;
}
