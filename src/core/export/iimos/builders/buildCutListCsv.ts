/**
 * buildCutListCsv.ts - Cut List CSV Builder
 *
 * ARCHITECTURE:
 * - Build CSV file from cut list rows
 * - Configurable delimiter/encoding from profile
 * - SPEC-08 v8.2 compliant columns
 *
 * DETERMINISM:
 * - Same input → same CSV output
 * - Rows ordered by cabinetId, then partId
 * - No random elements
 */

import type { FactoryPackageProfile } from '../../factoryPackageProfiles';
import type { CutListRow } from '../iimoExportContext';

// ============================================
// CSV BUILDER TYPES
// ============================================

export interface BuildCutListCsvInput {
  /** Cut list rows from context */
  cutListRows: CutListRow[];

  /** Factory profile (for delimiter, encoding, BOM) */
  profile: FactoryPackageProfile;

  /** Job ID (for metadata column) */
  jobId?: string;
}

export interface CutListCsvOutput {
  /** Output path (relative to export root) */
  path: string;

  /** CSV content as string */
  content: string;

  /** Content as bytes (with encoding) */
  bytes: Uint8Array;
}

// ============================================
// CSV COLUMN DEFINITIONS
// ============================================

/**
 * CSV column definition
 *
 * These columns follow SPEC-08 v8.2 Composite Material Logic
 */
interface CsvColumn {
  /** Column header */
  header: string;

  /** Extract value from row */
  getValue: (row: CutListRow, index1: number) => string | number;
}

/**
 * Standard cut list columns (SPEC-08 compliant)
 */
const CSV_COLUMNS: CsvColumn[] = [
  { header: 'ROW_NO', getValue: (_, idx) => idx },
  { header: 'PART_ID', getValue: (r) => r.partId },
  { header: 'CABINET_ID', getValue: (r) => r.cabinetId },
  { header: 'MATERIAL_ID', getValue: (r) => r.materialId },
  { header: 'QTY', getValue: (r) => r.qty },

  // Finish dimensions
  { header: 'FINISH_W', getValue: (r) => r.finishW },
  { header: 'FINISH_H', getValue: (r) => r.finishH },

  // Edge banding
  { header: 'EDGE_L', getValue: (r) => r.edgeL },
  { header: 'EDGE_R', getValue: (r) => r.edgeR },
  { header: 'EDGE_T', getValue: (r) => r.edgeT },
  { header: 'EDGE_B', getValue: (r) => r.edgeB },

  // Premill (SPEC-08 v8.2)
  { header: 'PREMILL_L', getValue: (r) => r.premillL },
  { header: 'PREMILL_R', getValue: (r) => r.premillR },
  { header: 'PREMILL_T', getValue: (r) => r.premillT },
  { header: 'PREMILL_B', getValue: (r) => r.premillB },

  // Cut dimensions (calculated)
  { header: 'CUT_W', getValue: (r) => r.cutW },
  { header: 'CUT_H', getValue: (r) => r.cutH },

  // Metadata
  { header: 'GRAIN', getValue: (r) => r.grain ?? 'NONE' },
  { header: 'NOTE', getValue: (r) => r.note ?? '' },
];

// ============================================
// CSV HELPERS
// ============================================

/**
 * Escape CSV value
 *
 * Rules:
 * - If contains delimiter, quote, or newline: wrap in quotes
 * - If contains quote: escape with double quote
 */
function escapeCsvValue(value: string | number, delimiter: string): string {
  const str = String(value);

  // Check if escaping needed
  const needsEscape =
    str.includes(delimiter) ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r');

  if (!needsEscape) {
    return str;
  }

  // Escape quotes and wrap
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Build CSV row
 */
function buildCsvRow(
  values: (string | number)[],
  delimiter: string
): string {
  return values
    .map((v) => escapeCsvValue(v, delimiter))
    .join(delimiter);
}

/**
 * Sort cut list rows deterministically
 *
 * Sort by: cabinetId (asc), then partId (asc)
 */
function sortCutListRows(rows: CutListRow[]): CutListRow[] {
  return [...rows].sort((a, b) => {
    // First by cabinet ID
    const cabinetCompare = a.cabinetId.localeCompare(b.cabinetId);
    if (cabinetCompare !== 0) return cabinetCompare;

    // Then by part ID
    return a.partId.localeCompare(b.partId);
  });
}

/**
 * Encode string to bytes with BOM if needed
 */
function encodeWithBom(
  content: string,
  encoding: 'utf-8' | 'utf-16' | 'ascii',
  includeBom: boolean
): Uint8Array {
  // For simplicity, we only support UTF-8 in browser
  // UTF-16 would require different encoding logic
  const encoder = new TextEncoder();

  if (includeBom && encoding === 'utf-8') {
    // UTF-8 BOM: 0xEF 0xBB 0xBF
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const contentBytes = encoder.encode(content);
    const result = new Uint8Array(bom.length + contentBytes.length);
    result.set(bom);
    result.set(contentBytes, bom.length);
    return result;
  }

  return encoder.encode(content);
}

// ============================================
// MAIN BUILDER
// ============================================

/**
 * Build cut list CSV
 *
 * DETERMINISM:
 * - Rows sorted by cabinetId, partId
 * - Columns in fixed order
 * - Same input → same output
 */
export function buildCutListCsv(input: BuildCutListCsvInput): CutListCsvOutput {
  const { cutListRows, profile } = input;

  const { csvDelimiter, csvEncoding, csvBom, cutListFolder, cutListFileName } = profile;

  // Sort rows deterministically
  const sortedRows = sortCutListRows(cutListRows);

  // Build header row
  const headerRow = buildCsvRow(
    CSV_COLUMNS.map((col) => col.header),
    csvDelimiter
  );

  // Build data rows
  const dataRows = sortedRows.map((row, idx) => {
    const values = CSV_COLUMNS.map((col) => col.getValue(row, idx + 1));
    return buildCsvRow(values, csvDelimiter);
  });

  // Combine into CSV content
  const content = [headerRow, ...dataRows].join('\n');

  // Encode with optional BOM
  const bytes = encodeWithBom(content, csvEncoding, csvBom);

  // Build output path
  const path = `${cutListFolder}/${cutListFileName}`;

  return {
    path,
    content,
    bytes,
  };
}

// ============================================
// SUMMARY BUILDER
// ============================================

/**
 * Build cut list summary (counts by material)
 */
export interface CutListSummary {
  totalRows: number;
  totalParts: number;
  byMaterial: Map<string, { rows: number; parts: number }>;
}

export function buildCutListSummary(cutListRows: CutListRow[]): CutListSummary {
  const byMaterial = new Map<string, { rows: number; parts: number }>();

  let totalParts = 0;

  for (const row of cutListRows) {
    totalParts += row.qty;

    const existing = byMaterial.get(row.materialId);
    if (existing) {
      existing.rows++;
      existing.parts += row.qty;
    } else {
      byMaterial.set(row.materialId, { rows: 1, parts: row.qty });
    }
  }

  return {
    totalRows: cutListRows.length,
    totalParts,
    byMaterial,
  };
}
