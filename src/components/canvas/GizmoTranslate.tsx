/**
 * Gizmo Translate (Stub)
 *
 * 3-axis translation gizmo for precise cabinet movement.
 */

import type { Vec3 } from '../../core/types/SnapTypes';

interface GizmoTranslateProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  onDragStart?: () => void;
  onDrag?: (pos: Vec3) => void;
  onDragEnd?: (finalPos: Vec3, delta: Vec3) => void;
  enabled?: boolean;
  [key: string]: unknown;
}

export function GizmoTranslate(_props: GizmoTranslateProps) {
  return null;
}
