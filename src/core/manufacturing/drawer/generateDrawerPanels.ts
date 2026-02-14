/**
 * generateDrawerPanels.ts - Drawer Panel Generation
 *
 * Generates CabinetPanel objects for drawer boxes based on
 * drawer configuration and cabinet dimensions.
 *
 * @version 1.0.0 - Initial drawer system implementation
 */

import type {
  CabinetDimensions,
  CabinetStructure,
  CabinetPanel,
  DrawerRowConfig,
  PanelRole,
  PanelEdges,
} from '../../types/Cabinet';
import {
  calculateDrawerDimensions,
  getDrawerClearances,
  DRAWER_REVEAL,
} from './drawerCalculations';

// ============================================
// TYPES
// ============================================

/**
 * Material properties needed for drawer panel generation.
 */
export interface DrawerMaterialProps {
  /** Edge thickness for calculating cuts */
  edgeThickness: number;
  /** Cabinet side panel thickness (for internal dimension calc) */
  cabinetPanelThickness: number;
  /** Back obstruction (groove depth + back thickness) */
  backObstruction: number;
}

/**
 * Input for drawer panel generation.
 */
export interface GenerateDrawerPanelsInput {
  /** Cabinet overall dimensions */
  dimensions: CabinetDimensions;
  /** Cabinet structure with drawer config */
  structure: CabinetStructure;
  /** Core material ID for drawer front */
  frontCoreId: string;
  /** Surface material ID for drawer front */
  frontSurfaceId: string;
  /** Edge material ID */
  edgeId: string;
  /** Material properties for calculations */
  materialProps: DrawerMaterialProps;
}

/**
 * Result of drawer panel generation.
 */
export interface GenerateDrawerPanelsResult {
  /** Generated panels */
  panels: CabinetPanel[];
  /** Number of drawer rows processed */
  rowCount: number;
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
  return `drawer-panel-${Date.now()}-${++idCounter}`;
}

/**
 * Create default computed values for drawer panels.
 * Note: Full cost/CO2 calculations require material lookups
 * which should be done in the store layer.
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
    edgeLength: 0, // Will be calculated by store if needed
    cost: 0,       // Will be calculated by store
    co2: 0,        // Will be calculated by store
  };
}

/**
 * Create edge assignment for drawer panels.
 */
function makeDrawerEdges(
  edgeId: string | null,
  front = true,
  back = false,
  left = true,
  right = true
): PanelEdges {
  return {
    top: front ? edgeId : null,
    bottom: back ? edgeId : null,
    left: left ? edgeId : null,
    right: right ? edgeId : null,
  };
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Generate drawer box panels for a cabinet.
 *
 * Creates 5 panels per drawer row:
 * - 1x Front panel (visible face)
 * - 2x Side panels (left and right)
 * - 1x Back panel
 * - 1x Bottom panel
 *
 * @param input - Cabinet dimensions, structure, and materials
 * @returns Generated panels and metadata
 */
export function generateDrawerPanels(
  input: GenerateDrawerPanelsInput
): GenerateDrawerPanelsResult {
  const {
    dimensions,
    structure,
    frontCoreId,
    frontSurfaceId,
    edgeId,
    materialProps,
  } = input;

  const drawerConfig = structure.drawerConfig;

  // Return empty if no drawer config or drawers disabled
  if (!drawerConfig || !drawerConfig.hasDrawers || drawerConfig.rows.length === 0) {
    return { panels: [], rowCount: 0, panelCount: 0 };
  }

  const panels: CabinetPanel[] = [];
  const { width: W, height: H, depth: D, toeKickHeight: Leg } = dimensions;
  const { edgeThickness: ET, cabinetPanelThickness: T, backObstruction } = materialProps;

  // Cabinet internal dimensions
  const cabinetInnerWidth = W - (2 * T);
  const cabinetInnerDepth = D - backObstruction;

  // Get clearances for slide type
  const clearances = getDrawerClearances(drawerConfig.slideType);

  // Track Y position for stacking drawers from bottom
  // Start from bottom of cabinet interior (above bottom panel + reveal gap)
  let currentY = Leg + T + DRAWER_REVEAL;

  // Generate panels for each drawer row
  for (let rowIndex = 0; rowIndex < drawerConfig.rows.length; rowIndex++) {
    const row = drawerConfig.rows[rowIndex];

    // Calculate drawer dimensions
    const drawerDims = calculateDrawerDimensions({
      cabinetInnerWidth,
      cabinetInnerDepth,
      frontHeight: row.frontHeight,
      slideType: drawerConfig.slideType,
      boxMaterials: drawerConfig.boxMaterials,
      frontOverlay: drawerConfig.frontOverlay,
    });

    // Material thicknesses for drawer box
    const sideCore = drawerConfig.boxMaterials.sideCore;
    const bottomCore = drawerConfig.boxMaterials.bottomCore;
    const sideT = drawerConfig.boxMaterials.sideThickness;
    const bottomT = drawerConfig.boxMaterials.bottomThickness;

    // Panel positions (center-based)
    // X: 0 = center of cabinet
    // Y: stacked from bottom
    // Z: drawer front flush with cabinet front

    const frontZ = D / 2 - (drawerConfig.frontOverlay ?? 18);
    const boxCenterZ = frontZ - drawerDims.boxDepth / 2 - sideT;
    const drawerCenterY = currentY + drawerDims.sideHeight / 2;

    // ========== DRAWER FRONT (visible face) ==========
    panels.push({
      id: createPanelId(),
      role: 'DRAWER_FRONT' as PanelRole,
      name: `Drawer ${rowIndex + 1} Front`,
      finishWidth: drawerDims.frontWidth,
      finishHeight: row.frontHeight,
      coreMaterialId: frontCoreId,
      faces: { faceA: frontSurfaceId, faceB: null },
      edges: makeDrawerEdges(edgeId, true, true, true, true), // All edges visible
      grainDirection: 'HORIZONTAL',
      computed: createDefaultComputed(drawerDims.frontWidth, row.frontHeight, T),
      position: [0, drawerCenterY, D / 2 - T / 2],
      rotation: [0, 0, 0],
      visible: true,
      selected: false,
    });

    // ========== LEFT SIDE ==========
    panels.push({
      id: createPanelId(),
      role: 'DRAWER_SIDE' as PanelRole,
      name: `Drawer ${rowIndex + 1} Left Side`,
      finishWidth: drawerDims.boxDepth,
      finishHeight: drawerDims.sideHeight,
      coreMaterialId: sideCore,
      faces: { faceA: frontSurfaceId, faceB: null },
      edges: makeDrawerEdges(edgeId, true, false, true, true),
      grainDirection: 'HORIZONTAL',
      computed: createDefaultComputed(drawerDims.boxDepth, drawerDims.sideHeight, sideT),
      position: [
        -(drawerDims.boxWidth / 2) + sideT / 2,
        drawerCenterY,
        boxCenterZ,
      ],
      rotation: [0, Math.PI / 2, 0],
      visible: true,
      selected: false,
    });

    // ========== RIGHT SIDE ==========
    panels.push({
      id: createPanelId(),
      role: 'DRAWER_SIDE' as PanelRole,
      name: `Drawer ${rowIndex + 1} Right Side`,
      finishWidth: drawerDims.boxDepth,
      finishHeight: drawerDims.sideHeight,
      coreMaterialId: sideCore,
      faces: { faceA: frontSurfaceId, faceB: null },
      edges: makeDrawerEdges(edgeId, true, false, true, true),
      grainDirection: 'HORIZONTAL',
      computed: createDefaultComputed(drawerDims.boxDepth, drawerDims.sideHeight, sideT),
      position: [
        (drawerDims.boxWidth / 2) - sideT / 2,
        drawerCenterY,
        boxCenterZ,
      ],
      rotation: [0, Math.PI / 2, 0],
      visible: true,
      selected: false,
    });

    // ========== BACK ==========
    const backWidth = drawerDims.boxWidth - (2 * sideT); // Fits between sides
    panels.push({
      id: createPanelId(),
      role: 'DRAWER_BACK' as PanelRole,
      name: `Drawer ${rowIndex + 1} Back`,
      finishWidth: backWidth,
      finishHeight: drawerDims.backHeight,
      coreMaterialId: sideCore,
      faces: { faceA: null, faceB: null }, // Inner faces, no laminate
      edges: makeDrawerEdges(edgeId, true, false, false, false), // Only top edge
      grainDirection: 'HORIZONTAL',
      computed: createDefaultComputed(backWidth, drawerDims.backHeight, sideT),
      position: [
        0,
        currentY + drawerDims.backHeight / 2,
        boxCenterZ - drawerDims.boxDepth / 2 + sideT / 2,
      ],
      rotation: [0, 0, 0],
      visible: true,
      selected: false,
    });

    // ========== BOTTOM ==========
    panels.push({
      id: createPanelId(),
      role: 'DRAWER_BOTTOM' as PanelRole,
      name: `Drawer ${rowIndex + 1} Bottom`,
      finishWidth: drawerDims.bottomWidth,
      finishHeight: drawerDims.bottomDepth,
      coreMaterialId: bottomCore,
      faces: { faceA: null, faceB: null }, // No visible laminate
      edges: { top: null, bottom: null, left: null, right: null }, // No edge banding
      grainDirection: 'HORIZONTAL',
      computed: createDefaultComputed(drawerDims.bottomWidth, drawerDims.bottomDepth, bottomT),
      position: [
        0,
        currentY + bottomT / 2, // Sits on bottom, slightly above
        boxCenterZ,
      ],
      rotation: [Math.PI / 2, 0, 0], // Horizontal orientation
      visible: true,
      selected: false,
    });

    // Move Y position up for next drawer
    currentY += row.frontHeight + row.gapAbove;
  }

  return {
    panels,
    rowCount: drawerConfig.rows.length,
    panelCount: panels.length,
  };
}

/**
 * Calculate total drawer stack height for validation.
 */
export function calculateDrawerStackRequiredHeight(
  rows: DrawerRowConfig[]
): number {
  return rows.reduce((total, row) => total + row.frontHeight + row.gapAbove, 0);
}

/**
 * Check if drawer stack fits within available cabinet height.
 */
export function validateDrawerFit(
  availableHeight: number,
  rows: DrawerRowConfig[]
): { fits: boolean; required: number; available: number } {
  const required = calculateDrawerStackRequiredHeight(rows);
  return {
    fits: required <= availableHeight,
    required,
    available: availableHeight,
  };
}
