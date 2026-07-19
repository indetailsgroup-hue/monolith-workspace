/**
 * Honest manufacturing data for a worktop slab.
 *
 * The cost / CO2 / cut-size arithmetic is NOT re-implemented here. It lives in
 * src/core/manufacturing/panelComputed.ts and is called by both this module and
 * the `computePanel` closure inside generatePanels, so there is exactly one
 * money formula in the repo. The previous hand-copied twin was pinned by a test
 * that re-derived the arithmetic rather than calling the original — a guard
 * that could not detect the drift it advertised.
 */

import type { PanelComputed } from '../types/Cabinet';
import {
  computePanelComputed,
  panelRealThickness,
  type PanelCostMaterials,
} from '../manufacturing/panelComputed';
import {
  CORE_MATERIALS_CATALOG,
  EDGE_MATERIALS_CATALOG,
  SURFACE_MATERIALS_CATALOG,
} from '../materials/PanelMaterialSystem';
import type { WorktopConfig } from './types';

export interface WorktopMaterials extends PanelCostMaterials {
  readonly core: {
    id: string;
    thickness: number;
    costPerSqm: number;
    co2PerSqm: number;
    moistureResistant: boolean;
  };
  readonly surface: { id: string; thickness: number; costPerSqm: number; co2PerSqm: number };
  readonly edge: { id: string; thickness: number; height: number; costPerMeter: number };
}

/** Which of a slab's four edges carry tape. */
export interface WorktopBanding {
  /** Front edge — runs along the slab length. */
  readonly front: boolean;
  /** Back edge — runs along the slab length. */
  readonly back: boolean;
  /** Low-u end — runs across the slab depth. */
  readonly lowEnd: boolean;
  /** High-u end — runs across the slab depth. */
  readonly highEnd: boolean;
}

/**
 * Resolve the configured material ids against the real catalogs AND check that
 * the resolved spec can actually be built.
 *
 * Throws rather than falling back, on all four counts. generatePanels falls
 * back to a default core when an id is unknown, which is fine for a carcass
 * panel the user is actively editing but is exactly the failure mode governance
 * cares about here: a slab that silently swaps material, or that is quoted with
 * tape too narrow to cover it, puts a wrong-but-precise number in the BOM and a
 * packet the edgebander cannot run. A hard failure is louder and safer.
 */
export function resolveWorktopMaterials(config: WorktopConfig): WorktopMaterials {
  const core = CORE_MATERIALS_CATALOG[config.coreMaterialId];
  if (!core) {
    throw new Error(`Worktop core material not in catalog: ${config.coreMaterialId}`);
  }
  const surface = SURFACE_MATERIALS_CATALOG[config.surfaceMaterialId];
  if (!surface) {
    throw new Error(`Worktop surface material not in catalog: ${config.surfaceMaterialId}`);
  }
  const edge = EDGE_MATERIALS_CATALOG[config.edgeMaterialId];
  if (!edge) {
    throw new Error(`Worktop edge material not in catalog: ${config.edgeMaterialId}`);
  }

  // A worktop meets water at the sink and the hob. A non-MR board swells and
  // the joint blows within a season, so it must never reach a cut list as a
  // worktop however correct its price is.
  if (!core.moistureResistant) {
    throw new Error(
      `Worktop core ${core.id} is not moisture-resistant and must not be used as a worktop. ` +
        `Choose a moistureResistant core from CORE_MATERIALS_CATALOG.`
    );
  }

  const materials = { core, surface, edge } as WorktopMaterials;
  const thickness = worktopRealThickness(materials);

  // flatPartBuilder.ts:172 copies edge.height verbatim into the manufacturing
  // packet, so tape shorter than the slab instructs the edgebander to leave raw
  // board on the kitchen's most visible edge — at the price of the narrow tape.
  // No existing role was ever thick enough to expose this; a worktop is.
  if (edge.height < thickness) {
    throw new Error(
      `Worktop edge ${edge.id} is ${edge.height}mm tall but the slab is ${thickness.toFixed(1)}mm ` +
        `thick — the tape cannot cover the edge it is quoted for. Choose an edge material with ` +
        `height >= ${thickness.toFixed(1)}mm.`
    );
  }

  return materials;
}

/** Slab thickness, derived from the catalog exactly as generatePanels derives T_real. */
export function worktopRealThickness(materials: PanelCostMaterials): number {
  return panelRealThickness(materials);
}

/**
 * Compute cut sizes, edge length, cost and CO2 for one slab.
 *
 * Edge-slot mapping for this role: the slab's FRONT and BACK edges run along
 * its length, so they consume the HEIGHT axis (`top`/`bottom` slots); the two
 * run ENDS run across its depth, so they consume the WIDTH axis
 * (`left`/`right`). deriveWorktopPanels writes panel.edges to match.
 *
 * @param finishWidth  slab length along the run, mm
 * @param finishHeight slab depth front-to-back, mm
 */
export function computeWorktopPanel(
  finishWidth: number,
  finishHeight: number,
  banding: WorktopBanding,
  materials: WorktopMaterials,
  preMilling: number = 0.5
): PanelComputed {
  const ET = materials.edge.thickness;

  return computePanelComputed(
    finishWidth,
    finishHeight,
    {
      top: banding.front ? ET : 0,
      bottom: banding.back ? ET : 0,
      left: banding.lowEnd ? ET : 0,
      right: banding.highEnd ? ET : 0,
    },
    materials,
    preMilling
  );
}
