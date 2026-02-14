/**
 * generateDoorPanels.ts - Door Panel Generation
 *
 * Generates CabinetPanel objects for cabinet doors based on
 * door configuration and cabinet dimensions.
 *
 * @version 1.0.0 - Initial door system implementation
 */

import type {
  CabinetDimensions,
  CabinetStructure,
  CabinetPanel,
  DoorConfig,
  DoorPanelConfig,
  PanelRole,
  PanelEdges,
} from '../../types/Cabinet';
import {
  calculateDoorDimensions,
  calculateHingeCount,
  calculateHingePositions,
  HINGE_CUP_SPECS,
} from './doorCalculations';

// ============================================
// TYPES
// ============================================

/**
 * Material properties needed for door panel generation.
 */
export interface DoorMaterialProps {
  /** Edge thickness */
  edgeThickness: number;
  /** Cabinet panel thickness (for inner dimension calc) */
  cabinetPanelThickness: number;
}

/**
 * Input for door panel generation.
 */
export interface GenerateDoorPanelsInput {
  /** Cabinet overall dimensions */
  dimensions: CabinetDimensions;
  /** Cabinet structure with door config */
  structure: CabinetStructure;
  /** Core material ID for door panels */
  coreId: string;
  /** Surface material ID for door panels */
  surfaceId: string;
  /** Edge material ID */
  edgeId: string;
  /** Material properties for calculations */
  materialProps: DoorMaterialProps;
}

/**
 * Result of door panel generation.
 */
export interface GenerateDoorPanelsResult {
  /** Generated panels */
  panels: CabinetPanel[];
  /** Number of doors */
  doorCount: number;
  /** Total panel count */
  panelCount: number;
}

// ============================================
// HELPERS
// ============================================

let idCounter = 0;

/**
 * Create a unique panel ID.
 */
function createPanelId(): string {
  return `door-panel-${Date.now()}-${++idCounter}`;
}

/**
 * Create default computed values for door panels.
 */
function createDefaultComputed(
  finishW: number,
  finishH: number,
  thickness: number
) {
  const area = (finishW * finishH) / 1000000; // m²
  return {
    realThickness: thickness,
    cutWidth: finishW,
    cutHeight: finishH,
    surfaceArea: area * 2,
    edgeLength: 0,
    cost: 0,
    co2: 0,
  };
}

/**
 * Create edge assignment for door panels.
 * Doors typically have edge banding on all 4 sides.
 */
function makeDoorEdges(edgeId: string | null): PanelEdges {
  return {
    top: edgeId,
    bottom: edgeId,
    left: edgeId,
    right: edgeId,
  };
}

/**
 * Get panel role based on door position.
 */
function getDoorPanelRole(
  doorCount: number,
  doorIndex: number,
  openingDirection: 'left' | 'right'
): PanelRole {
  if (doorCount === 1) {
    return 'DOOR';
  }
  // For double doors, left door is index 0, right is index 1
  return doorIndex === 0 ? 'DOOR_LEFT' : 'DOOR_RIGHT';
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Generate door panels for a cabinet.
 *
 * Creates 1 or 2 door panels based on configuration.
 * Panels are positioned at the front of the cabinet.
 *
 * @param input - Cabinet dimensions, structure, and materials
 * @returns Generated panels and metadata
 */
export function generateDoorPanels(
  input: GenerateDoorPanelsInput
): GenerateDoorPanelsResult {
  const {
    dimensions,
    structure,
    coreId,
    surfaceId,
    edgeId,
    materialProps,
  } = input;

  const doorConfig = structure.doorConfig;

  // Return empty if no door config or doors disabled
  if (!doorConfig || !doorConfig.hasDoors || doorConfig.doors.length === 0) {
    return { panels: [], doorCount: 0, panelCount: 0 };
  }

  const panels: CabinetPanel[] = [];
  const { width: W, height: H, depth: D, toeKickHeight: Leg } = dimensions;
  const { cabinetPanelThickness: T } = materialProps;

  // Calculate cabinet opening dimensions
  const openingWidth = W - (2 * T);
  const openingHeight = H - (2 * T);

  // Calculate door dimensions
  const doorDims = calculateDoorDimensions({
    openingWidth,
    openingHeight,
    doorCount: doorConfig.doorCount,
    overlayType: doorConfig.doors[0]?.overlayType ?? 'full',
    overlayAmount: doorConfig.overlayAmount,
    doorGap: doorConfig.doorGap,
    revealGap: doorConfig.revealGap,
    panelThickness: T,
  });

  // Position doors at front of cabinet
  // Z position: front face at D/2
  const doorZ = D / 2 + doorConfig.doorThickness / 2;

  // Y position: centered vertically
  const doorY = H / 2 + Leg;

  // Generate panels for each configured door
  for (let i = 0; i < Math.min(doorConfig.doors.length, doorConfig.doorCount); i++) {
    const doorPanelConfig = doorConfig.doors[i];

    // Determine X position based on door count
    let doorX: number;
    if (doorConfig.doorCount === 1) {
      doorX = doorDims.xPosition;
    } else {
      doorX = i === 0 ? doorDims.xPosition : (doorDims.xPositionRight ?? 0);
    }

    // Determine panel role
    const role = getDoorPanelRole(
      doorConfig.doorCount,
      i,
      doorPanelConfig.openingDirection
    );

    // Create door panel
    panels.push({
      id: createPanelId(),
      role,
      name: doorConfig.doorCount === 1
        ? 'Door'
        : (i === 0 ? 'Left Door' : 'Right Door'),
      finishWidth: doorDims.width,
      finishHeight: doorDims.height,
      coreMaterialId: coreId,
      faces: { faceA: surfaceId, faceB: surfaceId }, // Both faces visible
      edges: makeDoorEdges(edgeId),
      grainDirection: 'VERTICAL', // Doors typically have vertical grain
      computed: createDefaultComputed(
        doorDims.width,
        doorDims.height,
        doorConfig.doorThickness
      ),
      position: [doorX, doorY, doorZ],
      rotation: [0, 0, 0],
      visible: true,
      selected: false,
    });
  }

  return {
    panels,
    doorCount: doorConfig.doorCount,
    panelCount: panels.length,
  };
}

/**
 * Calculate hinge positions for a door panel.
 *
 * @param doorHeight - Door panel height in mm
 * @param config - Door panel configuration
 * @returns Array of Y positions for hinge cups
 */
export function calculateDoorHingePositions(
  doorHeight: number,
  config: DoorPanelConfig
): number[] {
  // Use custom positions if provided
  if (config.hingePositions && config.hingePositions.length >= 2) {
    return config.hingePositions;
  }

  // Calculate based on door height
  const hingeCount = config.hingeCount ?? calculateHingeCount(doorHeight);
  const positions = calculateHingePositions(doorHeight, hingeCount);

  return positions.map(p => p.y);
}

/**
 * Validate that door config fits within cabinet dimensions.
 */
export function validateDoorFit(
  cabinetHeight: number,
  cabinetWidth: number,
  doorConfig: DoorConfig
): { fits: boolean; message?: string } {
  if (!doorConfig.hasDoors) {
    return { fits: true };
  }

  // Check if door dimensions are reasonable
  const maxDoorHeight = cabinetHeight + (2 * doorConfig.overlayAmount);
  const maxDoorWidth = doorConfig.doorCount === 1
    ? cabinetWidth + (2 * doorConfig.overlayAmount)
    : (cabinetWidth + (2 * doorConfig.overlayAmount) - doorConfig.doorGap) / 2;

  if (maxDoorHeight < 200) {
    return { fits: false, message: 'Door height too small (min 200mm)' };
  }

  if (maxDoorWidth < 150) {
    return { fits: false, message: 'Door width too small (min 150mm)' };
  }

  if (maxDoorWidth > 800) {
    return { fits: false, message: 'Door width too large (max 800mm recommended)' };
  }

  return { fits: true };
}
