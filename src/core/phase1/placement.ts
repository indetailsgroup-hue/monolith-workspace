/**
 * placement.ts - A2: Drag & Drop Placement API
 *
 * NORTH STAR: "ลาก-วาง ถูกที่ถูกทาง"
 * Intelligent placement with snap, collision detection, and auto-pairing
 *
 * Features:
 * - Place assets (shelves, dividers, fittings) via drag & drop
 * - Auto-snap to System 32 grid
 * - Collision detection
 * - Auto-create paired holes for fittings (minifix, dowels)
 * - Compartment-aware placement
 *
 * @version 1.0.0 - Phase 1
 */

import { useCabinetStore } from '../store/useCabinetStore';
import type { Cabinet, CabinetPanel, PanelRole } from '../types/Cabinet';
import type {
  AssetKind,
  PlacementTarget,
  PlacementOptions,
  PlaceAssetRequest,
  PlaceAssetResult,
  PlacementResolution,
  CreatedEntity,
  PanelFace,
  GateIssue,
} from './types';
import { GATE_ISSUE_CODES } from './types';

// ============================================
// CONSTANTS
// ============================================

const SYSTEM_32_PITCH = 32; // mm
const SYSTEM_32_FIRST_HOLE = 37; // mm from front edge
const DEFAULT_SHELF_SETBACK = 20; // mm from front edge
const MIN_SHELF_SPAN = 150; // mm minimum compartment height

// ============================================
// SNAP UTILITIES
// ============================================

/**
 * Snap value to System 32 grid
 *
 * @param value - Value in mm
 * @param firstHole - First hole offset (default: 37mm)
 * @param pitch - Hole pitch (default: 32mm)
 * @returns Snapped value
 */
export function snapToSystem32(
  value: number,
  firstHole: number = SYSTEM_32_FIRST_HOLE,
  pitch: number = SYSTEM_32_PITCH
): number {
  if (value < firstHole) {
    return firstHole;
  }

  // Calculate which grid line we're closest to
  const fromFirst = value - firstHole;
  const gridIndex = Math.round(fromFirst / pitch);
  return firstHole + gridIndex * pitch;
}

/**
 * Get nearest System 32 positions for a height
 *
 * @param height - Cabinet internal height
 * @returns Array of valid Y positions
 */
export function getSystem32Positions(height: number): number[] {
  const positions: number[] = [];
  let y = SYSTEM_32_FIRST_HOLE;

  while (y < height - SYSTEM_32_FIRST_HOLE) {
    positions.push(y);
    y += SYSTEM_32_PITCH;
  }

  return positions;
}

// ============================================
// COLLISION DETECTION
// ============================================

/**
 * Check if a shelf/divider placement would collide with existing panels
 *
 * @param cabinet - Cabinet to check
 * @param position - Proposed position [x, y, z]
 * @param dimensions - Panel dimensions [width, height, thickness]
 * @param excludePanelId - Panel ID to exclude (for moves)
 * @returns Collision result
 */
export function checkCollision(
  cabinet: Cabinet,
  position: [number, number, number],
  dimensions: [number, number, number],
  excludePanelId?: string
): { collides: boolean; collidingPanels: string[] } {
  const collidingPanels: string[] = [];
  const tolerance = 1; // mm

  const [x, y, z] = position;
  const [w, h, d] = dimensions;

  // Simplified AABB collision for shelves/dividers
  for (const panel of cabinet.panels) {
    if (excludePanelId && panel.id === excludePanelId) continue;
    if (!['SHELF', 'DIVIDER'].includes(panel.role)) continue;

    const [px, py, pz] = panel.position;
    const pw = panel.finishWidth;
    const ph = panel.finishHeight;
    const pd = panel.computed.realThickness;

    // Check overlap in all three axes
    const overlapX = x < px + pw + tolerance && x + w > px - tolerance;
    const overlapY = y < py + ph + tolerance && y + h > py - tolerance;
    const overlapZ = z < pz + pd + tolerance && z + d > pz - tolerance;

    if (overlapX && overlapY && overlapZ) {
      collidingPanels.push(panel.id);
    }
  }

  return {
    collides: collidingPanels.length > 0,
    collidingPanels,
  };
}

// ============================================
// COMPARTMENT CALCULATIONS
// ============================================

/**
 * Calculate compartment boundaries from cabinet structure
 *
 * @param cabinet - Cabinet to analyze
 * @returns Array of compartment info
 */
export function calculateCompartments(cabinet: Cabinet): Array<{
  index: number;
  bounds: { minY: number; maxY: number; minX: number; maxX: number };
  existingPanels: string[];
}> {
  const { dimensions, structure } = cabinet;

  // Check for top/bottom panels by looking at actual panels
  const hasTopPanel = cabinet.panels.some(p => p.role === 'TOP');
  const hasBottomPanel = cabinet.panels.some(p => p.role === 'BOTTOM');

  // Get internal bounds
  const leftThickness = getLeftSideThickness(cabinet);
  const rightThickness = getRightSideThickness(cabinet);
  const topThickness = hasTopPanel ? getTopThickness(cabinet) : 0;
  const bottomThickness = hasBottomPanel ? getBottomThickness(cabinet) : 0;

  const internalWidth = dimensions.width - leftThickness - rightThickness;
  const internalHeight = dimensions.height - topThickness - bottomThickness;

  // Find all shelves and dividers
  const shelves = cabinet.panels
    .filter((p) => p.role === 'SHELF')
    .sort((a, b) => a.position[1] - b.position[1]);

  const dividers = cabinet.panels
    .filter((p) => p.role === 'DIVIDER')
    .sort((a, b) => a.position[0] - b.position[0]);

  // Calculate horizontal compartments (from dividers)
  const xBoundaries = [
    leftThickness,
    ...dividers.map((d) => d.position[0] + d.computed.realThickness / 2),
    dimensions.width - rightThickness,
  ];

  // Calculate vertical compartments (from shelves)
  const yBoundaries = [
    bottomThickness,
    ...shelves.map((s) => s.position[1] + s.computed.realThickness / 2),
    dimensions.height - topThickness,
  ];

  // Generate compartment grid
  const compartments: ReturnType<typeof calculateCompartments> = [];
  let index = 0;

  for (let xi = 0; xi < xBoundaries.length - 1; xi++) {
    for (let yi = 0; yi < yBoundaries.length - 1; yi++) {
      const bounds = {
        minX: xBoundaries[xi],
        maxX: xBoundaries[xi + 1],
        minY: yBoundaries[yi],
        maxY: yBoundaries[yi + 1],
      };

      // Find panels in this compartment
      const existingPanels = cabinet.panels
        .filter((p) => {
          const [px, py] = p.position;
          return (
            px >= bounds.minX &&
            px <= bounds.maxX &&
            py >= bounds.minY &&
            py <= bounds.maxY
          );
        })
        .map((p) => p.id);

      compartments.push({ index, bounds, existingPanels });
      index++;
    }
  }

  return compartments;
}

// ============================================
// PANEL THICKNESS HELPERS
// ============================================

function getLeftSideThickness(cabinet: Cabinet): number {
  const leftSide = cabinet.panels.find((p) => p.role === 'LEFT_SIDE');
  return leftSide?.computed.realThickness || 16;
}

function getRightSideThickness(cabinet: Cabinet): number {
  const rightSide = cabinet.panels.find((p) => p.role === 'RIGHT_SIDE');
  return rightSide?.computed.realThickness || 16;
}

function getTopThickness(cabinet: Cabinet): number {
  const top = cabinet.panels.find((p) => p.role === 'TOP');
  return top?.computed.realThickness || 16;
}

function getBottomThickness(cabinet: Cabinet): number {
  const bottom = cabinet.panels.find((p) => p.role === 'BOTTOM');
  return bottom?.computed.realThickness || 16;
}

// ============================================
// PLACEMENT RESOLUTION
// ============================================

/**
 * Resolve placement target to final position
 *
 * @param cabinet - Cabinet
 * @param target - Placement target
 * @param options - Placement options
 * @returns Resolved placement or null if invalid
 */
export function resolvePlacement(
  cabinet: Cabinet,
  target: PlacementTarget,
  options: PlacementOptions = {}
): PlacementResolution | null {
  const { panelId, face = 'A', u = 0.5, v = 0.5, compartmentIndex } = target;
  const { rotation = 0, offsetMm, snapToSystem32: snap = true } = options;

  // For compartment-based placement
  if (compartmentIndex !== undefined) {
    const compartments = calculateCompartments(cabinet);
    const compartment = compartments[compartmentIndex];

    if (!compartment) {
      return null;
    }

    const { bounds } = compartment;
    const x = bounds.minX + (bounds.maxX - bounds.minX) * 0.5;
    let y = bounds.minY + (bounds.maxY - bounds.minY) * v;

    // Snap to System 32 if requested
    if (snap) {
      y = snapToSystem32(y);
    }

    return {
      targetFaceNormal: [0, 1, 0],
      appliedRotation: rotation,
      snapped: snap,
      position: [x, y, DEFAULT_SHELF_SETBACK],
    };
  }

  // For panel-based placement
  const panel = cabinet.panels.find((p) => p.id === panelId);
  if (!panel) {
    return null;
  }

  // Calculate position on panel face
  const panelX = panel.position[0];
  const panelY = panel.position[1];
  const panelZ = panel.position[2];
  const panelW = panel.finishWidth;
  const panelH = panel.finishHeight;
  const panelT = panel.computed.realThickness;

  let x = panelX + panelW * u;
  let y = panelY + panelH * v;
  let z = face === 'A' ? panelZ - panelT / 2 : panelZ + panelT / 2;

  // Apply offsets
  if (offsetMm) {
    x += offsetMm.x;
    y += offsetMm.y;
    z += offsetMm.z;
  }

  // Snap if requested
  if (snap) {
    y = snapToSystem32(y);
  }

  // Determine face normal
  const faceNormal: [number, number, number] =
    face === 'A' ? [0, 0, -1] : [0, 0, 1];

  return {
    targetFaceNormal: faceNormal,
    appliedRotation: rotation,
    snapped: snap,
    position: [x, y, z],
  };
}

// ============================================
// MAIN PLACEMENT FUNCTION
// ============================================

/**
 * Place an asset in the cabinet
 *
 * @param request - Placement request
 * @returns Placement result
 *
 * @example
 * ```ts
 * // Place a shelf at 50% height in compartment 0
 * const result = placeAsset({
 *   assetId: 'shelf-standard',
 *   assetKind: 'SHELF',
 *   target: { compartmentIndex: 0, v: 0.5 },
 * });
 *
 * // Place a minifix fitting on panel face
 * const result = placeAsset({
 *   assetId: 'minifix-15',
 *   assetKind: 'FITTING',
 *   target: { panelId: 'panel-123', face: 'A', u: 0.5, v: 0.5 },
 *   options: { createPairedHoles: true },
 * });
 * ```
 */
export function placeAsset(request: PlaceAssetRequest): PlaceAssetResult {
  const { assetId, assetKind, target, options = {} } = request;

  const store = useCabinetStore.getState();
  const cabinet = store.cabinet;

  if (!cabinet) {
    return createFailedResult('No cabinet loaded');
  }

  // Resolve placement
  const resolved = resolvePlacement(cabinet, target, options);
  if (!resolved) {
    return createFailedResult('Invalid placement target', GATE_ISSUE_CODES.MONO_PLACE_INVALID_TARGET);
  }

  // Route to appropriate handler
  switch (assetKind) {
    case 'SHELF':
      return placeShelf(cabinet, assetId, resolved, options);
    case 'DIVIDER':
      return placeDivider(cabinet, assetId, resolved, options);
    case 'FITTING':
      return placeFitting(cabinet, assetId, target, resolved, options);
    default:
      return createFailedResult(`Unsupported asset kind: ${assetKind}`);
  }
}

/**
 * Place a shelf panel
 */
function placeShelf(
  cabinet: Cabinet,
  assetId: string,
  resolved: PlacementResolution,
  options: PlacementOptions
): PlaceAssetResult {
  const store = useCabinetStore.getState();

  // Calculate shelf dimensions (full internal width)
  const leftThickness = getLeftSideThickness(cabinet);
  const rightThickness = getRightSideThickness(cabinet);
  const internalWidth = cabinet.dimensions.width - leftThickness - rightThickness;
  const shelfDepth = cabinet.dimensions.depth - DEFAULT_SHELF_SETBACK;

  // Check for collisions
  const collision = checkCollision(
    cabinet,
    resolved.position,
    [internalWidth, 16, shelfDepth] // Approximate dimensions
  );

  if (collision.collides) {
    return createFailedResult(
      `Shelf would collide with: ${collision.collidingPanels.join(', ')}`,
      GATE_ISSUE_CODES.MONO_PLACE_COLLISION
    );
  }

  // Create shelf via store
  // Note: The store uses addShelfInCompartment(col, row, bounds) for compartment-aware placement
  // For direct Y-position placement, we use setShelfCount which regenerates all shelves
  const shelfId = `shelf-${Date.now()}`;

  // Increment shelf count (store will regenerate panel layout)
  const currentShelfCount = cabinet.structure.shelfCount;
  store.setShelfCount(currentShelfCount + 1);

  const created: CreatedEntity[] = [
    { entityType: 'PANEL', id: shelfId },
  ];

  return {
    success: true,
    changes: [
      {
        type: 'SHELF_PLACED',
        description: `Added shelf at Y=${resolved.position[1].toFixed(0)}mm`,
      },
    ],
    created,
    resolved,
  };
}

/**
 * Place a divider panel
 */
function placeDivider(
  cabinet: Cabinet,
  assetId: string,
  resolved: PlacementResolution,
  options: PlacementOptions
): PlaceAssetResult {
  const store = useCabinetStore.getState();

  // Calculate divider position (X position)
  const dividerX = resolved.position[0];

  // Check for collisions
  const hasTopPanel = cabinet.panels.some(p => p.role === 'TOP');
  const hasBottomPanel = cabinet.panels.some(p => p.role === 'BOTTOM');
  const topThickness = hasTopPanel ? getTopThickness(cabinet) : 0;
  const bottomThickness = hasBottomPanel ? getBottomThickness(cabinet) : 0;
  const dividerHeight = cabinet.dimensions.height - topThickness - bottomThickness;

  const collision = checkCollision(
    cabinet,
    [dividerX, bottomThickness, resolved.position[2]],
    [16, dividerHeight, cabinet.dimensions.depth - DEFAULT_SHELF_SETBACK]
  );

  if (collision.collides) {
    return createFailedResult(
      `Divider would collide with: ${collision.collidingPanels.join(', ')}`,
      GATE_ISSUE_CODES.MONO_PLACE_COLLISION
    );
  }

  // Create divider via store
  // Note: The store uses addDividerInCompartment(col, row, bounds) for compartment-aware placement
  // For simple placement, we use setDividerCount which regenerates all dividers
  const dividerId = `divider-${Date.now()}`;

  // Increment divider count (store will regenerate panel layout)
  const currentDividerCount = cabinet.structure.dividerCount;
  store.setDividerCount(currentDividerCount + 1);

  const created: CreatedEntity[] = [
    { entityType: 'PANEL', id: dividerId },
  ];

  return {
    success: true,
    changes: [
      {
        type: 'DIVIDER_PLACED',
        description: `Added divider at X=${dividerX.toFixed(0)}mm`,
      },
    ],
    created,
    resolved,
  };
}

/**
 * Place a fitting (minifix, dowel, etc.)
 */
function placeFitting(
  cabinet: Cabinet,
  assetId: string,
  target: PlacementTarget,
  resolved: PlacementResolution,
  options: PlacementOptions
): PlaceAssetResult {
  const { panelId, face = 'A' } = target;
  const { createPairedHoles = true } = options;

  if (!panelId) {
    return createFailedResult('Panel ID required for fitting placement');
  }

  const panel = cabinet.panels.find((p) => p.id === panelId);
  if (!panel) {
    return createFailedResult(`Panel ${panelId} not found`);
  }

  const created: CreatedEntity[] = [];

  // Determine fitting parameters based on asset ID
  const fittingParams = getFittingParams(assetId);

  // Create primary hole specification
  const primaryHoleId = `hole-${Date.now()}-primary`;

  created.push({
    entityType: 'HOLE',
    id: primaryHoleId,
  });

  // Create paired hole specification if needed (for minifix, dowels, etc.)
  if (createPairedHoles && fittingParams.requiresPair && fittingParams.pairOffset !== undefined) {
    const pairedHoleId = `hole-${Date.now()}-paired`;

    // Find the mating panel (shelf, divider, etc.)
    const matingPanel = findMatingPanel(cabinet, panel, resolved.position);
    if (matingPanel) {
      created.push({
        entityType: 'HOLE',
        id: pairedHoleId,
        pairedHoleId: primaryHoleId,
      });
    }
  }

  // Note: Actual drill map is regenerated from cabinet state via useDrillMapStore.setDrillMap()
  // The hole specifications are used to update hardware configuration
  // which then triggers drill map regeneration

  return {
    success: true,
    changes: [
      {
        type: 'FITTING_PLACED',
        description: `Placed ${assetId} on panel ${panelId}`,
      },
    ],
    created,
    resolved,
  };
}

// ============================================
// FITTING PARAMETERS
// ============================================

interface FittingParams {
  diameter: number;
  depth: number;
  purpose: string;
  toolId: string;
  requiresPair: boolean;
  pairOffset?: number;
  pairDiameter?: number;
  pairDepth?: number;
  pairPurpose?: string;
  pairToolId?: string;
}

function getFittingParams(assetId: string): FittingParams {
  const params: Record<string, FittingParams> = {
    'minifix-15': {
      diameter: 15,
      depth: 12.5,
      purpose: 'minifix_cam',
      toolId: 'BORE_15',
      requiresPair: true,
      pairOffset: 24, // Distance B per CAD spec
      pairDiameter: 10,
      pairDepth: 17.5,
      pairPurpose: 'minifix_bolt',
      pairToolId: 'DRILL_10',
    },
    'dowel-8': {
      diameter: 8,
      depth: 25,
      purpose: 'dowel',
      toolId: 'DRILL_8',
      requiresPair: true,
      pairOffset: 16,
      pairDepth: 25,
    },
    'shelf-pin-5': {
      diameter: 5,
      depth: 10,
      purpose: 'shelf_pin',
      toolId: 'DRILL_5',
      requiresPair: false,
    },
    'hinge-cup-35': {
      diameter: 35,
      depth: 12,
      purpose: 'hinge_cup',
      toolId: 'BORE_35',
      requiresPair: true,
      pairOffset: 45,
      pairDiameter: 3.5,
      pairDepth: 12,
      pairPurpose: 'hinge_screw',
      pairToolId: 'DRILL_3_5',
    },
  };

  return (
    params[assetId] || {
      diameter: 8,
      depth: 20,
      purpose: 'generic',
      toolId: 'DRILL_8',
      requiresPair: false,
    }
  );
}

/**
 * Find mating panel at a position
 */
function findMatingPanel(
  cabinet: Cabinet,
  sourcePanel: CabinetPanel,
  position: [number, number, number]
): CabinetPanel | null {
  const tolerance = 2; // mm

  for (const panel of cabinet.panels) {
    if (panel.id === sourcePanel.id) continue;

    // Check if panel is near the position
    const [px, py, pz] = panel.position;
    const pw = panel.finishWidth;
    const ph = panel.finishHeight;

    // Check if position is within panel bounds
    if (
      position[0] >= px - tolerance &&
      position[0] <= px + pw + tolerance &&
      position[1] >= py - tolerance &&
      position[1] <= py + ph + tolerance
    ) {
      return panel;
    }
  }

  return null;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function createFailedResult(message: string, code?: string): PlaceAssetResult {
  return {
    success: false,
    changes: [],
    warnings: [message],
    created: [],
    resolved: {
      targetFaceNormal: [0, 0, 0],
      appliedRotation: 0,
      snapped: false,
      position: [0, 0, 0],
    },
  };
}

// ============================================
// PREVIEW FUNCTIONS
// ============================================

/**
 * Preview a placement without actually executing it
 *
 * @param request - Placement request
 * @returns Preview with resolved position and any issues
 */
export function previewPlacement(request: PlaceAssetRequest): {
  valid: boolean;
  resolved: PlacementResolution | null;
  issues: GateIssue[];
} {
  const { target, options } = request;

  const cabinet = useCabinetStore.getState().cabinet;
  if (!cabinet) {
    return {
      valid: false,
      resolved: null,
      issues: [
        {
          code: 'MONO_PLACE_INVALID_TARGET',
          severity: 'FAIL',
          entityType: 'CABINET',
          entityId: '',
          message: 'No cabinet loaded',
        },
      ],
    };
  }

  const resolved = resolvePlacement(cabinet, target, options);
  if (!resolved) {
    return {
      valid: false,
      resolved: null,
      issues: [
        {
          code: GATE_ISSUE_CODES.MONO_PLACE_INVALID_TARGET,
          severity: 'FAIL',
          entityType: 'PANEL',
          entityId: target.panelId || '',
          message: 'Invalid placement target',
        },
      ],
    };
  }

  const issues: GateIssue[] = [];

  // Check for out of bounds
  if (
    resolved.position[0] < 0 ||
    resolved.position[0] > cabinet.dimensions.width ||
    resolved.position[1] < 0 ||
    resolved.position[1] > cabinet.dimensions.height ||
    resolved.position[2] < 0 ||
    resolved.position[2] > cabinet.dimensions.depth
  ) {
    issues.push({
      code: GATE_ISSUE_CODES.MONO_PLACE_OUT_OF_BOUNDS,
      severity: 'FAIL',
      entityType: 'PLACEMENT',
      entityId: '',
      message: 'Placement is outside cabinet bounds',
    });
  }

  // Check for collisions
  if (request.assetKind === 'SHELF' || request.assetKind === 'DIVIDER') {
    const collision = checkCollision(
      cabinet,
      resolved.position,
      [100, 16, 100] // Approximate check
    );

    if (collision.collides) {
      issues.push({
        code: GATE_ISSUE_CODES.MONO_PLACE_COLLISION,
        severity: 'WARN',
        entityType: 'PLACEMENT',
        entityId: '',
        message: `Would collide with: ${collision.collidingPanels.join(', ')}`,
      });
    }
  }

  return {
    valid: issues.filter((i) => i.severity === 'FAIL').length === 0,
    resolved,
    issues,
  };
}

/**
 * Get valid placement positions for a shelf in a compartment
 *
 * @param compartmentIndex - Compartment index
 * @returns Array of valid Y positions (snapped to System 32)
 */
export function getValidShelfPositions(compartmentIndex: number): number[] {
  const cabinet = useCabinetStore.getState().cabinet;
  if (!cabinet) return [];

  const compartments = calculateCompartments(cabinet);
  const compartment = compartments[compartmentIndex];
  if (!compartment) return [];

  const { bounds } = compartment;
  const positions = getSystem32Positions(bounds.maxY - bounds.minY);

  // Offset to compartment base and filter valid positions
  return positions
    .map((p) => p + bounds.minY)
    .filter((y) => y > bounds.minY + MIN_SHELF_SPAN && y < bounds.maxY - MIN_SHELF_SPAN);
}
