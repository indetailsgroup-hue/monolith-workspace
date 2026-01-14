/**
 * buildExportReportJson.ts - Export Report JSON Builder
 *
 * ARCHITECTURE:
 * - Build JSON report summarizing the export
 * - Contains job info, counts, gate status
 * - Machine-readable format for factory systems
 *
 * DETERMINISM:
 * - Same input → same JSON output
 * - Keys in consistent order (via JSON.stringify replacer)
 * - No timestamps in content (caller adds if needed)
 */

import type { FactoryPackageProfile } from '../../factoryPackageProfiles';
import type { FactoryPackagePlan } from '../../planFactoryPackage';
import type { IIMOSExportContext } from '../iimoExportContext';

// ============================================
// REPORT TYPES
// ============================================

/**
 * Export report structure
 *
 * This JSON file is included in the factory package
 * for machine parsing by factory systems.
 */
export interface ExportReportJson {
  /** Report format version */
  formatVersion: '1.0';

  /** Profile used for export */
  profile: {
    id: string;
    dxfFlavor: string;
    csvDelimiter: string;
    csvEncoding: string;
  };

  /** Job information */
  job: {
    id: string;
    name?: string;
    customer?: string;
  };

  /** Gate status */
  gate: {
    passed: boolean;
    issueCount: number;
  };

  /** Counts summary */
  counts: {
    cabinets: number;
    parts: number;
    sheets: number;
    materials: number;
  };

  /** Material list */
  materials: Array<{
    id: string;
    name: string;
    thickness: number;
  }>;

  /** Sheet manifest */
  sheets: Array<{
    index: number;
    filename: string;
    partCount: number;
    materialId: string;
    utilization: number;
  }>;

  /** Cut list file info */
  cutList: {
    filename: string;
    rowCount: number;
  };

  /** Context version (for debugging) */
  contextVersion: string;
}

// ============================================
// BUILD INPUT
// ============================================

export interface BuildExportReportInput {
  /** Export context */
  context: IIMOSExportContext;

  /** Export plan */
  plan: FactoryPackagePlan;

  /** Factory profile */
  profile: FactoryPackageProfile;

  /** Generated sheet filenames (in order) */
  sheetFilenames: string[];
}

export interface ExportReportOutput {
  /** Output path (relative to export root) */
  path: string;

  /** JSON content as string */
  content: string;

  /** Content as bytes (UTF-8) */
  bytes: Uint8Array;
}

// ============================================
// MAIN BUILDER
// ============================================

/**
 * Build export report JSON
 *
 * DETERMINISM:
 * - Keys sorted alphabetically via replacer
 * - Arrays in deterministic order
 * - No timestamps or random IDs
 */
export function buildExportReportJson(input: BuildExportReportInput): ExportReportOutput {
  const { context, plan, profile, sheetFilenames } = input;

  // Build materials array (sorted by ID for determinism)
  const materials = [...context.materials.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => ({
      id: m.id,
      name: m.name,
      thickness: m.thickness,
    }));

  // Build sheets array (in plan order)
  const sheets = context.nestingSheets.map((ns, idx) => ({
    index: ns.index1,
    filename: sheetFilenames[idx] ?? `sheet_${ns.index1}.dxf`,
    partCount: ns.placements.length,
    materialId: ns.materialId,
    utilization: Math.round(ns.utilization * 10) / 10, // Round to 1 decimal
  }));

  // Build report object
  const report: ExportReportJson = {
    formatVersion: '1.0',

    profile: {
      id: profile.id,
      dxfFlavor: profile.dxfFlavor,
      csvDelimiter: profile.csvDelimiter === '\t' ? 'TAB' : profile.csvDelimiter,
      csvEncoding: profile.csvEncoding,
    },

    job: {
      id: context.jobId,
      name: context.jobName,
      customer: context.customerName,
    },

    gate: {
      passed: context.gateOk,
      issueCount: context.gateIssueCount,
    },

    counts: {
      cabinets: context.cabinetCount,
      parts: context.partCount,
      sheets: plan.summary.sheetCount,
      materials: plan.summary.materialCount,
    },

    materials,
    sheets,

    cutList: {
      filename: profile.cutListFileName,
      rowCount: plan.cutList.rowCount,
    },

    contextVersion: context.contextVersion,
  };

  // Serialize with sorted keys for determinism
  const content = JSON.stringify(report, sortedReplacer, 2);
  const bytes = new TextEncoder().encode(content);

  // Build output path
  const path = `${profile.reportFolder}/${profile.reportFileName}`;

  return {
    path,
    content,
    bytes,
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * JSON replacer that sorts object keys
 *
 * This ensures deterministic JSON output regardless
 * of object property insertion order.
 */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value as object)
      .sort()
      .reduce((sorted, key) => {
        (sorted as Record<string, unknown>)[key] = (value as Record<string, unknown>)[key];
        return sorted;
      }, {} as Record<string, unknown>);
  }
  return value;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate export report structure
 */
export function validateExportReport(report: ExportReportJson): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check format version
  if (report.formatVersion !== '1.0') {
    errors.push(`Unknown format version: ${report.formatVersion}`);
  }

  // Check job ID
  if (!report.job.id) {
    errors.push('Missing job ID');
  }

  // Check counts consistency
  if (report.counts.sheets !== report.sheets.length) {
    errors.push(
      `Sheet count mismatch: counts.sheets=${report.counts.sheets}, sheets.length=${report.sheets.length}`
    );
  }

  if (report.counts.materials !== report.materials.length) {
    errors.push(
      `Material count mismatch: counts.materials=${report.counts.materials}, materials.length=${report.materials.length}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
