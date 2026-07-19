/**
 * applyWorktops — merge derived WORKTOP slabs into their host cabinets.
 *
 * Deliberately NOT a method on useCabinetStore. The store file is the highest-
 * conflict file in the repo and several lanes are editing it concurrently; this
 * needs nothing from the closure scope, so it lives here and drives the store
 * through its public setState. The store is wrapped in zustand's immer
 * middleware, which wraps setState too, so the updater below receives a draft.
 *
 * IDEMPOTENT: every worktop panel carries a deterministic `worktop:` id derived
 * from the segment's member cabinet ids, so re-running over an unchanged scene
 * replaces each panel with a byte-identical one. React keys and selection
 * survive every reconcile.
 */

import type { Cabinet, CabinetPanel } from '../types/Cabinet';
import { useCabinetStore } from '../store/useCabinetStore';
import { resolvePlacements, type PlaceableCabinet } from './placement';
import { deriveWorktopPanels } from './deriveWorktopPanels';
import { DEFAULT_WORKTOP_CONFIG, type WorktopConfig, type WorktopNote } from './types';

export const WORKTOP_PANEL_ID_PREFIX = 'worktop:';

/** True for a panel this module owns (and may therefore replace wholesale). */
export function isDerivedWorktopPanel(panel: CabinetPanel): boolean {
  return panel.id.startsWith(WORKTOP_PANEL_ID_PREFIX);
}

/**
 * Recompute a cabinet's totals from its panels.
 *
 * Mirrors calculateTotals (useCabinetStore.ts:2014-2027), which is module-local
 * and not exported. Kept in lockstep by
 * __tests__/worktopIntegration.test.ts, which asserts the project total delta
 * equals the sum of the emitted slabs' cost and CO2.
 */
function recomputeTotals(panels: readonly CabinetPanel[]) {
  let totalCost = 0;
  let totalCO2 = 0;
  let totalSurfaceArea = 0;
  let totalEdgeLength = 0;
  for (const p of panels) {
    totalCost += p.computed.cost;
    totalCO2 += p.computed.co2;
    totalSurfaceArea += p.computed.surfaceArea;
    totalEdgeLength += p.computed.edgeLength;
  }
  return { totalCost, totalCO2, panelCount: panels.length, totalSurfaceArea, totalEdgeLength };
}

export interface ApplyWorktopsResult {
  /** Number of slabs now present in the scene. */
  readonly panelCount: number;
  /** True when the store was actually written to. */
  readonly changed: boolean;
  readonly notes: readonly WorktopNote[];
}

/**
 * Derive worktops for the current scene and merge them into the store.
 *
 * Returns without writing when the derived slabs are identical to what is
 * already there, so a redundant call cannot churn the store or the renderer.
 */
export function applyWorktops(config: WorktopConfig = DEFAULT_WORKTOP_CONFIG): ApplyWorktopsResult {
  const { cabinets } = useCabinetStore.getState();

  const placements = resolvePlacements(cabinets as unknown as PlaceableCabinet[]);
  const { panelsByHostId, notes } = deriveWorktopPanels(placements, config);

  const total = [...panelsByHostId.values()].reduce((n, list) => n + list.length, 0);

  // Cheap equality check on the panels this module owns, so an unchanged scene
  // is a no-op rather than a re-render.
  const unchanged = cabinets.every(cabinet => {
    const existing = cabinet.panels.filter(isDerivedWorktopPanel);
    const derived = panelsByHostId.get(cabinet.id) ?? [];
    if (existing.length !== derived.length) return false;
    return existing.every((p, i) => {
      const d = derived[i];
      return (
        p.id === d.id &&
        p.finishWidth === d.finishWidth &&
        p.finishHeight === d.finishHeight &&
        p.position[0] === d.position[0] &&
        p.position[1] === d.position[1] &&
        p.position[2] === d.position[2] &&
        // Money and banding too, not just geometry. A config change that swaps
        // material without moving or resizing a slab leaves it in exactly the
        // same place at a different price; comparing position alone would keep
        // the stale number in the store and report changed:false.
        p.computed.cost === d.computed.cost &&
        p.computed.co2 === d.computed.co2 &&
        p.computed.realThickness === d.computed.realThickness &&
        p.coreMaterialId === d.coreMaterialId &&
        p.edges.top === d.edges.top &&
        p.edges.bottom === d.edges.bottom &&
        p.edges.left === d.edges.left &&
        p.edges.right === d.edges.right
      );
    });
  });

  if (unchanged) {
    return { panelCount: total, changed: false, notes };
  }

  useCabinetStore.setState((state: { cabinets: Cabinet[]; cabinet: Cabinet | null }) => {
    for (const cabinet of state.cabinets) {
      const derived = panelsByHostId.get(cabinet.id) ?? [];
      const carcass = cabinet.panels.filter(p => !isDerivedWorktopPanel(p));

      if (derived.length === 0 && carcass.length === cabinet.panels.length) {
        continue; // nothing to add, nothing stale to remove
      }

      cabinet.panels = [...carcass, ...derived];
      cabinet.computed = recomputeTotals(cabinet.panels);
      cabinet.updatedAt = Date.now();
    }

    // Keep the active-cabinet alias pointing at the same object the UI reads.
    if (state.cabinet) {
      const active = state.cabinets.find(c => c.id === state.cabinet!.id);
      if (active) state.cabinet = active;
    }
  });

  return { panelCount: total, changed: true, notes };
}

/** Remove every derived worktop from the scene. Used by tests and teardown. */
export function clearWorktops(): void {
  useCabinetStore.setState((state: { cabinets: Cabinet[]; cabinet: Cabinet | null }) => {
    for (const cabinet of state.cabinets) {
      if (!cabinet.panels.some(isDerivedWorktopPanel)) continue;
      cabinet.panels = cabinet.panels.filter(p => !isDerivedWorktopPanel(p));
      cabinet.computed = recomputeTotals(cabinet.panels);
    }
    if (state.cabinet) {
      const active = state.cabinets.find(c => c.id === state.cabinet!.id);
      if (active) state.cabinet = active;
    }
  });
}
