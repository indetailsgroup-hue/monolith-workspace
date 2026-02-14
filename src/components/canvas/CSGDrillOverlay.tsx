/**
 * CSG Drill Overlay (Stub)
 *
 * 3D CSG-based drill hole visualization on cabinet panels.
 */

import type { DrillMap } from '../../core/manufacturing/drillMap/types';

interface CSGDrillOverlayProps {
  drillMap?: DrillMap | null;
  visible?: boolean;
  colorByPurpose?: boolean;
  opacity?: number;
  [key: string]: unknown;
}

export function CSGDrillOverlay(_props: CSGDrillOverlayProps) {
  return null;
}
