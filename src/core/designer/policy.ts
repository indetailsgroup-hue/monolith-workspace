/**
 * Designer Policy - Default Values and Limits
 *
 * Central configuration for designer validation rules.
 * These values define manufacturing constraints and best practices.
 *
 * v1.0: Initial policy definitions
 */

import type {
  DesignerIntent,
  ShelfIntent,
  DoorIntent,
  DrawerIntent,
  DrawerRowIntent,
  ConnectorIntent,
  MaterialPreferences,
} from './types';

// ============================================
// DIMENSION LIMITS
// ============================================

export const DIMENSION_LIMITS = {
  /** Minimum cabinet width (mm) */
  minWidth: 200,
  /** Maximum cabinet width (mm) */
  maxWidth: 2400,
  /** Minimum cabinet height (mm) */
  minHeight: 200,
  /** Maximum cabinet height (mm) */
  maxHeight: 2400,
  /** Minimum cabinet depth (mm) */
  minDepth: 200,
  /** Maximum cabinet depth (mm) */
  maxDepth: 800,
  /** Maximum toe kick height (mm) */
  maxToeKickHeight: 200,
} as const;

// ============================================
// MATERIAL LIMITS
// ============================================

export const MATERIAL_LIMITS = {
  /** Default carcass thickness (mm) */
  defaultCarcassThickness: 18,
  /** Minimum carcass thickness (mm) */
  minCarcassThickness: 12,
  /** Maximum carcass thickness (mm) */
  maxCarcassThickness: 25,
  /** Default back panel thickness (mm) */
  defaultBackThickness: 6,
  /** Minimum back panel thickness (mm) */
  minBackThickness: 3,
  /** Maximum back panel thickness (mm) */
  maxBackThickness: 18,
} as const;

// ============================================
// SHELF LIMITS
// ============================================

export const SHELF_LIMITS = {
  /** Minimum shelf thickness (mm) */
  minThickness: 14,
  /** Maximum shelf thickness (mm) */
  maxThickness: 25,
  /** Minimum adjustable shelf thickness (mm) */
  minAdjustableThickness: 14,
  /** Maximum shelf span by material (mm) */
  maxSpanByMaterial: {
    particleboard: 800,
    mdf: 700,
    plywood: 1000,
    solidwood: 1200,
  } as Record<string, number>,
  /** Default max span if material not specified (mm) */
  defaultMaxSpan: 800,
  /** Minimum depth ratio */
  minDepthRatio: 0.5,
  /** Maximum depth ratio */
  maxDepthRatio: 1.0,
} as const;

// ============================================
// DOOR LIMITS
// ============================================

export const DOOR_LIMITS = {
  /** Maximum single door width (mm) */
  maxWidth: 600,
  /** Maximum door height (mm) */
  maxHeight: 2400,
  /** Minimum door width (mm) */
  minWidth: 200,
  /** Minimum door height (mm) */
  minHeight: 200,
  /** Hinge count by door height [maxHeight, hingeCount][] */
  hingeCountByHeight: [
    [800, 2],
    [1600, 3],
    [2000, 4],
    [2400, 5],
  ] as [number, number][],
  /** Minimum hinge count */
  minHingeCount: 2,
  /** Maximum hinge count */
  maxHingeCount: 5,
} as const;

// ============================================
// DRAWER LIMITS
// ============================================

export const DRAWER_LIMITS = {
  /** Minimum front height (mm) */
  minFrontHeight: 80,
  /** Maximum front height (mm) */
  maxFrontHeight: 300,
  /** Minimum gap above drawer (mm) */
  minGapAbove: 3,
  /** Maximum gap above drawer (mm) */
  maxGapAbove: 20,
  /** Maximum number of drawer rows */
  maxRows: 8,
  /** Minimum box height (mm) */
  minBoxHeight: 68,
} as const;

// ============================================
// CONNECTOR LIMITS
// ============================================

export const CONNECTOR_LIMITS = {
  /** Minimum panel thickness for Minifix (mm) */
  minifixMinThickness: 16,
  /** Minimum panel thickness for Confirmat (mm) */
  confirmatMinThickness: 15,
  /** Minimum panel thickness for Dowel (mm) */
  dowelMinThickness: 12,
  /** Minimum panel thickness for Domino (mm) */
  dominoMinThickness: 15,
} as const;

// ============================================
// SYSTEM 32 CONSTANTS
// ============================================

export const SYSTEM_32 = {
  /** Vertical hole spacing (mm) */
  pitch: 32,
  /** First hole from front edge (mm) */
  firstHoleZ: 37,
  /** Standard hole diameter (mm) */
  holeDiameter: 5,
  /** Standard hole depth (mm) */
  holeDepth: 13,
} as const;

// ============================================
// ASSEMBLY TIMING
// ============================================

export const ASSEMBLY_TIMING = {
  /** Base setup time (minutes) */
  baseTimeMinutes: 5,
  /** Average time per assembly step (minutes) */
  perStepTimeMinutes: 2,
  /** Time for inserting hardware (minutes per piece) */
  hardwareInsertTime: 0.5,
  /** Time for clamping (minutes) */
  clampTimeMinutes: 3,
} as const;

// ============================================
// COMBINED POLICY OBJECT
// ============================================

/**
 * Complete Designer Policy configuration.
 */
export const DESIGNER_POLICY = {
  dimensions: DIMENSION_LIMITS,
  materials: MATERIAL_LIMITS,
  shelves: SHELF_LIMITS,
  doors: DOOR_LIMITS,
  drawers: DRAWER_LIMITS,
  connectors: CONNECTOR_LIMITS,
  system32: SYSTEM_32,
  assembly: ASSEMBLY_TIMING,
} as const;

export type DesignerPolicy = typeof DESIGNER_POLICY;

// ============================================
// DEFAULT INTENT HELPERS
// ============================================

/**
 * Default shelf intent.
 */
export const DEFAULT_SHELF_INTENT: Omit<ShelfIntent, 'id' | 'positionY'> = {
  type: 'adjustable',
  thickness: 18,
  depthRatio: 1.0,
  loadCapacity: 'medium',
};

/**
 * Default door intent.
 */
export const DEFAULT_DOOR_INTENT: DoorIntent = {
  enabled: false,
  count: 1,
  openingType: 'swing',
  hingeType: 'cup',
  overlayType: 'full',
  style: 'slab',
  handleConfig: {
    type: 'pull',
    height: 1000,
    offset: 40,
  },
};

/**
 * Default drawer row intent.
 */
export const DEFAULT_DRAWER_ROW_INTENT: DrawerRowIntent = {
  frontHeight: 140,
  gapAbove: 3,
  loadCapacity: 'medium',
};

/**
 * Default drawer intent.
 */
export const DEFAULT_DRAWER_INTENT: DrawerIntent = {
  enabled: false,
  rows: [],
  slideType: 'undermount',
  handleConfig: {
    type: 'pull',
    position: 'center',
  },
};

/**
 * Default connector intent.
 */
export const DEFAULT_CONNECTOR_INTENT: ConnectorIntent = {
  primaryJoint: 'minifix',
  reinforcement: 'none',
  backPanelAttachment: 'groove',
};

/**
 * Default material preferences.
 */
export const DEFAULT_MATERIAL_PREFERENCES: MaterialPreferences = {
  carcassMaterial: 'core-hmr-18',
  carcassThickness: 18,
  backMaterial: 'core-mdf-6',
  backThickness: 6,
  edgeBanding: 'pvc',
};

/**
 * Create a default DesignerIntent for a base cabinet.
 */
export function createDefaultIntent(): DesignerIntent {
  return {
    intentVersion: '1.0',
    cabinetType: 'BASE',
    jointType: 'INSET',
    dimensions: {
      width: 600,
      height: 720,
      depth: 560,
      toeKickHeight: 100,
    },
    backPanel: {
      enabled: true,
      construction: 'inset',
      thickness: 6,
    },
    shelves: [],
    dividers: [],
    doors: DEFAULT_DOOR_INTENT,
    drawers: DEFAULT_DRAWER_INTENT,
    connectors: DEFAULT_CONNECTOR_INTENT,
    materials: DEFAULT_MATERIAL_PREFERENCES,
  };
}

// ============================================
// POLICY HELPER FUNCTIONS
// ============================================

/**
 * Get required hinge count for door height.
 */
export function getRequiredHingeCount(doorHeight: number): number {
  for (const [maxHeight, count] of DOOR_LIMITS.hingeCountByHeight) {
    if (doorHeight <= maxHeight) {
      return count;
    }
  }
  return DOOR_LIMITS.maxHingeCount;
}

/**
 * Get max shelf span for material type.
 */
export function getMaxShelfSpan(materialType?: string): number {
  if (!materialType) {
    return SHELF_LIMITS.defaultMaxSpan;
  }
  return SHELF_LIMITS.maxSpanByMaterial[materialType] ?? SHELF_LIMITS.defaultMaxSpan;
}

/**
 * Get minimum panel thickness for connector type.
 */
export function getMinThicknessForConnector(
  connectorType: 'minifix' | 'dowel' | 'confirmat' | 'domino'
): number {
  switch (connectorType) {
    case 'minifix':
      return CONNECTOR_LIMITS.minifixMinThickness;
    case 'confirmat':
      return CONNECTOR_LIMITS.confirmatMinThickness;
    case 'dowel':
      return CONNECTOR_LIMITS.dowelMinThickness;
    case 'domino':
      return CONNECTOR_LIMITS.dominoMinThickness;
    default:
      return MATERIAL_LIMITS.minCarcassThickness;
  }
}

/**
 * Check if position aligns with System 32 grid.
 * Returns true if within 2mm tolerance.
 */
export function isAlignedToSystem32(positionY: number, tolerance = 2): boolean {
  const { pitch, firstHoleZ } = SYSTEM_32;
  const nearestHole = Math.round((positionY - firstHoleZ) / pitch) * pitch + firstHoleZ;
  return Math.abs(positionY - nearestHole) <= tolerance;
}

/**
 * Get nearest System 32 position.
 */
export function getNearestSystem32Position(positionY: number): number {
  const { pitch, firstHoleZ } = SYSTEM_32;
  return Math.round((positionY - firstHoleZ) / pitch) * pitch + firstHoleZ;
}
