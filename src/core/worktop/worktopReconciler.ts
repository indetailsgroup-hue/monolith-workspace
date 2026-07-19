/**
 * worktopReconciler — keep derived worktops in step with the scene.
 *
 * One subscription instead of touching each of the eight-plus mutating actions
 * in useCabinetStore.
 *
 * THE FEEDBACK-LOOP GUARD: the signature is built from cabinet placement plus
 * the ids of the NON-worktop panels only. applyWorktops adds and removes
 * `worktop:` panels, which by construction cannot move the signature, so the
 * pass can never re-trigger itself. Including the carcass panel ids is what
 * makes a full panel regeneration (add a shelf, change a joint) — which wipes
 * the hosted slabs — trigger a re-apply.
 */

import type { Cabinet } from '../types/Cabinet';
import { useCabinetStore } from '../store/useCabinetStore';
import { applyWorktops } from './applyWorktops';
import { isDerivedWorktopPanel } from './applyWorktops';
import { DEFAULT_WORKTOP_CONFIG, type WorktopConfig } from './types';

/** Round to 0.01mm so float noise in a drag cannot spin the reconciler. */
const q = (v: number) => Math.round(v * 100) / 100;

/**
 * A string that changes exactly when the derived worktops could change, and
 * never when only worktop panels change.
 */
export function geometrySignature(cabinets: readonly Cabinet[]): string {
  const parts: string[] = [];
  // Sort by id so a reorder of cabinets[] alone is not treated as a change.
  for (const c of [...cabinets].sort((a, b) => a.id.localeCompare(b.id))) {
    const pos = (c as unknown as { scenePosition?: number[] }).scenePosition ?? [0, 0, 0];
    const rot = (c as unknown as { sceneRotation?: number[] }).sceneRotation ?? [0, 0, 0];
    const d = c.dimensions;
    const carcassIds = c.panels.filter(p => !isDerivedWorktopPanel(p)).map(p => p.id).join(',');
    parts.push(
      `${c.id}|${c.type}|${q(pos[0])},${q(pos[1])},${q(pos[2])}` +
        `|${q(rot[1])}|${d.width},${d.height},${d.depth},${d.toeKickHeight}|${carcassIds}`
    );
  }
  return parts.join(';');
}

/**
 * Subscribe to the store and re-derive worktops whenever the scene geometry
 * moves. Runs once immediately so an already-loaded project gets its worktops.
 *
 * @returns an unsubscribe function
 */
export function mountWorktopReconciler(
  config: WorktopConfig = DEFAULT_WORKTOP_CONFIG
): () => void {
  let lastSignature = '';
  let running = false;

  const reconcile = () => {
    if (running) return; // belt and braces: never re-enter during our own write
    const next = geometrySignature(useCabinetStore.getState().cabinets);
    if (next === lastSignature) return;

    running = true;
    try {
      applyWorktops(config);
    } finally {
      // Re-read: applyWorktops does not change the signature, but reading it
      // back rather than trusting `next` keeps this honest if that ever stops
      // being true.
      lastSignature = geometrySignature(useCabinetStore.getState().cabinets);
      running = false;
    }
  };

  reconcile();
  return useCabinetStore.subscribe(reconcile);
}
