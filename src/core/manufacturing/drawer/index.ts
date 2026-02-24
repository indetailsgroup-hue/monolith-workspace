/**
 * index.ts - Drawer Manufacturing Module
 *
 * Provides drawer box dimension calculations, panel generation,
 * and drill map generation for drawer slide mounting.
 *
 * @version 1.0.0 - Initial drawer system implementation
 */

// ============================================
// CALCULATION EXPORTS
// ============================================

export {
  // Functions
  calculateDrawerDimensions,
  getDrawerClearances,
  calculateDrawerStackHeight,
  validateDrawerStackFit,
  createDrawerRowId,

  // Constants
  DRAWER_BOTTOM_GROOVE_DEPTH,
  BACK_HEIGHT_REDUCTION,
  REAR_CLEARANCE,
  DEFAULT_FRONT_OVERLAY,
  DRAWER_REVEAL,

  // Types
  type DrawerBoxDimensions,
  type DrawerClearances,
  type CalculateDrawerDimensionsInput,
} from './drawerCalculations';

// ============================================
// PANEL GENERATION EXPORTS
// ============================================

export {
  generateDrawerPanels,
  calculateDrawerStackRequiredHeight,
  validateDrawerFit,
  type DrawerMaterialProps,
  type GenerateDrawerPanelsInput,
  type GenerateDrawerPanelsResult,
} from './generateDrawerPanels';

// ============================================
// DRILL MAP EXPORTS (Phase 7)
// ============================================

export {
  generateDrawerSlideHoles,
  panelNeedsDrawerHoles,
  SLIDE_HOLE_SPECS,
  SLIDE_MOUNTING_Z_POSITIONS,
  type DrawerSlideHole,
  type DrawerSlideHoleParams,
} from './generateDrawerDrillMap';
