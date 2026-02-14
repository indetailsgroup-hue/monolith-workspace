/**
 * Cabinet Derivations Module - Central Recompute Logic
 *
 * ARCHITECTURE:
 * This module provides the single entry point for recomputing all derived
 * values in a cabinet after any mutation. This ensures:
 * - Deterministic calculations
 * - No stale derived state
 * - Single source of truth for geometry/thickness
 *
 * INVARIANTS:
 * I1. Cabinet3D must re-render when any panel material/edge/thickness/dims/structure changes
 * I2. Manufacturing exports must match the visible 3D carcass geometry
 * I3. Every mutation that affects geometry must trigger recomputeCabinetDerived()
 *
 * @version 1.0.0 (Phase 3)
 */

import {
  computePanelTotalThickness,
  computeBackDepthReduction,
  type PanelThicknessInput,
} from '../materials/materialThickness';

// ============================================
// TYPES
// ============================================

/**
 * Minimal cabinet interface for derivation calculations
 * Uses duck typing to avoid circular dependencies
 */
export interface CabinetForDerivation {
  id: string;
  dimensions: {
    width: number;
    height: number;
    depth: number;
    toeKickHeight: number;
  };
  structure: {
    hasBackPanel: boolean;
    backPanelConstruction: 'inset' | 'overlay';
    topJoint: string;
    bottomJoint: string;
    shelfCount: number;
    dividerCount: number;
    [key: string]: unknown;
  };
  materials: {
    defaultCore: string;
    defaultSurface: string;
    defaultEdge: string;
  };
  panels: PanelForDerivation[];
  updatedAt: number;
  [key: string]: unknown;
}

export interface PanelForDerivation {
  id: string;
  role: string;
  name: string;
  coreMaterialId: string;
  faces: {
    faceA: string | null;
    faceB: string | null;
  };
  edges?: {
    top?: string | null;
    bottom?: string | null;
    left?: string | null;
    right?: string | null;
  };
  finishWidth: number;
  finishHeight: number;
  position: [number, number, number];
  rotation: [number, number, number];
  computed: {
    realThickness: number;
    cutWidth: number;
    cutHeight: number;
    surfaceArea: number;
    edgeLength: number;
    cost: number;
    co2: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface EdgeMaterialCatalog {
  [id: string]: { thickness: number; [key: string]: unknown };
}

// ============================================
// CORE RECOMPUTE FUNCTION
// ============================================

/**
 * Recompute all derived values for a cabinet
 *
 * This is the SINGLE ENTRY POINT for all derivation calculations.
 * Call this after every mutation that affects:
 * - Dimensions
 * - Structure (back panel, joints, shelves, dividers)
 * - Materials (core, surface, edge)
 * - Panel geometry
 *
 * @param cabinet - The cabinet to recompute (mutated in place)
 * @param edgeMaterials - Edge materials catalog for cut size calculation
 */
export function recomputeCabinetDerived(
  cabinet: CabinetForDerivation,
  edgeMaterials: EdgeMaterialCatalog
): void {
  const defaultSurfaceId = cabinet.materials?.defaultSurface ?? 'surf-mel-white';

  // Step 1: Recompute all panel thicknesses
  for (const panel of cabinet.panels) {
    const panelInput: PanelThicknessInput = {
      coreMaterialId: panel.coreMaterialId,
      faces: panel.faces,
    };
    panel.computed.realThickness = computePanelTotalThickness(panelInput, defaultSurfaceId);
  }

  // Step 2: Recompute carcass geometry if back panel is overlay
  recomputeCarcassGeometry(cabinet, edgeMaterials);

  // Step 3: Mark cabinet as updated (for reactivity)
  cabinet.updatedAt = Date.now();
}

/**
 * Recompute carcass geometry when back panel thickness changes (OVERLAY mode)
 *
 * INVARIANTS:
 * - carcassDepth = D - backDepthReduction
 * - carcassZ = backDepthReduction / 2
 * - backZ = -D/2 + backTotalT/2
 */
function recomputeCarcassGeometry(
  cabinet: CabinetForDerivation,
  edgeMaterials: EdgeMaterialCatalog
): void {
  if (!cabinet.structure?.hasBackPanel || cabinet.structure.backPanelConstruction !== 'overlay') {
    return; // Only applies to overlay mode
  }

  const D = cabinet.dimensions.depth;
  const defaultSurfaceId = cabinet.materials?.defaultSurface ?? 'surf-mel-white';
  const backPanel = cabinet.panels.find(p => p.role === 'BACK');

  if (!backPanel) return;

  // TRUTH MODULE: Calculate back depth reduction
  const backPanelInput: PanelThicknessInput = {
    coreMaterialId: backPanel.coreMaterialId,
    faces: backPanel.faces,
  };
  const backTotalT = computePanelTotalThickness(backPanelInput, defaultSurfaceId);
  const backDepthReduction = computeBackDepthReduction(
    cabinet.structure,
    backPanelInput,
    defaultSurfaceId
  );
  const newCarcassDepth = D - backDepthReduction;
  const newCarcassZ = backDepthReduction / 2;
  const newBackZ = -D / 2 + backTotalT / 2;

  // Update all panels with new geometry
  for (const p of cabinet.panels) {
    switch (p.role) {
      case 'LEFT_SIDE':
      case 'RIGHT_SIDE':
        // finishWidth = depth for side panels
        p.finishWidth = newCarcassDepth;
        p.position = [p.position[0], p.position[1], newCarcassZ];
        // Recalculate cut dimensions
        if (p.computed) {
          const edgeL = p.edges?.left ? (edgeMaterials[p.edges.left]?.thickness ?? 1) : 0;
          const edgeR = p.edges?.right ? (edgeMaterials[p.edges.right]?.thickness ?? 1) : 0;
          p.computed.cutWidth = p.finishWidth - edgeL - edgeR + (edgeL > 0 ? 1 : 0) + (edgeR > 0 ? 1 : 0);
          p.computed.surfaceArea = (p.finishWidth * p.finishHeight) / 1000000 * 2;
        }
        break;

      case 'TOP':
      case 'BOTTOM':
      case 'SHELF':
        // finishHeight = depth for horizontal panels
        p.finishHeight = newCarcassDepth;
        p.position = [p.position[0], p.position[1], newCarcassZ];
        // Recalculate cut dimensions
        if (p.computed) {
          const edgeT = p.edges?.top ? (edgeMaterials[p.edges.top]?.thickness ?? 1) : 0;
          const edgeB = p.edges?.bottom ? (edgeMaterials[p.edges.bottom]?.thickness ?? 1) : 0;
          p.computed.cutHeight = p.finishHeight - edgeT - edgeB + (edgeT > 0 ? 1 : 0) + (edgeB > 0 ? 1 : 0);
          p.computed.surfaceArea = (p.finishWidth * p.finishHeight) / 1000000 * 2;
        }
        break;

      case 'BACK':
        // Update back panel Z position to stay inside OD budget
        p.position = [p.position[0], p.position[1], newBackZ];
        break;

      case 'DIVIDER':
        // Dividers also use finishHeight = depth
        p.finishHeight = newCarcassDepth;
        p.position = [p.position[0], p.position[1], newCarcassZ];
        if (p.computed) {
          p.computed.surfaceArea = (p.finishWidth * p.finishHeight) / 1000000 * 2;
        }
        break;
    }
  }
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Verify cabinet derived values are consistent
 * Returns list of violations if any
 */
export function validateCabinetDerived(
  cabinet: CabinetForDerivation,
  edgeMaterials: EdgeMaterialCatalog
): string[] {
  const violations: string[] = [];
  const defaultSurfaceId = cabinet.materials?.defaultSurface ?? 'surf-mel-white';

  // Check panel thicknesses
  for (const panel of cabinet.panels) {
    const expected = computePanelTotalThickness(
      { coreMaterialId: panel.coreMaterialId, faces: panel.faces },
      defaultSurfaceId
    );
    if (Math.abs(panel.computed.realThickness - expected) > 0.001) {
      violations.push(
        `Panel ${panel.name}: thickness mismatch (got ${panel.computed.realThickness}, expected ${expected})`
      );
    }
  }

  // Check back panel geometry for overlay mode
  if (cabinet.structure.hasBackPanel && cabinet.structure.backPanelConstruction === 'overlay') {
    const D = cabinet.dimensions.depth;
    const backPanel = cabinet.panels.find(p => p.role === 'BACK');
    if (backPanel) {
      const backDepthReduction = computeBackDepthReduction(
        cabinet.structure,
        { coreMaterialId: backPanel.coreMaterialId, faces: backPanel.faces },
        defaultSurfaceId
      );
      const expectedCarcassDepth = D - backDepthReduction;

      // Check side panels
      const sidePanel = cabinet.panels.find(p => p.role === 'LEFT_SIDE');
      if (sidePanel && Math.abs(sidePanel.finishWidth - expectedCarcassDepth) > 0.001) {
        violations.push(
          `Side panel depth mismatch (got ${sidePanel.finishWidth}, expected ${expectedCarcassDepth})`
        );
      }
    }
  }

  return violations;
}
