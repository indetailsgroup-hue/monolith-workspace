/**
 * materialTypes.ts - Material Classification Types for CNC Operations
 *
 * Defines material classes and context types for deterministic
 * feed/speed and drilling cycle selection.
 *
 * @version 1.0.0 - Phase D5-A
 */

// ============================================
// MATERIAL CLASSIFICATION
// ============================================

/**
 * Material classes for CNC parameter selection.
 *
 * Each class has different machining characteristics:
 * - MDF: Soft, consistent density, dust-prone
 * - MELAMINE: MDF/PB with melamine coating, chip-out risk
 * - PLYWOOD: Layered, varying grain direction
 * - HPL: High-pressure laminate, hard surface
 * - HMR: Moisture-resistant MDF, denser than standard
 * - UNKNOWN: Fallback for unrecognized materials (conservative params)
 */
export type MaterialClass =
  | 'MDF'
  | 'MELAMINE'
  | 'PLYWOOD'
  | 'HPL'
  | 'HMR'
  | 'UNKNOWN';

/**
 * Material hint for policy lookup.
 * Minimal interface for cycle/feed selection.
 */
export interface MaterialHint {
  readonly class: MaterialClass;
}

/**
 * Panel material context linking panel to material classification.
 * Used to resolve material class from packet data.
 */
export interface PanelMaterialContext {
  /** Panel identifier */
  readonly panelId: string;
  /** Material ID from spec (optional) */
  readonly materialId?: string;
  /** Human-readable material name (optional) */
  readonly materialName?: string;
  /** Resolved material class */
  readonly materialClass: MaterialClass;
}

// ============================================
// MATERIAL PROPERTIES
// ============================================

/**
 * Material machinability properties.
 * Used internally by policies for parameter calculation.
 */
export interface MaterialMachinability {
  /** Relative hardness (1-10, 10 = hardest) */
  readonly hardness: number;
  /** Chip clearance difficulty (1-10, 10 = most difficult) */
  readonly chipClearance: number;
  /** Surface finish sensitivity (1-10, 10 = most sensitive) */
  readonly finishSensitivity: number;
  /** Recommended base feed multiplier (0.5-1.5) */
  readonly feedMultiplier: number;
  /** Recommended base RPM multiplier (0.5-1.5) */
  readonly rpmMultiplier: number;
}

/**
 * Default machinability properties by material class.
 * Conservative values optimized for production reliability.
 */
export const MATERIAL_MACHINABILITY: Record<MaterialClass, MaterialMachinability> = {
  MDF: {
    hardness: 3,
    chipClearance: 4,
    finishSensitivity: 2,
    feedMultiplier: 1.0,
    rpmMultiplier: 1.0,
  },
  MELAMINE: {
    hardness: 5,
    chipClearance: 5,
    finishSensitivity: 8, // High - chip-out risk
    feedMultiplier: 0.9,
    rpmMultiplier: 1.1,
  },
  PLYWOOD: {
    hardness: 4,
    chipClearance: 6,
    finishSensitivity: 5,
    feedMultiplier: 0.85,
    rpmMultiplier: 1.0,
  },
  HPL: {
    hardness: 8,
    chipClearance: 7,
    finishSensitivity: 9, // High - delamination risk
    feedMultiplier: 0.7,
    rpmMultiplier: 1.2,
  },
  HMR: {
    hardness: 4,
    chipClearance: 5,
    finishSensitivity: 3,
    feedMultiplier: 0.95,
    rpmMultiplier: 1.0,
  },
  UNKNOWN: {
    hardness: 5,
    chipClearance: 5,
    finishSensitivity: 5,
    feedMultiplier: 0.7, // Conservative fallback
    rpmMultiplier: 0.9,
  },
};

// ============================================
// HELPERS
// ============================================

/**
 * Check if a material class is known (not UNKNOWN).
 */
export function isKnownMaterial(materialClass: MaterialClass): boolean {
  return materialClass !== 'UNKNOWN';
}

/**
 * Get machinability properties for a material class.
 */
export function getMachinability(materialClass: MaterialClass): MaterialMachinability {
  return MATERIAL_MACHINABILITY[materialClass];
}
