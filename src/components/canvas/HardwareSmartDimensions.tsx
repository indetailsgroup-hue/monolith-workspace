/**
 * Hardware Smart Dimensions (Stub)
 *
 * Smart dimension lines for hardware placement visualization.
 */

import type { DrillMapPoint } from '../../core/manufacturing/drillMap/types';

interface HardwareSmartDimensionsProps {
  boltPoints?: DrillMapPoint[];
  camPoints?: DrillMapPoint[];
  cabinetWidth?: number;
  cabinetHeight?: number;
  cabinetDepth?: number;
  topJoint?: string;
  bottomJoint?: string;
  visible?: boolean;
  currentView?: string;
  distanceB?: number;
  boltRotations?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export function HardwareSmartDimensions(_props: HardwareSmartDimensionsProps) {
  return null;
}
