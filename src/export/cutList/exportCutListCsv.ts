/**
 * Cut List CSV Export — SpecState Enforced
 *
 * - DRAFT_PREVIEW: Watermarked preview (not factory-valid)
 * - RELEASED_FACTORY: Factory-valid artifact from immutable snapshot
 */

import type { PartBreakdownRow } from '@/gate/builders/fromBreakdown';

export type CutListCsvMode = 'DRAFT_PREVIEW' | 'RELEASED_FACTORY';

export type ExportCutListCsvInput = {
  mode: CutListCsvMode;

  /** Breakdown rows (immutable for factory, draft for preview) */
  rows: PartBreakdownRow[];

  /** Optional metadata for CSV header comments (audit trail) */
  meta?: {
    projectId?: string;
    revisionId?: string;
    snapshotId?: string;
    gateReportId?: string;
    releaseId?: string;
    policyVersion?: string;
    createdAtIso?: string;
  };
};

// ============================================
// HELPERS
// ============================================

function safeNum(v: unknown, fallback = 0) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function boolTo01(b: boolean) {
  return b ? '1' : '0';
}

function csvEscape(v: string) {
  if (
    v.includes('"') ||
    v.includes(',') ||
    v.includes('\n') ||
    v.includes('\r')
  ) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function edgeThickness(row: PartBreakdownRow, side: 'L' | 'R' | 'T' | 'B') {
  const e = row.edge;
  const on =
    side === 'L'
      ? e.edgeL
      : side === 'R'
        ? e.edgeR
        : side === 'T'
          ? e.edgeT
          : e.edgeB;
  const t =
    side === 'L' ? e.tL : side === 'R' ? e.tR : side === 'T' ? e.tT : e.tB;
  return on ? safeNum(t) : 0;
}

function premill(row: PartBreakdownRow, side: 'L' | 'R' | 'T' | 'B') {
  const e = row.edge;
  const on =
    side === 'L'
      ? e.edgeL
      : side === 'R'
        ? e.edgeR
        : side === 'T'
          ? e.edgeT
          : e.edgeB;
  const p =
    side === 'L' ? e.pL : side === 'R' ? e.pR : side === 'T' ? e.pT : e.pB;
  return on ? safeNum(p) : 0;
}

// ============================================
// SPEC-08 CUT SIZE FORMULAS
// ============================================

/** SPEC-08: CutW = FinishW - (EdgeL + EdgeR) + (PremillL + PremillR) */
export function computeCutW(row: PartBreakdownRow) {
  const w = safeNum(row.finishW);
  return (
    w -
    (edgeThickness(row, 'L') + edgeThickness(row, 'R')) +
    (premill(row, 'L') + premill(row, 'R'))
  );
}

/** SPEC-08: CutH = FinishH - (EdgeT + EdgeB) + (PremillT + PremillB) */
export function computeCutH(row: PartBreakdownRow) {
  const h = safeNum(row.finishH);
  return (
    h -
    (edgeThickness(row, 'T') + edgeThickness(row, 'B')) +
    (premill(row, 'T') + premill(row, 'B'))
  );
}

/** SPEC-08: T_real = Tcore + TsA + TsB */
export function computeTReal(row: PartBreakdownRow) {
  const m = row.material;
  return (
    safeNum(m.coreThicknessMm) +
    safeNum(m.surfaceAThicknessMm) +
    safeNum(m.surfaceBThicknessMm)
  );
}

// ============================================
// CSV EXPORT
// ============================================

/** Sort rows by partId for deterministic output */
function stableRowOrder(rows: PartBreakdownRow[]) {
  return [...rows].sort((a, b) => a.partId.localeCompare(b.partId));
}

/**
 * Generate Cut List CSV content
 *
 * @param input - Export configuration with mode, rows, and metadata
 * @returns CSV string with header comments and data rows
 */
export function exportCutListCsv(input: ExportCutListCsvInput): string {
  const rows = stableRowOrder(input.rows);

  // Header comments (CSV readers ignore lines starting with '#')
  const headerLines: string[] = [];

  if (input.mode === 'DRAFT_PREVIEW') {
    headerLines.push('# MODE=DRAFT_PREVIEW');
    headerLines.push(
      '# NOTE=Not factory-valid. Must pass Gate and be RELEASED for production.'
    );
  } else {
    headerLines.push('# MODE=RELEASED_FACTORY');
    headerLines.push(
      '# NOTE=Factory-valid artifact. Generated from immutable snapshot payload.'
    );
  }

  // Add metadata for audit trail
  const m = input.meta ?? {};
  if (m.projectId) headerLines.push(`# projectId=${m.projectId}`);
  if (m.revisionId) headerLines.push(`# revisionId=${m.revisionId}`);
  if (m.snapshotId) headerLines.push(`# snapshotId=${m.snapshotId}`);
  if (m.gateReportId) headerLines.push(`# gateReportId=${m.gateReportId}`);
  if (m.releaseId) headerLines.push(`# releaseId=${m.releaseId}`);
  if (m.policyVersion) headerLines.push(`# policyVersion=${m.policyVersion}`);
  if (m.createdAtIso) headerLines.push(`# createdAt=${m.createdAtIso}`);

  // Column headers aligned to SPEC-08
  const cols = [
    'PartId',
    'Name',
    'FinishW',
    'FinishH',

    'EdgeL',
    'EdgeR',
    'EdgeT',
    'EdgeB',

    'tL',
    'tR',
    'tT',
    'tB',

    'pL',
    'pR',
    'pT',
    'pB',

    'CutW',
    'CutH',

    'Tcore',
    'TsA',
    'TsB',
    'T_real',

    'Tags',
  ];

  const lines: string[] = [];
  lines.push(...headerLines);
  lines.push(cols.join(','));

  for (const r of rows) {
    const cutW = computeCutW(r);
    const cutH = computeCutH(r);
    const tReal = computeTReal(r);

    const tags = (r.tags ?? []).join('|');

    const row = [
      r.partId,
      r.name,

      safeNum(r.finishW).toFixed(2),
      safeNum(r.finishH).toFixed(2),

      boolTo01(r.edge.edgeL),
      boolTo01(r.edge.edgeR),
      boolTo01(r.edge.edgeT),
      boolTo01(r.edge.edgeB),

      safeNum(r.edge.edgeL ? r.edge.tL : 0).toFixed(2),
      safeNum(r.edge.edgeR ? r.edge.tR : 0).toFixed(2),
      safeNum(r.edge.edgeT ? r.edge.tT : 0).toFixed(2),
      safeNum(r.edge.edgeB ? r.edge.tB : 0).toFixed(2),

      safeNum(r.edge.edgeL ? r.edge.pL : 0).toFixed(2),
      safeNum(r.edge.edgeR ? r.edge.pR : 0).toFixed(2),
      safeNum(r.edge.edgeT ? r.edge.pT : 0).toFixed(2),
      safeNum(r.edge.edgeB ? r.edge.pB : 0).toFixed(2),

      cutW.toFixed(2),
      cutH.toFixed(2),

      safeNum(r.material.coreThicknessMm).toFixed(2),
      safeNum(r.material.surfaceAThicknessMm).toFixed(2),
      safeNum(r.material.surfaceBThicknessMm).toFixed(2),
      tReal.toFixed(2),

      tags,
    ].map((x) => csvEscape(String(x)));

    lines.push(row.join(','));
  }

  return lines.join('\n') + '\n';
}
