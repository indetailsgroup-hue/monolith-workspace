/**
 * Build Cut List JSON - B2 MVP
 *
 * Converts Cabinet panels to PacketCutList format.
 * Uses SPEC-08 v8.2 composite material logic.
 *
 * DETERMINISM:
 * - Rows sorted by cabinetId, then by partId
 * - Numbers rounded to 3 decimal places
 *
 * @version 1.1.0 - Task 12: compute developedLength + kerfCount for curved panels
 */

import type { Cabinet, CabinetPanel } from '../../../core/types/Cabinet';
import type { KerfMaterial, KerfToolProfile } from '../../../core/catalog/KerfBending';
import type { PacketCutList, PacketCutListRow } from '../types';
import { roundToPrecision, serializeDeterministicPretty } from '../manifestHash';
import {
  computeCurveFields,
  resolveMaterial,
  DEFAULT_KERF_TOOL,
} from './curveFieldsComputer';

// ============================================
// OPTIONS
// ============================================

/**
 * Options for buildCutListData() — all fields are optional, so existing callers
 * continue to work without any changes.
 */
export interface BuildCutListOptions {
  /**
   * Explicit coreMaterialId → KerfMaterial mapping.
   * When a panel's coreMaterialId appears here the value overrides the heuristic.
   * Example: { 'mat-mdf-18': 'MDF', 'mat-birch-18': 'PLYWOOD' }
   */
  materialMap?: Record<string, KerfMaterial>;

  /**
   * KerfToolProfile to use for kerf-pattern generation.
   * Defaults to DEFAULT_KERF_TOOL (SAW 3.2 mm blade, k_eff 3.4 mm).
   */
  kerfTool?: KerfToolProfile;

  /**
   * KerfMaterial to fall back to when coreMaterialId is not in materialMap
   * and the heuristic returns 'MDF' (ambiguous).
   * Defaults to 'MDF'.
   */
  fallbackMaterial?: KerfMaterial;
}

// ============================================
// EDGE BANDING HELPERS
// ============================================

/**
 * Get edge band thickness for a panel edge
 */
function getEdgeThickness(edge: string | null | undefined): number {
  if (!edge) return 0;
  // Default edge band thickness is 1mm
  // In production, this would look up from material catalog
  return 1;
}

/**
 * Get premill amount for edge band application
 * Premill = amount to remove from panel before edge banding
 */
function getPremillAmount(edgeThickness: number): number {
  if (edgeThickness <= 0) return 0;
  // Standard premill is 0.5mm for 1mm edge band
  return edgeThickness > 0 ? 0.5 : 0;
}

// ============================================
// DIMENSION CALCULATIONS (SPEC-08 v8.2)
// ============================================

/**
 * Calculate cut width from finish width and edge banding
 *
 * CUT_W = FINISH_W - EDGE_L - EDGE_R + PREMILL_L + PREMILL_R
 */
function calculateCutW(
  finishW: number,
  edgeL: number,
  edgeR: number,
  premillL: number,
  premillR: number
): number {
  return finishW - edgeL - edgeR + premillL + premillR;
}

/**
 * Calculate cut height from finish height and edge banding
 *
 * CUT_H = FINISH_H - EDGE_T - EDGE_B + PREMILL_T + PREMILL_B
 */
function calculateCutH(
  finishH: number,
  edgeT: number,
  edgeB: number,
  premillT: number,
  premillB: number
): number {
  return finishH - edgeT - edgeB + premillT + premillB;
}

// ============================================
// PANEL TO CUT LIST ROW
// ============================================

/**
 * Convert a CabinetPanel to PacketCutListRow.
 *
 * When the panel has a curved profile (ARC / S_CURVE / ROUNDED_CORNER) and
 * BuildCutListOptions are provided, `developedLength` and `kerfCount` are
 * populated; otherwise both fields are left as `undefined`.
 */
function panelToCutListRow(
  panel: CabinetPanel,
  cabinetId: string,
  rowNo: number,
  options?: BuildCutListOptions,
): PacketCutListRow {
  // Get edge banding thicknesses
  const edgeL = getEdgeThickness(panel.edges.left);
  const edgeR = getEdgeThickness(panel.edges.right);
  const edgeT = getEdgeThickness(panel.edges.top);
  const edgeB = getEdgeThickness(panel.edges.bottom);

  // Get premill amounts
  const premillL = getPremillAmount(edgeL);
  const premillR = getPremillAmount(edgeR);
  const premillT = getPremillAmount(edgeT);
  const premillB = getPremillAmount(edgeB);

  // Get finish dimensions
  const finishW = panel.finishWidth;
  const finishH = panel.finishHeight;

  // Calculate cut dimensions
  const cutW = calculateCutW(finishW, edgeL, edgeR, premillL, premillR);
  const cutH = calculateCutH(finishH, edgeT, edgeB, premillT, premillB);

  // Map grain direction
  const grain: 'HORIZONTAL' | 'VERTICAL' | 'NONE' =
    panel.grainDirection === 'HORIZONTAL' ? 'HORIZONTAL' :
    panel.grainDirection === 'VERTICAL' ? 'VERTICAL' : 'NONE';

  // ── Curve fields (Task 12) ──────────────────────────────────────────────
  let developedLength: number | undefined;
  let kerfCount: number | undefined;
  let projectedDepth: number | undefined;
  let curvedEdge: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | undefined;

  if (panel.profile && panel.profile.kind !== 'RECT') {
    const tool = options?.kerfTool ?? DEFAULT_KERF_TOOL;
    const material = resolveMaterial(
      panel.coreMaterialId,
      options?.materialMap,
      options?.fallbackMaterial,
    );
    const fields = computeCurveFields(panel, tool, material);
    if (fields) {
      developedLength = roundToPrecision(fields.developedLength);
      kerfCount = fields.kerfCount; // integer — no rounding needed
      if (fields.projectedDepth > 0) {
        projectedDepth = roundToPrecision(fields.projectedDepth);
      }
      if (fields.curvedEdge !== null) {
        curvedEdge = fields.curvedEdge;
      }
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  return {
    rowNo,
    partId: panel.id,
    cabinetId,
    materialId: panel.coreMaterialId,
    qty: 1,
    finishW: roundToPrecision(finishW),
    finishH: roundToPrecision(finishH),
    edgeBanding: [
      roundToPrecision(edgeL),
      roundToPrecision(edgeR),
      roundToPrecision(edgeT),
      roundToPrecision(edgeB),
    ],
    premill: [
      roundToPrecision(premillL),
      roundToPrecision(premillR),
      roundToPrecision(premillT),
      roundToPrecision(premillB),
    ],
    cutW: roundToPrecision(cutW),
    cutH: roundToPrecision(cutH),
    grain,
    note: panel.role,
    ...(developedLength !== undefined ? { developedLength } : {}),
    ...(kerfCount !== undefined ? { kerfCount } : {}),
    ...(projectedDepth !== undefined ? { projectedDepth } : {}),
    ...(curvedEdge !== undefined ? { curvedEdge } : {}),
  };
}

// ============================================
// MAIN BUILDER
// ============================================

/**
 * Build PacketCutList from Cabinet(s).
 *
 * @param cabinets - Source Cabinet(s) from store
 * @param options  - Optional curve-field computation options (Task 12)
 * @returns PacketCutList for factory packet
 */
export function buildCutListData(
  cabinets: Cabinet | Cabinet[],
  options?: BuildCutListOptions,
): PacketCutList {
  const cabinetArray = Array.isArray(cabinets) ? cabinets : [cabinets];

  if (cabinetArray.length === 0) {
    return {
      version: 'cutlist.v1',
      rows: [],
      summary: {
        totalRows: 0,
        totalParts: 0,
        byMaterial: {},
      },
    };
  }

  // Build rows from all cabinets
  const rows: PacketCutListRow[] = [];
  let rowNo = 1;

  for (const cabinet of cabinetArray) {
    // Filter visible panels only
    const visiblePanels = cabinet.panels.filter(p => p.visible);

    for (const panel of visiblePanels) {
      rows.push(panelToCutListRow(panel, cabinet.id, rowNo, options));
      rowNo++;
    }
  }

  // Sort rows by cabinetId, then partId for determinism
  rows.sort((a, b) => {
    const cabinetCompare = a.cabinetId.localeCompare(b.cabinetId);
    if (cabinetCompare !== 0) return cabinetCompare;
    return a.partId.localeCompare(b.partId);
  });

  // Re-number after sorting
  rows.forEach((row, idx) => {
    row.rowNo = idx + 1;
  });

  // Calculate summary
  const byMaterial: Record<string, { rows: number; parts: number }> = {};
  let totalParts = 0;

  for (const row of rows) {
    totalParts += row.qty;

    if (!byMaterial[row.materialId]) {
      byMaterial[row.materialId] = { rows: 0, parts: 0 };
    }
    byMaterial[row.materialId].rows++;
    byMaterial[row.materialId].parts += row.qty;
  }

  return {
    version: 'cutlist.v1',
    rows,
    summary: {
      totalRows: rows.length,
      totalParts,
      byMaterial,
    },
  };
}

/**
 * Build Cut List JSON string.
 *
 * @param cabinets - Source Cabinet(s) from store
 * @param options  - Optional curve-field computation options
 * @returns Deterministic JSON string
 */
export function buildCutListJson(
  cabinets: Cabinet | Cabinet[],
  options?: BuildCutListOptions,
): string {
  const data = buildCutListData(cabinets, options);
  return serializeDeterministicPretty(data);
}
