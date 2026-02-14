/**
 * Gizmo HUD (Stub)
 *
 * Heads-up display for the transform gizmo showing axis, delta, snap info.
 */

interface GizmoHUDProps {
  visible: boolean;
  space: string;
  axis: string | null;
  plane: string | null;
  isDragging: boolean;
  deltaMm: number;
  planeDelta: { u: number; v: number } | null;
  planeLock: boolean | null;
  planeMode: boolean;
  stepMm: number | null;
  isFine: boolean;
  isAlt: boolean;
  snapEnabled: boolean;
  engaged: boolean;
  candidates: number;
}

export function GizmoHUD(_props: GizmoHUDProps) {
  // Stub: render nothing
  return null;
}
