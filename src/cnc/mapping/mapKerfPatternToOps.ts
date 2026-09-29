/**
 * mapKerfPatternToOps.ts — Phase 6
 *
 * Maps KerfPattern[] (from the Curved Panel System) into SLOT CNC operations
 * for the OperationGraph.
 *
 * Design-doc D-5: "Kerf = SLOT operations (existing type, no new type needed)"
 *
 * Coordinate convention: panel-local, centered at panel origin.
 *  SIDE  group (LEFT_SIDE, RIGHT_SIDE, DIVIDER): X=t, Y=H, Z=W
 *  HORIZ group (TOP, BOTTOM, SHELF, WORKTOP)   : X=W, Y=t, Z=H
 *  BACK  group (BACK, KICKBOARD, default)       : X=W, Y=H, Z=t
 *
 * Each KerfCut produces one SlotOperation that runs the full span of
 * the edge (left-to-right / top-to-bottom), positioned at the cut's
 * distance from the edge.
 */

import type { SlotOperation, Position3D } from '../operation/operationTypes';
import type { KerfPattern } from '../../core/manufacturing/curve/kerfPatternGenerator';
import type { PanelEdge } from '../../core/types/Cabinet';
import { kEffFromTool } from '../../core/catalog/KerfBending';

// ============================================================
// Types
// ============================================================

export type PanelRole =
  | 'LEFT_SIDE' | 'RIGHT_SIDE' | 'DIVIDER'
  | 'TOP' | 'BOTTOM' | 'SHELF' | 'WORKTOP'
  | 'BACK' | 'KICKBOARD'
  | string;

export interface KerfSlotPanelInfo {
  panelId: string;
  role: PanelRole;
  /** Finish width (mm) — used for edge span */
  finishWidth: number;
  /** Finish height (mm) — used for edge span */
  finishHeight: number;
  /** Real (computed) thickness (mm) */
  thickness: number;
}

export interface MapKerfPatternResult {
  operations: SlotOperation[];
  warnings: string[];
}

// ============================================================
// Role group helpers
// ============================================================

type RoleGroup = 'SIDE' | 'HORIZ' | 'BACK';

function getRoleGroup(role: PanelRole): RoleGroup {
  if (role === 'LEFT_SIDE' || role === 'RIGHT_SIDE' || role === 'DIVIDER') return 'SIDE';
  if (role === 'TOP' || role === 'BOTTOM' || role === 'SHELF' || role === 'WORKTOP') return 'HORIZ';
  return 'BACK';
}

// ============================================================
// Slot position helper
// ============================================================

/**
 * Compute SlotOperation start + end Position3D for a kerf cut.
 *
 * All positions are in panel-local space (centered at panel origin).
 * The slot depth (into face) is returned as the `depth` property.
 */
function computeSlotPositions(
  group: RoleGroup,
  edge: PanelEdge,
  cutPosition: number,
  cutDepth: number,
  W: number,
  H: number,
  t: number
): { position: Position3D; endPosition: Position3D } | null {
  // Small clearance above panel face for CNC approach
  const FACE_CLEARANCE = 0.5;
  const halfW = W / 2;
  const halfH = H / 2;
  const halfT = t / 2;
  const faceOffset = halfT + FACE_CLEARANCE;

  if (group === 'SIDE') {
    // SIDE: X=t, Y=H, Z=W — face at +X
    const faceX = faceOffset;
    if (edge === 'TOP') {
      const y = halfH - cutPosition;
      return {
        position:    { x: faceX, y, z: -halfW },
        endPosition: { x: faceX, y, z:  halfW },
      };
    } else if (edge === 'BOTTOM') {
      const y = -halfH + cutPosition;
      return {
        position:    { x: faceX, y, z: -halfW },
        endPosition: { x: faceX, y, z:  halfW },
      };
    } else if (edge === 'LEFT') {
      const z = -halfW + cutPosition;
      return {
        position:    { x: faceX, y: -halfH, z },
        endPosition: { x: faceX, y:  halfH, z },
      };
    } else if (edge === 'RIGHT') {
      const z = halfW - cutPosition;
      return {
        position:    { x: faceX, y: -halfH, z },
        endPosition: { x: faceX, y:  halfH, z },
      };
    }
  } else if (group === 'HORIZ') {
    // HORIZ: X=W, Y=t, Z=H — face at +Y
    const faceY = faceOffset;
    if (edge === 'TOP') {
      const z = halfH - cutPosition;
      return {
        position:    { x: -halfW, y: faceY, z },
        endPosition: { x:  halfW, y: faceY, z },
      };
    } else if (edge === 'BOTTOM') {
      const z = -halfH + cutPosition;
      return {
        position:    { x: -halfW, y: faceY, z },
        endPosition: { x:  halfW, y: faceY, z },
      };
    } else if (edge === 'LEFT') {
      const x = -halfW + cutPosition;
      return {
        position:    { x, y: faceY, z: -halfH },
        endPosition: { x, y: faceY, z:  halfH },
      };
    } else if (edge === 'RIGHT') {
      const x = halfW - cutPosition;
      return {
        position:    { x, y: faceY, z: -halfH },
        endPosition: { x, y: faceY, z:  halfH },
      };
    }
  } else {
    // BACK: X=W, Y=H, Z=t — face at -Z
    const faceZ = -(faceOffset);
    if (edge === 'TOP') {
      const y = halfH - cutPosition;
      return {
        position:    { x: -halfW, y, z: faceZ },
        endPosition: { x:  halfW, y, z: faceZ },
      };
    } else if (edge === 'BOTTOM') {
      const y = -halfH + cutPosition;
      return {
        position:    { x: -halfW, y, z: faceZ },
        endPosition: { x:  halfW, y, z: faceZ },
      };
    } else if (edge === 'LEFT') {
      const x = -halfW + cutPosition;
      return {
        position:    { x, y: -halfH, z: faceZ },
        endPosition: { x, y:  halfH, z: faceZ },
      };
    } else if (edge === 'RIGHT') {
      const x = halfW - cutPosition;
      return {
        position:    { x, y: -halfH, z: faceZ },
        endPosition: { x, y:  halfH, z: faceZ },
      };
    }
  }

  // Unknown edge
  void cutDepth;
  return null;
}

// ============================================================
// Main Mapper
// ============================================================

let _opSeq = 0;
function nextKerfOpId(): string {
  return `kerf-slot-${(++_opSeq).toString().padStart(4, '0')}`;
}

/**
 * Map an array of KerfPatterns for one panel into SlotOperations.
 * Caller is responsible for adding machine-coordinate transforms if needed.
 */
export function mapKerfPatternToOps(
  patterns: KerfPattern[],
  panel: KerfSlotPanelInfo,
  toolId = 'ROUTER_3175'
): MapKerfPatternResult {
  const operations: SlotOperation[] = [];
  const warnings: string[] = [];

  if (!patterns || patterns.length === 0) {
    return { operations, warnings };
  }

  const group = getRoleGroup(panel.role);
  const { finishWidth: W, finishHeight: H, thickness: t } = panel;

  for (const pattern of patterns) {
    const edge = pattern.edge;
    const kerfWidth = kEffFromTool(pattern.tool);

    for (const cut of pattern.cuts) {
      const positions = computeSlotPositions(group, edge, cut.position, cut.depth, W, H, t);
      if (!positions) {
        warnings.push(
          `[mapKerfPatternToOps] panel=${panel.panelId} unknown edge=${edge} — slot skipped`
        );
        continue;
      }

      const op: SlotOperation = {
        id: nextKerfOpId(),
        type: 'SLOT',
        sourceId: panel.panelId,
        toolId,
        position: positions.position,
        endPosition: positions.endPosition,
        width: kerfWidth,
        depth: cut.depth,
        comment: `Kerf slot — panel ${panel.panelId} edge=${edge} pos=${cut.position.toFixed(1)}mm`,
      };
      operations.push(op);
    }
  }

  return { operations, warnings };
}

// ============================================================
// Batch mapper (all panels in a map)
// ============================================================

export interface KerfPatternsByPanelId {
  /** panelId → (KerfPattern[] + panel info) */
  entries: Array<{
    patterns: KerfPattern[];
    panel: KerfSlotPanelInfo;
  }>;
}

export function mapAllKerfPatternsToOps(
  kerfByPanel: KerfPatternsByPanelId,
  toolId = 'ROUTER_3175'
): MapKerfPatternResult {
  const allOps: SlotOperation[] = [];
  const allWarnings: string[] = [];

  for (const entry of kerfByPanel.entries) {
    const result = mapKerfPatternToOps(entry.patterns, entry.panel, toolId);
    allOps.push(...result.operations);
    allWarnings.push(...result.warnings);
  }

  return { operations: allOps, warnings: allWarnings };
}
