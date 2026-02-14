/**
 * GateInput Builder v0.1 — From Part Breakdown (SPEC-08 Composite Material Logic)
 *
 * Converts Part Breakdown rows (from Cut List modal) to GateInput
 * for deterministic, factory-safe validation.
 *
 * Usage:
 * 1. At Freeze time: capture breakdown rows → snapshot.payload.breakdownRows
 * 2. At Gate time: buildGateInputFromBreakdown(snapshot.payload) → runGateV01()
 */

import type {
  GateInput,
  PartSpec,
  MaterialSpec,
  EdgeSide,
  EdgeSpec,
  DrillOp,
  FittingIntent,
} from '../types';

// ============================================
// BREAKDOWN ROW CONTRACTS (SPEC-08 modal columns)
// ============================================

/**
 * Per-side edge banding configuration
 * Aligns with Part Breakdown modal columns
 */
export type BreakdownEdgeColumns = {
  // Whether the side is edge-banded
  edgeL: boolean;
  edgeR: boolean;
  edgeT: boolean;
  edgeB: boolean;

  // Edge thickness per side (mm)
  tL: number;
  tR: number;
  tT: number;
  tB: number;

  // Premill per side (mm)
  pL: number;
  pR: number;
  pT: number;
  pB: number;
};

/**
 * Composite material thickness inputs
 * T_real = Tcore + TsA + TsB
 */
export type BreakdownMaterialColumns = {
  coreThicknessMm: number;       // Tcore
  surfaceAThicknessMm: number;   // TsA (laminate/veneer face A)
  surfaceBThicknessMm: number;   // TsB (laminate/veneer face B)
};

/**
 * Part Breakdown Row
 * One row = one panel in the cut list
 */
export type PartBreakdownRow = {
  partId: string;         // stable id (e.g., "PANEL_SIDE_L")
  name: string;           // display name

  // Finish size (mm) - final dimensions after edge banding
  finishW: number;
  finishH: number;

  // Composite material
  material: BreakdownMaterialColumns;

  // Per-side edge & premill controls
  edge: BreakdownEdgeColumns;

  // Optional tags for rule targeting
  tags?: string[]; // e.g., ["SHELF"], ["BACK_PANEL"], ["SIDE_PANEL"]
};

// ============================================
// EDGE MAPPING UTILITIES
// ============================================

/**
 * Ensure value is a valid positive number
 */
function safeMm(v: number): number {
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/**
 * Map breakdown edge config to EdgeSpec
 */
function mapEdge(enabled: boolean, thicknessMm: number, premillMm: number): EdgeSpec {
  return {
    enabled,
    thicknessMm: enabled ? safeMm(thicknessMm) : 0,
    premillMm: enabled ? safeMm(premillMm) : 0,
  };
}

/**
 * Map all 4 edges from breakdown row
 */
function mapEdges(row: PartBreakdownRow): Record<EdgeSide, EdgeSpec> {
  return {
    L: mapEdge(row.edge.edgeL, row.edge.tL, row.edge.pL),
    R: mapEdge(row.edge.edgeR, row.edge.tR, row.edge.pR),
    T: mapEdge(row.edge.edgeT, row.edge.tT, row.edge.pT),
    B: mapEdge(row.edge.edgeB, row.edge.tB, row.edge.pB),
  };
}

/**
 * Map breakdown material to MaterialSpec
 */
function mapMaterial(m: BreakdownMaterialColumns): MaterialSpec {
  return {
    coreThicknessMm: safeMm(m.coreThicknessMm),
    surfaceAThicknessMm: safeMm(m.surfaceAThicknessMm),
    surfaceBThicknessMm: safeMm(m.surfaceBThicknessMm),
  };
}

// ============================================
// BUILDERS
// ============================================

/**
 * Convert breakdown rows to PartSpec[]
 * Sorts by partId for deterministic, reproducible results
 */
export function buildPartsFromBreakdown(rows: PartBreakdownRow[]): PartSpec[] {
  // Stable deterministic ordering (important for audit/repro)
  const sorted = [...rows].sort((a, b) => a.partId.localeCompare(b.partId));

  return sorted.map((r) => ({
    partId: r.partId,
    name: r.name,
    finishW: safeMm(r.finishW),
    finishH: safeMm(r.finishH),
    material: mapMaterial(r.material),
    edges: mapEdges(r),
    tags: r.tags ? [...r.tags] : undefined,
  }));
}

/**
 * Options for building GateInput from breakdown
 */
export type BuildGateInputOptions = {
  snapshotId: string;

  // Required: breakdown rows from Cut List modal
  rows: PartBreakdownRow[];

  // Optional: drill operations (may not have yet in v0.1)
  drillOps?: DrillOp[];

  // Optional: fitting intents (may not have yet in v0.1)
  fittings?: FittingIntent[];

  // Optional: cabinet-level context
  cabinet?: { backPanelThicknessMm?: number };
};

/**
 * Build complete GateInput from breakdown rows
 *
 * @example
 * ```ts
 * const gateInput = buildGateInputFromBreakdown({
 *   snapshotId: snapshot.snapshotId,
 *   rows: snapshot.payload.breakdownRows,
 *   drillOps: snapshot.payload.drillOps,
 *   fittings: snapshot.payload.fittings,
 *   cabinet: snapshot.payload.cabinet,
 * });
 *
 * const result = runGateV01(gateInput);
 * ```
 */
export function buildGateInputFromBreakdown(opts: BuildGateInputOptions): GateInput {
  const parts = buildPartsFromBreakdown(opts.rows);

  return {
    snapshotId: opts.snapshotId,
    parts,
    drillOps: opts.drillOps ?? [],
    fittings: opts.fittings ?? [],
    cabinet: opts.cabinet,
  };
}

// ============================================
// DEFAULT EDGE CONFIG FACTORY
// ============================================

/**
 * Create default edge config (common case: 3 sides edged, back raw)
 */
export function createDefaultEdgeConfig(
  thickness = 0.8,
  premill = 0.5
): BreakdownEdgeColumns {
  return {
    edgeL: true,
    edgeR: true,
    edgeT: true,
    edgeB: false, // back edge typically raw
    tL: thickness,
    tR: thickness,
    tT: thickness,
    tB: 0,
    pL: premill,
    pR: premill,
    pT: premill,
    pB: 0,
  };
}

/**
 * Create edge config with all sides raw (no edge banding)
 */
export function createNoEdgeConfig(): BreakdownEdgeColumns {
  return {
    edgeL: false,
    edgeR: false,
    edgeT: false,
    edgeB: false,
    tL: 0,
    tR: 0,
    tT: 0,
    tB: 0,
    pL: 0,
    pR: 0,
    pT: 0,
    pB: 0,
  };
}
