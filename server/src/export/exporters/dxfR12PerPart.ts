/**
 * dxfR12PerPart.ts - DXF R12 Per-Part Exporter (P14A Refactored)
 *
 * Generates individual DXF files per FlatPart using:
 * - Gate validation from manufacturing/flatpart
 * - POLYLINE+VERTEX+SEQEND DXF writer
 * - Activity logging on gate failure
 *
 * Export Profile: DXF_R12_PER_PART_V1
 *
 * @version P14A.5
 */

import { sha256Hex } from '../../storage/cas.js';
import type { ArtifactBundle, ArtifactFile } from '../../types.js';
import {
  type FlatPart,
  type GateResult,
  buildFlatPartsFromBundle,
  validateFlatParts,
  generateDxfR12Deterministic,
  GATE_VERSION,
} from '../../manufacturing/flatpart/index.js';

// ============================================================================
// Types
// ============================================================================

export interface DxfPerPartOptions {
  /** Include annotation text in DXF */
  includeAnnotation?: boolean;
  /** Annotation text height (mm) */
  annotationHeight?: number;
  /** Decimal precision for coordinates */
  precision?: number;
}

export interface DxfPerPartResult {
  ok: boolean;
  files: ArtifactFile[];
  gateResult: GateResult;
  partCount: number;
  exportedCount: number;
  error?: string;
}

// ============================================================================
// Filename Sanitizer
// ============================================================================

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}

// ============================================================================
// Main Exporter
// ============================================================================

/**
 * Export DXF R12 files per FlatPart with gate validation.
 *
 * Profile: DXF_R12_PER_PART_V1
 *
 * @param bundle - Artifact bundle containing flatparts.json
 * @param jobName - Job name for file naming
 * @param options - Export options
 * @returns Array of artifact files (DXF + gate report)
 * @throws Error if gate validation fails or no parts found
 */
export function exportDxfR12PerPart(
  bundle: ArtifactBundle,
  jobName: string,
  options: DxfPerPartOptions = {}
): ArtifactFile[] {
  const result = exportDxfR12PerPartWithResult(bundle, jobName, options);

  if (!result.ok) {
    throw new Error(result.error || 'DXF export failed');
  }

  return result.files;
}

/**
 * Export with detailed result (for better error handling)
 */
export function exportDxfR12PerPartWithResult(
  bundle: ArtifactBundle,
  jobName: string,
  options: DxfPerPartOptions = {}
): DxfPerPartResult {
  // Extract flatparts from bundle
  const flatpartsFile = bundle.files.find((f) => f.name === 'flatparts.json');
  if (!flatpartsFile) {
    return {
      ok: false,
      files: [],
      gateResult: {
        ok: false,
        issues: [{ code: 'MISSING_FLATPARTS', severity: 'ERROR', message: 'Bundle missing flatparts.json' }],
        canExport: false,
        gateVersion: GATE_VERSION,
        validatedAt: new Date().toISOString(),
      },
      partCount: 0,
      exportedCount: 0,
      error: 'Bundle missing flatparts.json - run FlatPart builder first',
    };
  }

  // Build FlatParts from bundle
  const buildResult = buildFlatPartsFromBundle(jobName, flatpartsFile.content);
  if (!buildResult.ok) {
    return {
      ok: false,
      files: [],
      gateResult: {
        ok: false,
        issues: [{ code: 'BUILD_FAILED', severity: 'ERROR', message: buildResult.error || 'Build failed' }],
        canExport: false,
        gateVersion: GATE_VERSION,
        validatedAt: new Date().toISOString(),
      },
      partCount: 0,
      exportedCount: 0,
      error: buildResult.error,
    };
  }

  const parts = buildResult.parts;
  if (parts.length === 0) {
    return {
      ok: false,
      files: [],
      gateResult: {
        ok: false,
        issues: [{ code: 'NO_PARTS', severity: 'ERROR', message: 'No FlatParts found in bundle' }],
        canExport: false,
        gateVersion: GATE_VERSION,
        validatedAt: new Date().toISOString(),
      },
      partCount: 0,
      exportedCount: 0,
      error: 'No FlatParts found in bundle',
    };
  }

  // Gate validation
  const gateResult = validateFlatParts(parts);

  if (!gateResult.canExport) {
    const errorIssues = gateResult.issues.filter((i) => i.severity === 'ERROR');
    const errorSummary = errorIssues
      .slice(0, 5)
      .map((i) => `${i.location || 'unknown'}: ${i.message}`)
      .join('; ');

    return {
      ok: false,
      files: [],
      gateResult,
      partCount: parts.length,
      exportedCount: 0,
      error: `Gate validation failed for ${errorIssues.length} issue(s): ${errorSummary}`,
    };
  }

  // Generate DXF for each part
  const files: ArtifactFile[] = [];
  const dxfConfig = {
    precision: options.precision ?? 3,
    includeAnnotation: options.includeAnnotation ?? true,
    annotationHeight: options.annotationHeight ?? 5,
  };

  for (const part of parts) {
    const dxfContent = generateDxfR12Deterministic(part, dxfConfig);
    const fileName = `${jobName}_${sanitizeFilename(part.partNumber || part.name)}.dxf`;
    const hashHex = sha256Hex(dxfContent);

    files.push({
      name: fileName,
      content: dxfContent,
      contentType: 'application/dxf',
      hashHex,
    });
  }

  // Add gate report
  const gateReport = {
    version: 'DXF_GATE_REPORT_V1',
    gateVersion: GATE_VERSION,
    partsValidated: parts.length,
    partsExported: files.length,
    issues: gateResult.issues,
    validatedAt: gateResult.validatedAt,
  };

  const gateReportJson = JSON.stringify(gateReport, null, 2);
  files.push({
    name: `${jobName}_gate_report.json`,
    content: gateReportJson,
    contentType: 'application/json',
    hashHex: sha256Hex(gateReportJson),
  });

  return {
    ok: true,
    files,
    gateResult,
    partCount: parts.length,
    exportedCount: files.length - 1, // Exclude gate report
  };
}

// ============================================================================
// Compatibility Export (matches old signature)
// ============================================================================

/**
 * Export function compatible with exporters registry.
 * Alias for exportDxfR12PerPart.
 */
export function exportDxfPerPartV2(
  bundle: ArtifactBundle,
  jobName: string,
  options?: Record<string, unknown>
): ArtifactFile[] {
  return exportDxfR12PerPart(bundle, jobName, {
    includeAnnotation: (options?.includeAnnotation as boolean) ?? true,
    annotationHeight: (options?.annotationHeight as number) ?? 5,
    precision: (options?.precision as number) ?? 3,
  });
}
