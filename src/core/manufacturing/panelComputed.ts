/**
 * panelComputed.ts — the ONE cost / CO2 / cut-size formula for every panel role.
 *
 * Before this file the formula existed three times: the `computePanel` closure
 * inside generatePanels (useCabinetStore.ts), a hand-copied re-implementation in
 * computeWorktopPanel.ts, and implicitly again wherever a material override was
 * meant to apply. The copies were pinned by nothing — a test that re-derives the
 * arithmetic cannot detect drift from a function it never calls.
 *
 * Both call sites now delegate here, so there is a single rule and a single
 * place to change it. Keep this file free of store and React imports.
 */

import { calculateCutSize, calculateRealThickness, type PanelComputed } from '../types/Cabinet';

/** The only material properties the money formula reads. */
export interface PanelCostCore {
  readonly thickness: number;
  readonly costPerSqm: number;
  readonly co2PerSqm: number;
}

export interface PanelCostSurface {
  readonly thickness: number;
  readonly costPerSqm: number;
  readonly co2PerSqm: number;
}

export interface PanelCostEdge {
  readonly thickness: number;
  readonly costPerMeter: number;
}

export interface PanelCostMaterials {
  readonly core: PanelCostCore;
  readonly surface: PanelCostSurface;
  readonly edge: PanelCostEdge;
}

/**
 * Tape thickness applied to each of the four edge slots, in mm. 0 = no tape.
 *
 * Slot meaning is ROLE-DEPENDENT and is the caller's business: for a carcass
 * side panel `top` is the physical top edge, for a WORKTOP `top` is the FRONT
 * edge. The formula only cares which of the two axes a slot consumes.
 */
export interface PanelEdgeThicknesses {
  /** Runs along finishWidth. */
  readonly top: number;
  /** Runs along finishWidth. */
  readonly bottom: number;
  /** Runs along finishHeight. */
  readonly left: number;
  /** Runs along finishHeight. */
  readonly right: number;
}

/**
 * Panel thickness as displayed and as fed to nesting / DXF.
 *
 * Glue is deliberately excluded (the 4th argument is 0), matching the original
 * closure at useCabinetStore.ts:1557-1562: e.g. 18 + 0.3 + 0.3 = 18.6mm.
 */
export function panelRealThickness(materials: PanelCostMaterials): number {
  return calculateRealThickness(
    materials.core.thickness,
    materials.surface.thickness,
    materials.surface.thickness,
    0
  );
}

/**
 * Cut sizes, banded length, surface area, cost and CO2 for one rectangular part.
 *
 * @param finishWidth  finish size along the width axis, mm
 * @param finishHeight finish size along the height axis, mm
 * @param edges        tape thickness per slot, mm (0 = untaped)
 * @param materials    resolved catalog entries — NOT ids
 * @param preMilling   per-side pre-mill allowance, mm. Passed through to
 *                     calculateCutSize, which currently ignores it; passing it
 *                     from every call site means re-activating pre-milling
 *                     changes all roles together instead of silently diverging.
 */
export function computePanelComputed(
  finishWidth: number,
  finishHeight: number,
  edges: PanelEdgeThicknesses,
  materials: PanelCostMaterials,
  preMilling: number
): PanelComputed {
  const { core, surface, edge } = materials;

  // Width loses the tape on the two slots that run across it (left/right);
  // height loses the tape on the two that run across it (top/bottom).
  const cutWidth = calculateCutSize(finishWidth, edges.left, edges.right, preMilling);
  const cutHeight = calculateCutSize(finishHeight, edges.top, edges.bottom, preMilling);

  const area = (finishWidth * finishHeight) / 1000000; // m², single face
  const edgeLength =
    ((edges.top > 0 ? finishWidth : 0) +
      (edges.bottom > 0 ? finishWidth : 0) +
      (edges.left > 0 ? finishHeight : 0) +
      (edges.right > 0 ? finishHeight : 0)) /
    1000; // metres

  const cost =
    area * core.costPerSqm + area * 2 * surface.costPerSqm + edgeLength * edge.costPerMeter;
  const co2 = area * core.co2PerSqm + area * 2 * surface.co2PerSqm;

  return {
    realThickness: panelRealThickness(materials),
    cutWidth,
    cutHeight,
    surfaceArea: area * 2, // both faces
    edgeLength,
    cost,
    co2,
  };
}
