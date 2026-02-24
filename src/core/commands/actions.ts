/**
 * actions.ts - Real Command Actions
 *
 * Wired to existing stores with graceful fallbacks.
 * - Move/Rotate (G/R) → useToolStore
 * - Mirror (Alt+X) → useCabinetStore.mirrorCabinet
 * - Booleans (Q/W/E) → MVP 2D bbox operations
 *
 * @version 1.0.0
 */

import { useToolStore } from '@/core/store/useToolStore';
import { useCabinetStore } from '@/core/store/useCabinetStore';

// ============================================================================
// Tool Actions
// ============================================================================

export function actionSelect() {
  const { setTool } = useToolStore.getState();
  if (setTool) setTool('select');
}

export function actionMove() {
  const { setTool } = useToolStore.getState();
  if (setTool) setTool('move');
}

export function actionRotate() {
  const { setTool } = useToolStore.getState();
  if (setTool) setTool('rotate');
}

// ============================================================================
// Mirror Action
// ============================================================================

export function actionMirrorX() {
  const { activeCabinetId, mirrorCabinet } = useCabinetStore.getState();
  if (!activeCabinetId) {
    console.info('[Mirror] No active cabinet selected');
    return;
  }
  if (!mirrorCabinet) {
    console.info('[Mirror] mirrorCabinet not available');
    return;
  }
  const result = mirrorCabinet(activeCabinetId, 'x');
  if (result) {
    console.log('[Mirror] Created mirror:', result.name);
  }
}

export function actionMirrorZ() {
  const { activeCabinetId, mirrorCabinet } = useCabinetStore.getState();
  if (!activeCabinetId) {
    console.info('[Mirror] No active cabinet selected');
    return;
  }
  if (!mirrorCabinet) {
    console.info('[Mirror] mirrorCabinet not available');
    return;
  }
  const result = mirrorCabinet(activeCabinetId, 'z');
  if (result) {
    console.log('[Mirror] Created mirror:', result.name);
  }
}

// Legacy mirror action (flips position instead of creating copy)
export function actionMirrorAltX() {
  const state = useCabinetStore.getState() as any;
  const activeId = state.activeCabinetId;
  if (!activeId) {
    console.info('[Mirror] No active cabinet selected');
    return;
  }

  const cabinet = state.cabinets?.find((c: any) => c.id === activeId);
  if (!cabinet) {
    console.info('[Mirror] Cabinet not found');
    return;
  }

  // Flip X position
  const pos = Array.isArray(cabinet.scenePosition) ? [...cabinet.scenePosition] : [0, 0, 0];
  pos[0] = -pos[0];
  state.updateCabinetPosition?.(activeId, pos);

  // Rotate Y by 180°
  const rot = Array.isArray(cabinet.sceneRotation) ? [...cabinet.sceneRotation] : [0, 0, 0];
  rot[1] = ((rot[1] || 0) + Math.PI) % (Math.PI * 2);
  state.updateCabinetRotation?.(activeId, rot);

  console.log('[Mirror] Flipped cabinet position');
}

// ============================================================================
// Boolean Actions (MVP - Bounding Box)
// ============================================================================

export type BooleanMode = 'diff' | 'union' | 'intersect';

type Vec2 = { x: number; y: number };
type Poly = Vec2[];

function bbox(poly: Poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function rectFromPoly(poly: Poly) {
  const b = bbox(poly);
  return { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY };
}

type Rect = { x: number; y: number; w: number; h: number };

function rectBoolean(a: Rect, b: Rect, mode: BooleanMode): Vec2[] | null {
  const ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx2 = b.x + b.w, by2 = b.y + b.h;

  // Intersection bounds
  const ix = Math.max(a.x, b.x), iy = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  const hasIntersection = ix2 > ix && iy2 > iy;

  switch (mode) {
    case 'intersect':
      if (!hasIntersection) return null;
      return [
        { x: ix, y: iy },
        { x: ix2, y: iy },
        { x: ix2, y: iy2 },
        { x: ix, y: iy2 },
      ];

    case 'union': {
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      const x2 = Math.max(ax2, bx2), y2 = Math.max(ay2, by2);
      return [
        { x, y },
        { x: x2, y },
        { x: x2, y: y2 },
        { x, y: y2 },
      ];
    }

    case 'diff':
      // MVP: Return A unchanged (proper diff requires polygon clipping)
      return [
        { x: a.x, y: a.y },
        { x: ax2, y: a.y },
        { x: ax2, y: ay2 },
        { x: a.x, y: ay2 },
      ];

    default:
      return null;
  }
}

/**
 * Try to get sketch preview store from global
 */
function getSketchPreview(): any {
  try {
    const win = globalThis as any;
    const store = win.useSketchPreview || win.useSketchStore || null;
    return store?.getState?.();
  } catch {
    return null;
  }
}

export function actionBoolean(mode: BooleanMode) {
  const sk = getSketchPreview();

  if (!sk || !sk.primary || !sk.secondary) {
    console.info(`[Boolean:${mode}] No sketch preview with primary/secondary; noop`);
    return;
  }

  const A: Poly = sk.primary;
  const B: Poly = sk.secondary;

  const ra = rectFromPoly(A);
  const rb = rectFromPoly(B);
  const result = rectBoolean(ra, rb, mode);

  if (!result) {
    console.info(`[Boolean:${mode}] No intersection found; noop`);
    return;
  }

  if (sk.setResult) {
    sk.setResult(result);
    console.log(`[Boolean:${mode}] Result set:`, result);
  } else {
    console.info(`[Boolean:${mode}] Result:`, result);
  }
}

// Convenience exports
export const actionBooleanDiff = () => actionBoolean('diff');
export const actionBooleanUnion = () => actionBoolean('union');
export const actionBooleanIntersect = () => actionBoolean('intersect');

// ============================================================================
// Delete Action
// ============================================================================

/**
 * Delete the currently active cabinet
 */
export function actionDelete() {
  const { activeCabinetId, removeCabinet, selectCabinet, cabinets } = useCabinetStore.getState();

  if (!activeCabinetId) {
    console.info('[Delete] No active cabinet selected');
    return;
  }

  // Find next cabinet to select
  const currentIndex = cabinets.findIndex((c: any) => c.id === activeCabinetId);
  const nextCabinet = cabinets[currentIndex + 1] || cabinets[currentIndex - 1];

  // Remove the cabinet
  removeCabinet(activeCabinetId);
  console.log('[Delete] Removed cabinet:', activeCabinetId);

  // Select next cabinet if available
  if (nextCabinet) {
    selectCabinet(nextCabinet.id);
  }
}

/**
 * Duplicate the currently active cabinet
 */
export function actionDuplicate() {
  const { activeCabinetId, duplicateCabinet, selectCabinet } = useCabinetStore.getState();

  if (!activeCabinetId) {
    console.info('[Duplicate] No active cabinet selected');
    return;
  }

  const newCabinet = duplicateCabinet(activeCabinetId);
  if (newCabinet) {
    selectCabinet(newCabinet.id);
    console.log('[Duplicate] Created copy:', newCabinet.name);
  }
}

// ============================================================================
// Save Action
// ============================================================================

import { useProjectStore } from '@/core/store/useProjectStore';

/**
 * Save the current project
 * Note: Zustand persist middleware auto-saves, so this triggers a manual sync
 */
export function actionSave() {
  const projectStore = useProjectStore.getState() as any;

  // Try saveProject if available
  if (typeof projectStore.saveProject === 'function') {
    projectStore.saveProject();
    console.log('[Save] Project saved via saveProject()');
    return;
  }

  // Try persist middleware's rehydrate to force sync
  if (typeof projectStore.persist?.rehydrate === 'function') {
    projectStore.persist.rehydrate();
  }

  // Also sync cabinet store if it has persist
  const cabinetStore = useCabinetStore.getState() as any;
  if (typeof cabinetStore.persist?.rehydrate === 'function') {
    cabinetStore.persist.rehydrate();
  }

  console.log('[Save] Project state synced');
}
