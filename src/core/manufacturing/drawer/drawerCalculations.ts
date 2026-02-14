/**
 * drawerCalculations.ts - Drawer Dimension Calculations
 *
 * Calculates drawer box dimensions from cabinet interior dimensions
 * and slide system clearances.
 *
 * @version 1.0.0 - Initial drawer system implementation
 */

import { DRAWER_SLIDE } from '../../types/Production';
import type { DrawerSlideType, DrawerBoxMaterials } from '../../types/Cabinet';

// ============================================
// TYPES
// ============================================

/**
 * Calculated drawer box dimensions (all in mm).
 */
export interface DrawerBoxDimensions {
  /** Internal box width (after slide clearance deduction) */
  boxWidth: number;
  /** Internal box depth (drawer travel direction) */
  boxDepth: number;
  /** Side panel height */
  sideHeight: number;
  /** Back panel height (typically reduced from side for slide clearance) */
  backHeight: number;
  /** Bottom panel width (fits in grooves) */
  bottomWidth: number;
  /** Bottom panel depth (fits in grooves) */
  bottomDepth: number;
  /** Front panel width (with overlay) */
  frontWidth: number;
  /** Front panel height (visible face) */
  frontHeight: number;
}

/**
 * Clearance values for drawer construction.
 */
export interface DrawerClearances {
  /** Gap per side for slide rails (mm) */
  sideGap: number;
  /** Total side clearance (both sides) */
  totalSideGap: number;
  /** Gap above drawer box (mm) */
  topGap: number;
  /** Gap below drawer front (reveal) */
  bottomReveal: number;
  /** Front overlay beyond cabinet opening (mm) */
  frontOverlay: number;
  /** Minimum slide offset from bottom (mm) */
  slideOffsetY: number;
}

/**
 * Input for drawer dimension calculation.
 */
export interface CalculateDrawerDimensionsInput {
  /** Cabinet internal width (W - 2T) in mm */
  cabinetInnerWidth: number;
  /** Cabinet internal depth in mm */
  cabinetInnerDepth: number;
  /** Drawer front height (visible face) in mm */
  frontHeight: number;
  /** Slide mounting type */
  slideType: DrawerSlideType;
  /** Box construction materials */
  boxMaterials: DrawerBoxMaterials;
  /** Front overlay (mm), defaults to 18 */
  frontOverlay?: number;
  /** Max slide length available (mm), defaults to 500 */
  maxSlideLength?: number;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Standard groove depth for drawer bottom panel (mm).
 */
export const DRAWER_BOTTOM_GROOVE_DEPTH = 6;

/**
 * Back height reduction from side height (mm).
 * Allows clearance for slide mechanism.
 */
export const BACK_HEIGHT_REDUCTION = 12.5;

/**
 * Minimum clearance behind drawer for slide mechanism (mm).
 */
export const REAR_CLEARANCE = 18;

/**
 * Default front overlay beyond cabinet opening (mm).
 */
export const DEFAULT_FRONT_OVERLAY = 18;

/**
 * Standard drawer reveal/gap below front panel (mm).
 */
export const DRAWER_REVEAL = 3;

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Get clearance values for a slide type.
 *
 * @param slideType - 'undermount' or 'side_mount'
 * @returns Clearance values for drawer construction
 */
export function getDrawerClearances(slideType: DrawerSlideType): DrawerClearances {
  const isUndermount = slideType === 'undermount';
  const sideGap = isUndermount
    ? DRAWER_SLIDE.UNDERMOUNT.SIDE_GAP
    : DRAWER_SLIDE.SIDE_MOUNT.SIDE_GAP;

  return {
    sideGap,
    totalSideGap: sideGap * 2,
    topGap: 3,
    bottomReveal: DRAWER_REVEAL,
    frontOverlay: DEFAULT_FRONT_OVERLAY,
    slideOffsetY: isUndermount ? DRAWER_SLIDE.UNDERMOUNT.SLIDE_OFFSET_Y : 15,
  };
}

/**
 * Calculate drawer box dimensions from cabinet interior.
 *
 * Key formulas:
 * - Box width = cabinet inner width - (2 × side gap)
 * - Box depth = min(cabinet depth - rear clearance, max slide length)
 * - Front width = cabinet inner width + (2 × front overlay)
 *
 * @param input - Cabinet dimensions, front height, slide type, materials
 * @returns Calculated drawer box dimensions
 */
export function calculateDrawerDimensions(
  input: CalculateDrawerDimensionsInput
): DrawerBoxDimensions {
  const {
    cabinetInnerWidth,
    cabinetInnerDepth,
    frontHeight,
    slideType,
    boxMaterials,
    frontOverlay = DEFAULT_FRONT_OVERLAY,
    maxSlideLength = 500,
  } = input;

  const clearances = getDrawerClearances(slideType);

  // Box width = cabinet inner width - total slide clearance
  const boxWidth = cabinetInnerWidth - clearances.totalSideGap;

  // Box depth = limited by slide length and rear clearance
  const availableDepth = cabinetInnerDepth - REAR_CLEARANCE;
  const boxDepth = Math.min(availableDepth, maxSlideLength);

  // Side height = front height minus gaps
  // Typically: front overlaps by ~10mm top/bottom, box is inside
  const sideHeight = Math.max(
    60,  // Minimum side height
    frontHeight - 20  // 10mm overlap top + bottom
  );

  // Back height = side height - reduction for slide mechanism
  const backHeight = sideHeight - BACK_HEIGHT_REDUCTION;

  // Bottom dimensions: fits in grooves on sides, front (inner), and back
  const sideT = boxMaterials.sideThickness;
  const grooveDepth = DRAWER_BOTTOM_GROOVE_DEPTH;

  // Bottom width = box width - 2×side thickness + 2×groove depth - clearance
  const bottomWidth = boxWidth - (2 * sideT) + (2 * grooveDepth) - 2;

  // Bottom depth = box depth - front inner thickness - back thickness + 2×groove depth - clearance
  // Note: Front inner panel is separate from visible front
  const bottomDepth = boxDepth - sideT + (2 * grooveDepth) - 2;

  // Front panel (visible): extends beyond cabinet opening
  const frontWidth = cabinetInnerWidth + (2 * frontOverlay);

  return {
    boxWidth,
    boxDepth,
    sideHeight,
    backHeight,
    bottomWidth,
    bottomDepth,
    frontWidth,
    frontHeight,
  };
}

/**
 * Calculate the total height required for a stack of drawers.
 *
 * @param rows - Array of drawer row configs with frontHeight and gapAbove
 * @returns Total height in mm
 */
export function calculateDrawerStackHeight(
  rows: Array<{ frontHeight: number; gapAbove: number }>
): number {
  return rows.reduce((total, row) => total + row.frontHeight + row.gapAbove, 0);
}

/**
 * Validate that drawer stack fits within cabinet height.
 *
 * @param cabinetInnerHeight - Available height inside cabinet (mm)
 * @param rows - Drawer row configurations
 * @returns Object with isValid flag and any error message
 */
export function validateDrawerStackFit(
  cabinetInnerHeight: number,
  rows: Array<{ frontHeight: number; gapAbove: number }>
): { isValid: boolean; message?: string; totalHeight: number } {
  const totalHeight = calculateDrawerStackHeight(rows);

  if (totalHeight > cabinetInnerHeight) {
    return {
      isValid: false,
      message: `Drawer stack (${totalHeight}mm) exceeds cabinet height (${cabinetInnerHeight}mm)`,
      totalHeight,
    };
  }

  return { isValid: true, totalHeight };
}

/**
 * Generate a unique ID for a drawer row.
 */
export function createDrawerRowId(): string {
  return `drawer-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}
