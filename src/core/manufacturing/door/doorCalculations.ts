/**
 * doorCalculations.ts - Door Dimension Calculations
 *
 * Calculates door panel dimensions from cabinet dimensions
 * and overlay/reveal settings.
 *
 * @version 1.0.0 - Initial door system implementation
 */

import type { DoorOverlayType } from '../../types/Cabinet';

// ============================================
// TYPES
// ============================================

/**
 * Calculated door panel dimensions (all in mm).
 */
export interface DoorDimensions {
  /** Door panel width */
  width: number;
  /** Door panel height */
  height: number;
  /** X position for single door or left door */
  xPosition: number;
  /** X position for right door (double doors only) */
  xPositionRight?: number;
}

/**
 * Input for door dimension calculation.
 */
export interface CalculateDoorDimensionsInput {
  /** Cabinet opening width (inner width) */
  openingWidth: number;
  /** Cabinet opening height (inner height) */
  openingHeight: number;
  /** Number of doors (1 or 2) */
  doorCount: 1 | 2;
  /** Overlay type */
  overlayType: DoorOverlayType;
  /** Overlay amount in mm (for full overlay) */
  overlayAmount: number;
  /** Gap between double doors (mm) */
  doorGap: number;
  /** Reveal gap around door perimeter (mm) */
  revealGap: number;
  /** Cabinet panel thickness (for inset calculation) */
  panelThickness: number;
}

/**
 * Hinge position result.
 */
export interface HingePosition {
  /** Y position from door bottom (mm) */
  y: number;
  /** Distance from door edge (mm) */
  edgeOffset: number;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Standard hinge cup specifications.
 */
export const HINGE_CUP_SPECS = {
  /** Standard European hinge cup diameter */
  DIAMETER: 35,
  /** Standard cup depth */
  DEPTH: 13,
  /** Standard distance from door edge to cup center */
  EDGE_OFFSET: 21.5, // K value for 35mm cup
  /** Minimum distance from door top/bottom to first hinge */
  MIN_EDGE_DISTANCE: 80,
  /** Default distance from door edge */
  DEFAULT_EDGE_DISTANCE: 100,
};

/**
 * Hinge count recommendations by door height.
 */
export const HINGE_COUNT_BY_HEIGHT = [
  { maxHeight: 800, count: 2 },
  { maxHeight: 1200, count: 3 },
  { maxHeight: 1600, count: 4 },
  { maxHeight: 2000, count: 5 },
  { maxHeight: Infinity, count: 6 },
];

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Calculate door panel dimensions based on cabinet opening and overlay settings.
 *
 * @param input - Cabinet dimensions and door configuration
 * @returns Calculated door dimensions
 */
export function calculateDoorDimensions(
  input: CalculateDoorDimensionsInput
): DoorDimensions {
  const {
    openingWidth,
    openingHeight,
    doorCount,
    overlayType,
    overlayAmount,
    doorGap,
    revealGap,
    panelThickness,
  } = input;

  let doorWidth: number;
  let doorHeight: number;

  // Calculate door height based on overlay type
  switch (overlayType) {
    case 'full':
      // Door overlaps opening on all sides
      doorHeight = openingHeight + (2 * overlayAmount) - (2 * revealGap);
      break;
    case 'half':
      // Door overlaps by half the overlay amount
      doorHeight = openingHeight + overlayAmount - (2 * revealGap);
      break;
    case 'inset':
      // Door sits inside the opening
      doorHeight = openingHeight - (2 * revealGap);
      break;
    default:
      doorHeight = openingHeight + (2 * overlayAmount) - (2 * revealGap);
  }

  // Calculate door width based on door count and overlay type
  if (doorCount === 1) {
    // Single door
    switch (overlayType) {
      case 'full':
        doorWidth = openingWidth + (2 * overlayAmount) - (2 * revealGap);
        break;
      case 'half':
        doorWidth = openingWidth + overlayAmount - (2 * revealGap);
        break;
      case 'inset':
        doorWidth = openingWidth - (2 * revealGap);
        break;
      default:
        doorWidth = openingWidth + (2 * overlayAmount) - (2 * revealGap);
    }

    return {
      width: doorWidth,
      height: doorHeight,
      xPosition: 0, // Centered for single door
    };
  } else {
    // Double doors
    const totalGaps = doorGap + (2 * revealGap);

    switch (overlayType) {
      case 'full':
        // Each door gets half the opening width plus overlay minus gaps
        doorWidth = (openingWidth + (2 * overlayAmount) - totalGaps) / 2;
        break;
      case 'half':
        doorWidth = (openingWidth + overlayAmount - totalGaps) / 2;
        break;
      case 'inset':
        doorWidth = (openingWidth - totalGaps) / 2;
        break;
      default:
        doorWidth = (openingWidth + (2 * overlayAmount) - totalGaps) / 2;
    }

    // Calculate X positions for left and right doors
    const xOffset = (doorWidth + doorGap) / 2;

    return {
      width: doorWidth,
      height: doorHeight,
      xPosition: -xOffset,      // Left door
      xPositionRight: xOffset,  // Right door
    };
  }
}

/**
 * Calculate recommended number of hinges based on door height.
 *
 * @param doorHeight - Door height in mm
 * @param doorWeight - Optional door weight in kg (affects count)
 * @returns Recommended number of hinges
 */
export function calculateHingeCount(
  doorHeight: number,
  doorWeight?: number
): number {
  // Find base count from height table
  const entry = HINGE_COUNT_BY_HEIGHT.find(e => doorHeight <= e.maxHeight);
  let count = entry?.count ?? 2;

  // Add extra hinge for heavy doors (>25kg per hinge)
  if (doorWeight && doorWeight > count * 25) {
    count++;
  }

  return Math.max(2, Math.min(6, count));
}

/**
 * Calculate hinge positions along door height.
 * Distributes hinges evenly between top and bottom margins.
 *
 * @param doorHeight - Door height in mm
 * @param hingeCount - Number of hinges
 * @param topMargin - Distance from top edge to first hinge (default 100mm)
 * @param bottomMargin - Distance from bottom edge to last hinge (default 100mm)
 * @returns Array of hinge positions
 */
export function calculateHingePositions(
  doorHeight: number,
  hingeCount: number,
  topMargin: number = HINGE_CUP_SPECS.DEFAULT_EDGE_DISTANCE,
  bottomMargin: number = HINGE_CUP_SPECS.DEFAULT_EDGE_DISTANCE
): HingePosition[] {
  if (hingeCount < 2) {
    throw new Error('Minimum 2 hinges required');
  }

  const positions: HingePosition[] = [];

  // Calculate Y positions
  const availableHeight = doorHeight - topMargin - bottomMargin;
  const spacing = availableHeight / (hingeCount - 1);

  for (let i = 0; i < hingeCount; i++) {
    positions.push({
      y: bottomMargin + (i * spacing),
      edgeOffset: HINGE_CUP_SPECS.EDGE_OFFSET,
    });
  }

  return positions;
}

/**
 * Calculate door weight estimate based on dimensions and material.
 *
 * @param width - Door width in mm
 * @param height - Door height in mm
 * @param thickness - Door thickness in mm
 * @param density - Material density in kg/m³ (default: 650 for MDF)
 * @returns Estimated weight in kg
 */
export function estimateDoorWeight(
  width: number,
  height: number,
  thickness: number,
  density: number = 650
): number {
  // Convert mm³ to m³ and multiply by density
  const volumeM3 = (width * height * thickness) / 1_000_000_000;
  return volumeM3 * density;
}

/**
 * Validate door configuration against hinge specifications.
 *
 * @param doorWidth - Door width in mm
 * @param doorHeight - Door height in mm
 * @param doorWeight - Door weight in kg
 * @param hingeCapacity - Maximum weight per hinge in kg
 * @param hingeCount - Number of hinges
 * @returns Validation result
 */
export function validateDoorHingeConfig(
  doorWidth: number,
  doorHeight: number,
  doorWeight: number,
  hingeCapacity: number,
  hingeCount: number
): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check weight capacity
  const totalCapacity = hingeCount * hingeCapacity;
  if (doorWeight > totalCapacity) {
    warnings.push(
      `Door weight (${doorWeight.toFixed(1)}kg) exceeds hinge capacity (${totalCapacity}kg)`
    );
  }

  // Check minimum hinge count for height
  const recommendedCount = calculateHingeCount(doorHeight, doorWeight);
  if (hingeCount < recommendedCount) {
    warnings.push(
      `Recommended ${recommendedCount} hinges for ${doorHeight}mm height`
    );
  }

  // Check door width limits (typical max ~600mm per hinge side)
  if (doorWidth > 600) {
    warnings.push('Wide doors may require specialized hinges');
  }

  return {
    isValid: warnings.length === 0,
    warnings,
  };
}

/**
 * Create a unique door panel ID.
 */
export function createDoorPanelId(): string {
  return `door-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}
