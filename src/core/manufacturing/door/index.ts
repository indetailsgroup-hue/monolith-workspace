/**
 * index.ts - Door Manufacturing Module
 *
 * Provides door panel dimension calculations, panel generation,
 * and hinge placement utilities.
 *
 * @version 1.0.0 - Initial door system implementation
 */

// ============================================
// CALCULATION EXPORTS
// ============================================

export {
  // Functions
  calculateDoorDimensions,
  calculateHingeCount,
  calculateHingePositions,
  estimateDoorWeight,
  validateDoorHingeConfig,
  createDoorPanelId,

  // Constants
  HINGE_CUP_SPECS,
  HINGE_COUNT_BY_HEIGHT,

  // Types
  type DoorDimensions,
  type CalculateDoorDimensionsInput,
  type HingePosition,
} from './doorCalculations';

// ============================================
// PANEL GENERATION EXPORTS
// ============================================

export {
  generateDoorPanels,
  calculateDoorHingePositions,
  validateDoorFit,
  type DoorMaterialProps,
  type GenerateDoorPanelsInput,
  type GenerateDoorPanelsResult,
} from './generateDoorPanels';
