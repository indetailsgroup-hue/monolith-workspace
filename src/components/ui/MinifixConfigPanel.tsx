/**
 * Minifix Config Panel (Stub)
 *
 * Configuration panel for Minifix hardware placement.
 */

import type { ReactElement } from 'react';

// ============================================
// TYPES
// ============================================

export interface MinifixFullConfig {
  // Type selector
  minifixType?: '12' | '15';

  // Cam housing (Häfele detailed naming)
  camDia?: number;
  camDepth?: number;
  camHeight?: number;
  camRimDia?: number;
  camRimHeight?: number;
  camOffset?: number;

  // Cam housing (simplified naming)
  camDiameter?: number;

  // Bolt components
  ballHeadDia?: number;
  ballHeadOffset?: number;
  neckShaftDia?: number;
  neckShaftLength?: number;
  neckShaftOffset?: number;
  sleeveDia?: number;
  sleeveLength?: number;
  sleeveOffset?: number;
  shaftDia?: number;
  shaftLength?: number;
  shaftOffset?: number;

  // Simplified bolt naming
  boltSleeveDiameter?: number;
  boltSleeveLength?: number;

  // Distances
  distanceB?: number;
  drillingDistanceB?: number;
  woodThickness?: number;

  // Shelf pins
  shelfPinDiameter?: number;
  shelfPinDepth?: number;

  // Dowel
  includeDowel: boolean;
  dowelDia?: number;
  dowelLength?: number;
  dowelOffset?: number;

  // Transform
  flipVertical?: boolean;
  flipHorizontal?: boolean;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  moveX?: number;
  moveY?: number;
  moveZ?: number;

  // Display
  showDimensions?: boolean;
}

/** CAM specs lookup by wood thickness (mm) */
export const CAM_SPECS_BY_WOOD_THICKNESS: Record<number, { camDepth: number; camHeight: number }> = {
  16: { camDepth: 12.5, camHeight: 8 },
  18: { camDepth: 13.5, camHeight: 9 },
  19: { camDepth: 14.0, camHeight: 9.5 },
};

/** Preset for saved hardware configurations */
export interface MinifixConfigPreset {
  id: string;
  name: string;
  nameTh: string;
  description: string;
  woodThickness: number;
  config: MinifixFullConfig;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// DEFAULTS
// ============================================

export const DEFAULT_MINIFIX_CONFIG: MinifixFullConfig = {
  camDiameter: 15,
  camDepth: 12.5,
  boltSleeveDiameter: 10,
  boltSleeveLength: 17.5,
  sleeveLength: 14.25,
  distanceB: 24,
  drillingDistanceB: 24,
  shelfPinDiameter: 5,
  shelfPinDepth: 12,
  includeDowel: false,
};

// ============================================
// COMPONENTS (STUBS)
// ============================================

interface Preview3DProps {
  config?: MinifixFullConfig;
  showCam?: boolean;
  showDowel?: boolean;
  xRayMode?: boolean;
  isAttached?: boolean;
  showDimensions?: boolean;
  onUpdateConfig?: () => void;
  [key: string]: unknown;
}

/** 3D preview of minifix hardware — stub returns null */
export function Preview3D(_props: Preview3DProps): ReactElement | null {
  return null;
}

/** Main config panel — stub returns null */
export function MinifixConfigPanel(_props: Record<string, unknown>): ReactElement | null {
  return null;
}
