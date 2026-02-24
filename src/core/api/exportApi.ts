/**
 * exportApi.ts - Export API Client
 *
 * Priority 2: Wire export to real backend (P2.2a)
 *
 * ENDPOINTS:
 * - GET /api/export/options - Get available export formats and options
 * - POST /api/export/zip - Create gated export ZIP
 * - GET /api/audit - Query audit log
 * - GET /api/audit/stats - Get audit statistics
 */

import { apiGet, apiPost, USE_MOCK } from './client';

// ============================================================================
// Types
// ============================================================================

export type ExportFormat =
  | 'CUTLIST_CSV'
  | 'DXF_R12'
  | 'GCODE'
  | 'BOM_JSON'
  | 'STEP'
  | 'PDF';

export type CsvDialect = 'EXCEL' | 'RFC4180' | 'HOMAG' | 'BIESSE' | 'SCM';
export type DxfVersion = 'R12' | 'R14' | '2000' | '2007';
export type GcodeProfile = 'GRBL' | 'MACH3' | 'LINUXCNC' | 'FANUC' | 'HOMAG';

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

export interface GcodeOptions {
  profile: GcodeProfile;
  safeZ: number;
  feedRate: number;
  spindleSpeed: number;
  toolDiameter: number;
  includeToolChange: boolean;
}

export interface ExportOptionsResponse {
  ok: boolean;
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

export interface ExportZipRequest {
  bundleId: string;
  format: ExportFormat;
  jobName: string;
  options?: Record<string, unknown>;
}

export interface ExportZipResponse {
  ok: boolean;
  zipBase64?: string;
  zipSha256Hex?: string;
  verify?: {
    ok: boolean;
    issues: unknown[];
  };
  policy?: {
    ok: boolean;
    decisions: Array<{ effect: string; reason: string }>;
  };
  error?: string;
  message?: string;
}

export type AuditStatus = 'PASS' | 'FAIL' | 'DENIED' | 'ERROR';

export interface AuditEntry {
  id: string;
  timestamp: string;
  status: AuditStatus;
  bundleId: string;
  jobId?: string;
  format: string;
  requester?: string;
  zipHashHex?: string;
  fileCount?: number;
  processingTimeMs?: number;
  error?: string;
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
// Mock Data
// ============================================================================

const MOCK_EXPORT_OPTIONS: ExportOptionsResponse = {
  ok: true,
  formats: ['CUTLIST_CSV', 'DXF_R12', 'GCODE', 'BOM_JSON', 'STEP', 'PDF'],
  dialects: {
    csv: ['EXCEL', 'RFC4180', 'HOMAG', 'BIESSE', 'SCM'],
    dxf: ['R12', 'R14', '2000', '2007'],
    gcode: ['GRBL', 'MACH3', 'LINUXCNC', 'FANUC', 'HOMAG'],
  },
  defaults: {
    csv: {
      dialect: 'EXCEL',
      includeEdgeBanding: true,
      includeGrain: true,
      groupByMaterial: true,
      unitSystem: 'METRIC',
    },
    dxf: {
      version: 'R12',
      includeLabels: true,
      layerPerMaterial: true,
      explodeBlocks: false,
    },
    gcode: {
      profile: 'GRBL',
      safeZ: 5,
      feedRate: 3000,
      spindleSpeed: 18000,
      toolDiameter: 6,
      includeToolChange: true,
    },
  },
};

const MOCK_AUDIT_STATS: AuditStats = {
  totalEntries: 42,
  byStatus: { PASS: 35, FAIL: 4, DENIED: 2, ERROR: 1 },
  byFormat: { CUTLIST_CSV: 20, DXF_R12: 15, GCODE: 7 },
  last24h: 5,
  last7d: 28,
};

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get available export formats and options.
 */
export async function getExportOptions(): Promise<ExportOptionsResponse> {
  if (USE_MOCK) {
    console.log('[MOCK] getExportOptions');
    return MOCK_EXPORT_OPTIONS;
  }

  return apiGet<ExportOptionsResponse>('/api/export/options');
}

/**
 * Create a gated export ZIP.
 */
export async function createExportZip(
  request: ExportZipRequest
): Promise<ExportZipResponse> {
  if (USE_MOCK) {
    console.log('[MOCK] createExportZip', request);
    return {
      ok: true,
      zipBase64: 'UEsDBBQAAAA...mock...', // Fake base64
      zipSha256Hex: 'abc123def456789...',
      verify: { ok: true, issues: [] },
      policy: { ok: true, decisions: [{ effect: 'ALLOW', reason: 'Mock mode' }] },
    };
  }

  return apiPost<ExportZipResponse>('/api/export/zip', request);
}

/**
 * Download export ZIP as blob.
 */
export async function downloadExportZip(
  request: ExportZipRequest
): Promise<Blob> {
  const response = await createExportZip(request);

  if (!response.ok || !response.zipBase64) {
    throw new Error(response.message || 'Export failed');
  }

  // Decode base64 to blob
  const binaryString = atob(response.zipBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: 'application/zip' });
}

/**
 * Query audit log.
 */
export async function queryAudit(query: AuditQuery = {}): Promise<AuditEntry[]> {
  if (USE_MOCK) {
    console.log('[MOCK] queryAudit', query);
    return [];
  }

  const params = new URLSearchParams();
  if (query.bundleId) params.set('bundleId', query.bundleId);
  if (query.jobId) params.set('jobId', query.jobId);
  if (query.status) params.set('status', query.status);
  if (query.format) params.set('format', query.format);
  if (query.fromIso) params.set('fromIso', query.fromIso);
  if (query.toIso) params.set('toIso', query.toIso);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.offset) params.set('offset', String(query.offset));

  const queryString = params.toString();
  const path = queryString ? `/api/audit?${queryString}` : '/api/audit';

  const response = await apiGet<{ ok: boolean; entries: AuditEntry[] }>(path);
  return response.entries;
}

/**
 * Get audit statistics.
 */
export async function getAuditStats(): Promise<AuditStats> {
  if (USE_MOCK) {
    console.log('[MOCK] getAuditStats');
    return MOCK_AUDIT_STATS;
  }

  const response = await apiGet<{ ok: boolean; stats: AuditStats }>('/api/audit/stats');
  return response.stats;
}

// ============================================================================
// Export Helpers
// ============================================================================

/**
 * Trigger browser download for a blob.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export and download in one step.
 */
export async function exportAndDownload(
  bundleId: string,
  format: ExportFormat,
  jobName: string,
  options?: Record<string, unknown>
): Promise<void> {
  const blob = await downloadExportZip({
    bundleId,
    format,
    jobName,
    options,
  });

  const extension = format === 'CUTLIST_CSV' ? 'zip' : 'zip';
  const filename = `${jobName}_${format.toLowerCase()}.${extension}`;

  triggerDownload(blob, filename);
}
