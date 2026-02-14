/**
 * Resolve Minifix Placement
 *
 * Determines optimal placement positions for Minifix connectors
 * based on cabinet geometry and construction type.
 */

import type { Vec3Tuple } from '../drillMap/types';

export type Vec3 = Vec3Tuple;

export interface PanelBounds {
  min: Vec3Tuple;
  max: Vec3Tuple;
  center: Vec3Tuple;
  dimensions: Vec3Tuple;
  width?: number;
  height?: number;
  thickness?: number;
}

export interface PanelOrientation {
  isHorizontal: boolean;
  isVertical: boolean;
  up: Vec3Tuple;
  right: Vec3Tuple;
  forward: Vec3Tuple;
}

export interface MinifixTopologyApi {
  getPanelBounds: (panelId: string) => PanelBounds | null;
  getPanelOrientation: (panelId: string) => PanelOrientation | null;
  getPanelThickness?: (panelId: string) => number;
  getAdjacentPanels?: (panelId: string) => string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface MinifixPlacement {
  position: Vec3Tuple;
  normal: Vec3Tuple;
  corner: string;
  panelRole: string;
}

export function resolveMinifixPlacement(
  _cabinetWidth: number,
  _cabinetHeight: number,
  _cabinetDepth: number
): MinifixPlacement[] {
  return [];
}
