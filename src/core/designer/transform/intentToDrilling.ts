/**
 * Intent to Drilling - Drill Map Generation
 *
 * Generates drill points from hardware placements.
 * This creates a reference that can be merged with
 * existing drill map generation.
 *
 * v1.0: Initial drill map generation (reference only)
 */

import type { DesignerIntent, HardwareSelection, Vec3 } from '../types';
import { SYSTEM_32, CONNECTOR_LIMITS } from '../policy';

// ============================================
// DRILL POINT TYPES
// ============================================

/**
 * Drill point specification.
 */
export interface DrillPoint {
  /** Unique identifier */
  id: string;
  /** Panel ID */
  panelId: string;
  /** Position on panel (mm) */
  position: Vec3;
  /** Drill diameter (mm) */
  diameter: number;
  /** Drill depth (mm) */
  depth: number;
  /** Drill type/purpose */
  type: 'cam' | 'bolt' | 'dowel' | 'shelf_pin' | 'hinge_cup' | 'hinge_plate' | 'slide' | 'confirmat';
  /** Face of panel ('A', 'B', or 'edge') */
  face: 'A' | 'B' | 'edge';
  /** Hardware ID this drill is for */
  hardwareId?: string;
}

/**
 * Drill map for a cabinet.
 */
export interface DrillMap {
  /** Cabinet ID */
  cabinetId: string;
  /** Map of panel ID -> drill points */
  panels: Map<string, DrillPoint[]>;
  /** Total drill count */
  totalCount: number;
  /** Generated timestamp */
  generatedAt: string;
}

// ============================================
// DRILL SPECIFICATIONS
// ============================================

const DRILL_SPECS = {
  minifix_cam: { diameter: 15, depth: 12.5 },
  minifix_bolt: { diameter: 8, depth: 'through' as const },
  minifix_dowel: { diameter: 5, depth: 13 },
  dowel: { diameter: 8, depth: 12 },
  confirmat_face: { diameter: 8, depth: 'through' as const },
  confirmat_edge: { diameter: 5, depth: 50 },
  hinge_cup: { diameter: 35, depth: 13 },
  hinge_plate: { diameter: 5, depth: 13 },
  shelf_pin: { diameter: 5, depth: 13 },
  slide_mount: { diameter: 5, depth: 13 },
};

// ============================================
// DRILL GENERATION FUNCTIONS
// ============================================

/**
 * Generate drill points for minifix connectors.
 */
function generateMinifixDrills(
  hardware: HardwareSelection,
  panelThickness: number
): DrillPoint[] {
  const drills: DrillPoint[] = [];

  for (const placement of hardware.placements) {
    const id = `minifix-${placement.panelId}-${drills.length}`;

    // Cam hole (on face)
    drills.push({
      id: `${id}-cam`,
      panelId: placement.panelId,
      position: placement.position,
      diameter: DRILL_SPECS.minifix_cam.diameter,
      depth: DRILL_SPECS.minifix_cam.depth,
      type: 'cam',
      face: placement.face || 'A',
      hardwareId: hardware.catalogId,
    });

    // Bolt hole (through panel, offset from cam)
    drills.push({
      id: `${id}-bolt`,
      panelId: placement.panelId,
      position: {
        x: placement.position.x + 9.5, // Cam offset
        y: placement.position.y,
        z: placement.position.z,
      },
      diameter: DRILL_SPECS.minifix_bolt.diameter,
      depth: panelThickness, // Through
      type: 'bolt',
      face: placement.face || 'A',
      hardwareId: hardware.catalogId,
    });
  }

  return drills;
}

/**
 * Generate drill points for hinges.
 */
function generateHingeDrills(hardware: HardwareSelection): DrillPoint[] {
  const drills: DrillPoint[] = [];

  for (const placement of hardware.placements) {
    const id = `hinge-${placement.panelId}-${drills.length}`;

    // Cup hole on door
    drills.push({
      id: `${id}-cup`,
      panelId: placement.panelId,
      position: placement.position,
      diameter: DRILL_SPECS.hinge_cup.diameter,
      depth: DRILL_SPECS.hinge_cup.depth,
      type: 'hinge_cup',
      face: 'B', // Back of door
      hardwareId: hardware.catalogId,
    });

    // Note: Plate holes on cabinet side would be generated separately
  }

  return drills;
}

/**
 * Generate drill points for shelf pins (System 32).
 */
function generateShelfPinDrills(
  hardware: HardwareSelection,
  cabinetHeight: number
): DrillPoint[] {
  const drills: DrillPoint[] = [];

  // Generate System 32 hole pattern on side panels
  const startY = SYSTEM_32.firstHoleZ;
  const endY = cabinetHeight - startY;

  for (let y = startY; y <= endY; y += SYSTEM_32.pitch) {
    // Left side, front row
    drills.push({
      id: `shelf-pin-left-front-${y}`,
      panelId: 'left-side',
      position: { x: 0, y, z: SYSTEM_32.firstHoleZ },
      diameter: DRILL_SPECS.shelf_pin.diameter,
      depth: DRILL_SPECS.shelf_pin.depth,
      type: 'shelf_pin',
      face: 'A',
      hardwareId: hardware.catalogId,
    });

    // Left side, back row
    drills.push({
      id: `shelf-pin-left-back-${y}`,
      panelId: 'left-side',
      position: { x: 0, y, z: 250 }, // Adjust based on depth
      diameter: DRILL_SPECS.shelf_pin.diameter,
      depth: DRILL_SPECS.shelf_pin.depth,
      type: 'shelf_pin',
      face: 'A',
      hardwareId: hardware.catalogId,
    });

    // Right side (mirrored)
    drills.push({
      id: `shelf-pin-right-front-${y}`,
      panelId: 'right-side',
      position: { x: 0, y, z: SYSTEM_32.firstHoleZ },
      diameter: DRILL_SPECS.shelf_pin.diameter,
      depth: DRILL_SPECS.shelf_pin.depth,
      type: 'shelf_pin',
      face: 'B',
      hardwareId: hardware.catalogId,
    });

    drills.push({
      id: `shelf-pin-right-back-${y}`,
      panelId: 'right-side',
      position: { x: 0, y, z: 250 },
      diameter: DRILL_SPECS.shelf_pin.diameter,
      depth: DRILL_SPECS.shelf_pin.depth,
      type: 'shelf_pin',
      face: 'B',
      hardwareId: hardware.catalogId,
    });
  }

  return drills;
}

/**
 * Generate drill points for drawer slides.
 */
function generateSlideDrills(hardware: HardwareSelection): DrillPoint[] {
  const drills: DrillPoint[] = [];

  for (const placement of hardware.placements) {
    const id = `slide-${placement.panelId}-${drills.length}`;

    // 3 mounting holes per slide
    const holeSpacing = SYSTEM_32.pitch;
    for (let i = 0; i < 3; i++) {
      drills.push({
        id: `${id}-${i}`,
        panelId: placement.panelId,
        position: {
          x: placement.position.x,
          y: placement.position.y,
          z: placement.position.z + i * holeSpacing,
        },
        diameter: DRILL_SPECS.slide_mount.diameter,
        depth: DRILL_SPECS.slide_mount.depth,
        type: 'slide',
        face: placement.face || 'A',
        hardwareId: hardware.catalogId,
      });
    }
  }

  return drills;
}

// ============================================
// MAIN EXPORT
// ============================================

/**
 * Generate drill map from designer intent and hardware selections.
 *
 * Note: This generates a reference drill map. The actual drill map
 * generation for CNC should use the existing drilling system
 * which has more precise specifications.
 */
export function intentToDrilling(
  intent: DesignerIntent,
  hardware: HardwareSelection[]
): DrillMap {
  const panels = new Map<string, DrillPoint[]>();
  let totalCount = 0;

  const panelThickness = intent.materials.carcassThickness;
  const cabinetHeight = intent.dimensions.height;

  for (const hw of hardware) {
    let drills: DrillPoint[] = [];

    switch (hw.type) {
      case 'minifix':
        drills = generateMinifixDrills(hw, panelThickness);
        break;
      case 'hinge':
        drills = generateHingeDrills(hw);
        break;
      case 'shelf_pin':
        drills = generateShelfPinDrills(hw, cabinetHeight);
        break;
      case 'slide':
        drills = generateSlideDrills(hw);
        break;
      // Other hardware types would be added here
    }

    // Group drills by panel
    for (const drill of drills) {
      const existing = panels.get(drill.panelId) || [];
      existing.push(drill);
      panels.set(drill.panelId, existing);
      totalCount++;
    }
  }

  return {
    cabinetId: 'cabinet-1', // Would come from context
    panels,
    totalCount,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get drill map summary for metrics.
 */
export function getDrillMapSummary(drillMap: DrillMap): {
  totalDrills: number;
  byPanel: Record<string, number>;
  byType: Record<string, number>;
} {
  const byPanel: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const [panelId, drills] of drillMap.panels) {
    byPanel[panelId] = drills.length;

    for (const drill of drills) {
      byType[drill.type] = (byType[drill.type] || 0) + 1;
    }
  }

  return {
    totalDrills: drillMap.totalCount,
    byPanel,
    byType,
  };
}
