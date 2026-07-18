/**
 * Honest manufacturing data for a worktop slab.
 *
 * ⚠ FORMULA DUPLICATION — READ BEFORE EDITING.
 * This is a deliberate line-for-line re-implementation of the `computePanel`
 * closure inside generatePanels (src/core/store/useCabinetStore.ts:1566-1590).
 * That closure is not exported and extracting it would mean a large edit to the
 * highest-conflict file in the repo. If you change the cost/CO2/cut-size rule
 * in either place you MUST change it in the other; the hand-computed vector in
 * __tests__/computeWorktopPanel.test.ts goes red if the two drift.
 */

import { calculateCutSize, calculateRealThickness, type PanelComputed } from '../types/Cabinet';
import {
  CORE_MATERIALS_CATALOG,
  EDGE_MATERIALS_CATALOG,
  SURFACE_MATERIALS_CATALOG,
} from '../materials/PanelMaterialSystem';
import type { WorktopConfig } from './types';

export interface WorktopMaterials {
  readonly core: { id: string; thickness: number; costPerSqm: number; co2PerSqm: number };
  readonly surface: { id: string; thickness: number; costPerSqm: number; co2PerSqm: number };
  readonly edge: { id: string; thickness: number; costPerMeter: number };
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
 * Resolve the configured material ids against the real catalogs.
 *
 * Throws rather than falling back. generatePanels falls back to a default core
 * when an id is unknown, which is fine for a carcass panel the user is actively
 * editing but is exactly the failure mode governance cares about here: a slab
 * that silently swaps to a cheaper material would put a wrong-but-precise
 * number in the BOM. A hard failure is louder and safer.
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
  return { core, surface, edge };
}

/** Slab thickness, derived from the catalog exactly as generatePanels derives T_real. */
export function worktopRealThickness(materials: WorktopMaterials): number {
  return calculateRealThickness(
    materials.core.thickness,
    materials.surface.thickness,
    materials.surface.thickness,
    0 // no glue in displayed thickness — mirrors useCabinetStore.ts:1550
  );
}

/**
 * Compute cut sizes, edge length, cost and CO2 for one slab.
 *
 * @param finishWidth  slab length along the run, mm
 * @param finishHeight slab depth front-to-back, mm
 */
export function computeWorktopPanel(
  finishWidth: number,
  finishHeight: number,
  banding: WorktopBanding,
  materials: WorktopMaterials
): PanelComputed {
  const { core, surface, edge } = materials;
  const ET = edge.thickness;

  const edgeFront = banding.front ? ET : 0;
  const edgeBack = banding.back ? ET : 0;
  const edgeLow = banding.lowEnd ? ET : 0;
  const edgeHigh = banding.highEnd ? ET : 0;

  // Width runs along the slab length, so it loses the two END edges.
  // Height runs front-to-back, so it loses the FRONT and BACK edges.
  const cutWidth = calculateCutSize(finishWidth, edgeLow, edgeHigh);
  const cutHeight = calculateCutSize(finishHeight, edgeFront, edgeBack);

  const area = (finishWidth * finishHeight) / 1000000; // m², single face
  const edgeLength =
    ((edgeFront > 0 ? finishWidth : 0) +
      (edgeBack > 0 ? finishWidth : 0) +
      (edgeLow > 0 ? finishHeight : 0) +
      (edgeHigh > 0 ? finishHeight : 0)) /
    1000; // metres

  const cost =
    area * core.costPerSqm + area * 2 * surface.costPerSqm + edgeLength * edge.costPerMeter;
  const co2 = area * core.co2PerSqm + area * 2 * surface.co2PerSqm;

  return {
    realThickness: worktopRealThickness(materials),
    cutWidth,
    cutHeight,
    surfaceArea: area * 2, // both faces
    edgeLength,
    cost,
    co2,
  };
}
