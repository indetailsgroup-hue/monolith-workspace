/**
 * CAD Drill Indicators (Stub)
 *
 * Engineering-style drill point indicators with dimensions.
 */

import type { DrillMap } from '../../core/manufacturing/drillMap/types';

interface CADDrillIndicatorsProps {
  drillMap?: DrillMap | null;
  visible?: boolean;
  showDiameter?: boolean;
  showDepth?: boolean;
  showCrosshairs?: boolean;
  lineWidth?: number;
  [key: string]: unknown;
}

export function CADDrillIndicators(_props: CADDrillIndicatorsProps) {
  return null;
}
