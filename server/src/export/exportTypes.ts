/**
 * exportTypes.ts - P2.2a Export Type Definitions
 *
 * Full type definitions for:
 * - Export formats and options
 * - ZIP bundle structures
 * - Audit trail entries
 * - API request/response shapes
 */

// ============================================================================
// Export Formats
// ============================================================================

export type ExportFormat =
  | 'CUTLIST_CSV'
  | 'DXF_R12'
  | 'DXF_R12_PER_PART'
  | 'GCODE'
  | 'STEP'
  | 'PDF'
  | 'BOM_JSON';

export type CsvDialect = 'EXCEL' | 'RFC4180' | 'HOMAG' | 'BIESSE' | 'SCM';
export type DxfVersion = 'R12' | 'R14' | '2000' | '2007';
export type GcodeProfile = 'GRBL' | 'MACH3' | 'LINUXCNC' | 'FANUC' | 'HOMAG';

// ============================================================================
// Export Options
// ============================================================================

export interface CutlistCsvOptions {
  dialect: CsvDialect;
  includeEdgeBanding: boolean;
  includeGrain: boolean;
  groupByMaterial: boolean;
  unitSystem: 'METRIC' | 'IMPERIAL';
}

export interface DxfOptions {
  version: DxfVersion;
  includeLabels: boolean;
  layerPerMaterial: boolean;
  explodeBlocks: boolean;
}

export interface DxfPerPartOptions {
  /** Include annotation text in DXF */
  includeAnnotation: boolean;
  /** Annotation text height (mm) */
  annotationHeight: number;
  /** Decimal precision for coordinates */
  precision: number;
}

export interface GcodeOptions {
  profile: GcodeProfile;
  safeZ: number;
  feedRate: number;
  spindleSpeed: number;
  toolDiameter: number;
  includeToolChange: boolean;
}

export interface BomJsonOptions {
  includeHardware: boolean;
  includePricing: boolean;
  groupByCategory: boolean;
}

export type ExportOptions =
  | { format: 'CUTLIST_CSV'; options: Partial<CutlistCsvOptions> }
  | { format: 'DXF_R12'; options: Partial<DxfOptions> }
  | { format: 'DXF_R12_PER_PART'; options: Partial<DxfPerPartOptions> }
  | { format: 'GCODE'; options: Partial<GcodeOptions> }
  | { format: 'BOM_JSON'; options: Partial<BomJsonOptions> }
  | { format: 'STEP'; options: Record<string, unknown> }
  | { format: 'PDF'; options: Record<string, unknown> };

// ============================================================================
// ZIP Bundle Types
// ============================================================================

export interface ZipEntry {
  /** File name (with path, e.g., "exports/cutlist.csv") */
  name: string;
  /** File content (string or Buffer) */
  content: string | Buffer;
  /** Optional comment for the entry */
  comment?: string;
}

export interface ZipBundleResult {
  /** ZIP as Buffer */
  buffer: Buffer;
  /** SHA-256 hash of ZIP (hex, lowercase) */
  sha256Hex: string;
  /** Total size in bytes */
  sizeBytes: number;
  /** Number of entries */
  entryCount: number;
  /** ISO timestamp */
  createdAtIso: string;
}

export interface FactoryPackageOptions {
  /** Job ID */
  jobId: string;
  /** Project name */
  projectName?: string;
  /** Export format */
  format: ExportFormat;
  /** Manifest JSON string */
  manifest: string;
  /** Signature JSON string (optional) */
  signature?: string;
  /** Verification report JSON string (optional) */
  verifyReport?: string;
  /** P13 Export receipt JSON string (optional) */
  receipt?: string;
  /** Export files to include */
  files: Array<{ name: string; content: string | Buffer }>;
}

// ============================================================================
// Audit Types
// ============================================================================

export type AuditStatus = 'PASS' | 'FAIL' | 'DENIED' | 'ERROR';

export interface AuditEntry {
  /** Unique audit entry ID */
  id: string;
  /** ISO timestamp */
  timestamp: string;
  /** Export attempt status */
  status: AuditStatus;
  /** Job ID (if created) */
  jobId?: string;
  /** Bundle ID (manifest hash) */
  bundleId: string;
  /** Export format requested */
  format: string;
  /** Requester identifier (IP, user, etc.) */
  requester?: string;
  /** Verification summary */
  verify?: {
    ok: boolean;
    issueCount: number;
    errorCount: number;
  };
  /** Policy summary */
  policy?: {
    ok: boolean;
    deniedReason?: string;
  };
  /** Error message if failed */
  error?: string;
  /** ZIP hash if export succeeded */
  zipHashHex?: string;
  /** Export file count */
  fileCount?: number;
  /** Processing time in ms */
  processingTimeMs?: number;
  /** Additional metadata */
  meta?: Record<string, unknown>;
}

export interface AuditQuery {
  bundleId?: string;
  jobId?: string;
  status?: AuditStatus;
  format?: string;
  fromIso?: string;
  toIso?: string;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  totalEntries: number;
  byStatus: Record<AuditStatus, number>;
  byFormat: Record<string, number>;
  last24h: number;
  last7d: number;
}

// ============================================================================
// API Types
// ============================================================================

export interface ExportZipRequest {
  bundleId: string;
  format: ExportFormat;
  jobName: string;
  options?: Record<string, unknown>;
}

export interface ExportZipResponse {
  ok: boolean;
  /** Base64-encoded ZIP (only if ok=true) */
  zipBase64?: string;
  /** SHA-256 of ZIP (hex) */
  zipSha256Hex?: string;
  /** Verification report */
  verify?: {
    ok: boolean;
    issues: Array<{
      severity: 'ERROR' | 'WARNING' | 'INFO';
      code: string;
      message: string;
    }>;
  };
  /** Policy report */
  policy?: {
    ok: boolean;
    decisions: Array<{
      effect: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';
      reason: string;
    }>;
  };
  /** Error code if failed */
  error?: string;
  /** Error message */
  message?: string;
}

export interface ExportOptionsResponse {
  formats: ExportFormat[];
  dialects: {
    csv: CsvDialect[];
    dxf: DxfVersion[];
    gcode: GcodeProfile[];
  };
  defaults: {
    csv: CutlistCsvOptions;
    dxf: DxfOptions;
    gcode: GcodeOptions;
  };
}
