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
 * @version 1.0.0 - Phase B2: Factory Packet Generator MVP
 */

import type { Cabinet, CabinetPanel } from '../../../core/types/Cabinet';
import type { PacketCutList, PacketCutListRow } from '../types';
import { roundToPrecision, serializeDeterministicPretty } from '../manifestHash';

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
 * Convert a CabinetPanel to PacketCutListRow
 */
function panelToCutListRow(
  panel: CabinetPanel,
  cabinetId: string,
  rowNo: number
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
  };
}

// ============================================
// MAIN BUILDER
// ============================================

/**
 * Build PacketCutList from Cabinet(s)
 *
 * @param cabinets - Source Cabinet(s) from store
 * @returns PacketCutList for factory packet
 */
export function buildCutListData(cabinets: Cabinet | Cabinet[]): PacketCutList {
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
      rows.push(panelToCutListRow(panel, cabinet.id, rowNo));
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
 * Build Cut List JSON string
 *
 * @param cabinets - Source Cabinet(s) from store
 * @returns Deterministic JSON string
 */
export function buildCutListJson(cabinets: Cabinet | Cabinet[]): string {
  const data = buildCutListData(cabinets);
  return serializeDeterministicPretty(data);
}
