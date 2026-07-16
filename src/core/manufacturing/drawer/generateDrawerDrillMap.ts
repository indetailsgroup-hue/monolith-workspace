/**
 * generateDrawerDrillMap.ts - Drawer Slide Mounting Drill Map
 *
 * Generates drill points for drawer slide mounting holes on cabinet
 * SIDE panels (LEFT_SIDE and RIGHT_SIDE).
 *
 * Integrates with the existing drill map system via toDrillMapPoints()
 * which converts DrawerSlideHole[] to DrillMapPoint[].
 *
 * @version 1.0.0 - Full implementation
 */

import type { Cabinet, CabinetPanel } from '../../types/Cabinet';
import { DRAWER_SLIDE } from '../../types/Production';
import type { DrillMapPoint, Vec3Tuple } from '../drillMap/types';

// ============================================
// TYPES
// ============================================

/**
 * Drawer slide mounting hole specification.
 */
export interface DrawerSlideHole {
  /** X position along panel depth (front-to-back) */
  x: number;
  /** Y position from panel bottom (vertical) */
  y: number;
  /** Hole diameter (typically 5mm) */
  diameter: number;
  /** Hole depth (typically 13mm) */
  depth: number;
  /** Row index (0 = bottom drawer) */
  rowIndex: number;
  /** Side: 'left' or 'right' */
  side: 'left' | 'right';
}

/**
 * Parameters for generating drawer slide holes.
 */
export interface DrawerSlideHoleParams {
  /** Slide type: 'undermount' or 'side_mount' */
  slideType: 'undermount' | 'side_mount';
  /** Number of drawer rows */
  rowCount: number;
  /** Heights of each drawer row */
  rowHeights: number[];
  /** Gap between drawers */
  rowGaps: number[];
  /** Cabinet inner height (excludes toe kick and top/bottom panels) */
  cabinetInnerHeight: number;
  /** Cabinet inner depth */
  cabinetInnerDepth: number;
  /** Panel thickness */
  panelThickness: number;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Standard slide mounting hole specifications.
 */
export const SLIDE_HOLE_SPECS = {
  undermount: {
    diameter: DRAWER_SLIDE.UNDERMOUNT.MOUNTING_HOLES.DIAMETER,
    depth: DRAWER_SLIDE.UNDERMOUNT.MOUNTING_HOLES.DEPTH,
    offsetY: DRAWER_SLIDE.UNDERMOUNT.SLIDE_OFFSET_Y,
  },
  side_mount: {
    diameter: 5,   // Standard 5mm screw hole
    depth: 13,     // Standard depth
    offsetY: 15,   // Distance from drawer bottom
  },
};

/**
 * System 32 positions for slide mounting (front-to-back).
 * Undermount slides typically use 2-3 holes per row.
 */
export const SLIDE_MOUNTING_Z_POSITIONS = {
  /** Distance from front edge to first hole (mm) */
  frontOffset: 37,
  /** Pitch between holes (System 32) */
  pitch: 32,
  /** Number of holes per row */
  holesPerRow: 3,
};

// ============================================
// DRAWER SLIDE HOLE GENERATION
// ============================================

/**
 * Generate drawer slide mounting hole specifications.
 *
 * Produces `DrawerSlideHole[]` (Y positions per drawer row on the LEFT_SIDE /
 * RIGHT_SIDE panels, System 32 Z spacing). This is a self-contained helper and
 * is NOT currently wired into the live drill-map pipeline — the active drawer
 * drilling path is `core/designerIntent/mappers/drillingMapper.ts`. Adopting
 * this path would additionally require mapping the specs to `DrillMapPoint[]`
 * for `useDrillMapStore`; that integration is intentionally out of scope here.
 *
 * @param cabinet - Cabinet with drawer configuration
 * @returns Array of slide mounting hole specifications
 */
export function generateDrawerSlideHoles(
  cabinet: Cabinet
): DrawerSlideHole[] {
  const drawerConfig = cabinet.structure.drawerConfig;

  // Return empty if no drawer config or disabled
  if (!drawerConfig?.hasDrawers || drawerConfig.rows.length === 0) {
    return [];
  }

  const holes: DrawerSlideHole[] = [];
  const { dimensions } = cabinet;

  // Get panel thickness from actual cabinet panels using computed.realThickness
  const bottomPanel = cabinet.panels.find(p => p.role === 'BOTTOM');
  const panelThickness = bottomPanel?.computed?.realThickness ?? 18;

  // Calculate starting Y position (above bottom panel + toe kick)
  let currentY = dimensions.toeKickHeight + panelThickness;

  // Hole specifications based on slide type
  const specs = SLIDE_HOLE_SPECS[drawerConfig.slideType];

  // Generate holes for each drawer row
  for (let rowIndex = 0; rowIndex < drawerConfig.rows.length; rowIndex++) {
    const row = drawerConfig.rows[rowIndex];

    // Y position for slide mounting
    const holeY = currentY + specs.offsetY;

    // Generate holes along Z (depth) using System 32 positions
    for (let zIdx = 0; zIdx < SLIDE_MOUNTING_Z_POSITIONS.holesPerRow; zIdx++) {
      const zPos = SLIDE_MOUNTING_Z_POSITIONS.frontOffset +
        (zIdx * SLIDE_MOUNTING_Z_POSITIONS.pitch);

      // Add holes for both sides
      holes.push({
        x: zPos,
        y: holeY,
        diameter: specs.diameter,
        depth: specs.depth,
        rowIndex,
        side: 'left',
      });

      holes.push({
        x: zPos,
        y: holeY,
        diameter: specs.diameter,
        depth: specs.depth,
        rowIndex,
        side: 'right',
      });
    }

    // Move up for next drawer
    currentY += row.frontHeight + row.gapAbove;
  }

  return holes;
}

/**
 * Check if a panel should have drawer slide holes.
 */
export function panelNeedsDrawerHoles(panel: CabinetPanel): boolean {
  return panel.role === 'LEFT_SIDE' || panel.role === 'RIGHT_SIDE';
}

// ============================================
// DrillMapPoint Conversion
// ============================================

/**
 * Convert DrawerSlideHole[] to DrillMapPoint[] for drill map integration.
 *
 * @param holes - Array of drawer slide hole specifications
 * @param cabinet - Cabinet to get panel positions from
 * @returns DrillMapPoint[] compatible with useDrillMapStore
 */
export function toDrillMapPoints(
  holes: DrawerSlideHole[],
  cabinet: Cabinet
): DrillMapPoint[] {
  const points: DrillMapPoint[] = [];

  // Find side panels for world position calculation
  const leftPanel = cabinet.panels.find(p => p.role === 'LEFT_SIDE');
  const rightPanel = cabinet.panels.find(p => p.role === 'RIGHT_SIDE');

  if (!leftPanel || !rightPanel) {
    return points;
  }

  // Get panel thickness from computed values
  const panelThickness = leftPanel.computed?.realThickness ?? 18;

  for (const hole of holes) {
    const panel = hole.side === 'left' ? leftPanel : rightPanel;
    const panelId = panel.id ?? `${cabinet.id}-${panel.role}`;

    // Panel position is a tuple [x, y, z]
    const panelPos = panel.position ?? [0, 0, 0];

    // Drill normal points into the panel (from inside cabinet)
    const normal: Vec3Tuple = hole.side === 'left'
      ? [1, 0, 0]   // Drill into left panel from right
      : [-1, 0, 0]; // Drill into right panel from left

    // World position calculation
    // For left panel: x = panel outer face + thickness (drill from inside)
    // For right panel: x = panel inner face (drill from inside)
    const worldX = hole.side === 'left'
      ? panelPos[0] + panelThickness  // Inside face of left panel
      : panelPos[0];                   // Inside face of right panel

    const position: Vec3Tuple = [
      worldX,
      panelPos[1] + hole.y,
      panelPos[2] + hole.x,  // x in hole spec is actually depth (Z direction)
    ];

    const pointId = `drawer-slide-${hole.side}-row${hole.rowIndex}-z${Math.round(hole.x)}`;

    points.push({
      id: pointId,
      panelId,
      position,
      normal,
      diameter: hole.diameter,
      depth: hole.depth,
      purpose: 'DRAWER_SLIDE',
      componentType: 'SLIDE_HOLE',
      status: 'VALID',
      face: hole.side === 'left' ? 'RIGHT' : 'LEFT', // Which face of the panel
      edgeDistance: hole.y, // Distance from bottom
      depthPosition: hole.x, // Position along depth
    });
  }

  return points;
}

/**
 * Generate full drawer slide drill map for a cabinet.
 * Convenience function combining generateDrawerSlideHoles and toDrillMapPoints.
 *
 * @param cabinet - Cabinet with drawer configuration
 * @returns DrillMapPoint[] ready for drill map integration
 */
export function generateDrawerSlideDrillPoints(cabinet: Cabinet): DrillMapPoint[] {
  const holes = generateDrawerSlideHoles(cabinet);
  return toDrillMapPoints(holes, cabinet);
}
