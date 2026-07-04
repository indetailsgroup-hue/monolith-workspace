/**
 * CNC Bridge - Convert Designer Intent drilling plan to CNC Overlay format
 *
 * Bridges the symbolic drilling plan from Designer Intent module
 * to the CNC Overlay visualization layer.
 *
 * v1.0: Initial implementation
 */

import type { DrillOpPDF, DrillingPlanPDF, PanelId } from './types';

// ============================================
// CNC OVERLAY TYPES (matching existing system)
// ============================================

export interface CncOverlayPoint {
  readonly id: string;
  readonly type: 'DRILL' | 'BORE';
  readonly position: { x: number; y: number; z: number };
  readonly diameter: number;
  readonly depth: number;
  readonly face: 'TOP' | 'BOTTOM';
  readonly panelId: string;
  readonly cycle: 'G81' | 'G82' | 'G83';
  readonly holeKind: string;
  readonly feedRate: number;
  readonly rpm: number;
  readonly throughHole: boolean;
  readonly label: string;
  readonly peckDepth?: number;
  readonly dwellTime?: number;
}

// ============================================
// PANEL DIMENSION LOOKUP
// ============================================

interface PanelDimensions {
  width: number;
  height: number;
  thickness: number;
}

interface CabinetDimensions {
  width: number;
  height: number;
  depth: number;
  panelThickness: number;
}

function getPanelDimensions(
  panelId: PanelId,
  cabinet: CabinetDimensions
): PanelDimensions {
  const { width, height, depth, panelThickness } = cabinet;

  switch (panelId) {
    case 'LEFT_SIDE':
    case 'RIGHT_SIDE':
      return { width: depth, height: height, thickness: panelThickness };
    case 'TOP':
    case 'BOTTOM':
      return { width: width - panelThickness * 2, height: depth, thickness: panelThickness };
    case 'BACK':
      return { width: width - panelThickness * 2, height: height - panelThickness * 2, thickness: 6 };
    case 'SHELF':
      return { width: width - panelThickness * 2, height: depth, thickness: panelThickness };
    case 'DOOR':
      return { width: width / 2, height: height, thickness: panelThickness };
    case 'DRAWER':
      return { width: width - panelThickness * 2 - 26, height: 100, thickness: panelThickness };
    default:
      return { width: 400, height: 400, thickness: panelThickness };
  }
}

// ============================================
// DRILL TYPE MAPPING
// ============================================

function mapDrillType(drillType: DrillOpPDF['drillType']): 'DRILL' | 'BORE' {
  switch (drillType) {
    case 'CAM':
    case 'HINGE_CUP':
      return 'BORE';
    default:
      return 'DRILL';
  }
}

function mapHoleKind(drillType: DrillOpPDF['drillType']): string {
  switch (drillType) {
    case 'CAM':
      return 'MINIFIX_CAM';
    case 'BOLT':
      return 'MINIFIX_BOLT';
    case 'SHELF_PIN':
      return 'SHELF_PIN';
    case 'HINGE_CUP':
      return 'HINGE_CUP';
    case 'PILOT':
      return 'PILOT';
    case 'GROOVE':
      return 'GROOVE';
    default:
      return 'UNKNOWN';
  }
}

function mapCycle(drillType: DrillOpPDF['drillType'], depth: number): 'G81' | 'G82' | 'G83' {
  // G82 for boring (dwell), G83 for deep holes (peck), G81 for standard
  if (drillType === 'CAM' || drillType === 'HINGE_CUP') {
    return 'G82'; // Bore with dwell
  }
  if (depth > 15) {
    return 'G83'; // Deep peck cycle
  }
  return 'G81'; // Standard drill
}

// ============================================
// POSITION CALCULATION (Symbolic → Actual)
// ============================================

interface PositionContext {
  panelDimensions: PanelDimensions;
  system32?: { firstHole: number; pitch: number };
  index: number;
}

function calculatePosition(
  op: DrillOpPDF,
  ctx: PositionContext
): { x: number; y: number; z: number } {
  const { panelDimensions, system32, index } = ctx;
  const { width, height } = panelDimensions;

  // Default positioning based on symbol reference
  const ref = op.symbolRef;

  // Minifix positions
  if (ref.startsWith('CAM_L_') || ref.startsWith('CAM_R_')) {
    const idx = parseInt(ref.split('_')[2]) || 0;
    const isTop = idx < 2;
    const isFront = idx % 2 === 0;

    return {
      x: isFront ? 50 : width - 50,
      y: isTop ? height - 24 : 24,
      z: 0,
    };
  }

  if (ref.startsWith('BOLT_')) {
    // Bolts on horizontal panels, positioned from edge
    return {
      x: 50 + (index % 2) * (width - 100),
      y: 24,
      z: 0,
    };
  }

  // Shelf pin line (System 32)
  if (ref.startsWith('SHELF_LINE_')) {
    const isFront = ref.includes('FRONT');
    const firstHole = system32?.firstHole ?? 50;
    const pitch = system32?.pitch ?? 32;

    // Generate position along System 32 grid
    const gridIndex = Math.floor(index / 4);

    return {
      x: isFront ? firstHole : width - firstHole,
      y: firstHole + gridIndex * pitch,
      z: 0,
    };
  }

  // Groove (back panel)
  if (ref.startsWith('GROOVE_')) {
    return {
      x: 8, // 8mm from back edge
      y: height / 2,
      z: 0,
    };
  }

  // Hinge positions
  if (ref.startsWith('HINGE_CUP_')) {
    const hingeIdx = parseInt(ref.split('_')[3]) || 0;
    return {
      x: 22, // Standard cup hinge position from edge
      y: 100 + hingeIdx * 300, // Spacing between hinges
      z: 0,
    };
  }

  if (ref.startsWith('HINGE_PLATE_')) {
    const hingeIdx = parseInt(ref.split('_')[3]) || 0;
    return {
      x: 50,
      y: 100 + hingeIdx * 300,
      z: 0,
    };
  }

  // Drawer slide positions
  if (ref.startsWith('SLIDE_')) {
    const slideIdx = parseInt(ref.split('_')[2]) || 0;
    return {
      x: 50 + (index % 2) * 100,
      y: 50 + slideIdx * 150,
      z: 0,
    };
  }

  // Default: center of panel
  return {
    x: width / 2,
    y: height / 2,
    z: 0,
  };
}

// ============================================
// FEED/RPM CALCULATION
// ============================================

function calculateFeedRate(diameter: number, drillType: DrillOpPDF['drillType']): number {
  // Conservative feed rates (mm/min)
  if (drillType === 'CAM' || drillType === 'HINGE_CUP') {
    return 800; // Slower for boring
  }
  if (diameter <= 5) {
    return 1200;
  }
  if (diameter <= 10) {
    return 1000;
  }
  return 800;
}

function calculateRPM(diameter: number): number {
  // Standard RPM for wood drilling
  if (diameter <= 5) {
    return 8000;
  }
  if (diameter <= 10) {
    return 6000;
  }
  if (diameter <= 20) {
    return 4000;
  }
  return 3000;
}

// ============================================
// MAIN CONVERSION FUNCTION
// ============================================

export interface ConvertToCncOptions {
  cabinetDimensions: CabinetDimensions;
  jobId?: string;
}

export interface CncOverlayBuildResult {
  points: CncOverlayPoint[];
  stats: {
    totalPoints: number;
    byType: Record<string, number>;
    byPanel: Record<string, number>;
  };
  jobId: string;
}

/**
 * Convert Designer Intent drilling plan to CNC Overlay format.
 */
export function convertDrillingPlanToCncOverlay(
  drillingPlan: DrillingPlanPDF,
  options: ConvertToCncOptions
): CncOverlayBuildResult {
  const { cabinetDimensions, jobId = 'designer-intent' } = options;
  const points: CncOverlayPoint[] = [];
  const byType: Record<string, number> = {};
  const byPanel: Record<string, number> = {};

  // Track index per panel for positioning
  const panelIndex: Record<string, number> = {};

  for (const op of drillingPlan.operations) {
    // Get panel dimensions
    const panelDimensions = getPanelDimensions(op.panel, cabinetDimensions);

    // Track index
    const panel = op.panel;
    panelIndex[panel] = (panelIndex[panel] ?? 0) + 1;

    // Calculate position
    const position = calculatePosition(op, {
      panelDimensions,
      system32: drillingPlan.system32,
      index: panelIndex[panel],
    });

    // Determine cycle
    const cycle = mapCycle(op.drillType, op.depth);

    // Create overlay point
    const point: CncOverlayPoint = {
      id: `${jobId}-${op.symbolRef}`,
      type: mapDrillType(op.drillType),
      position,
      diameter: op.diameter,
      depth: op.depth,
      face: 'TOP', // Default to top face (configurable later)
      panelId: op.panel,
      cycle,
      holeKind: mapHoleKind(op.drillType),
      feedRate: calculateFeedRate(op.diameter, op.drillType),
      rpm: calculateRPM(op.diameter),
      throughHole: false,
      label: op.notesTH ?? op.symbolRef,
      peckDepth: cycle === 'G83' ? 5 : undefined,
      dwellTime: cycle === 'G82' ? 0.5 : undefined,
    };

    points.push(point);

    // Update stats
    byType[op.drillType] = (byType[op.drillType] ?? 0) + 1;
    byPanel[op.panel] = (byPanel[op.panel] ?? 0) + 1;
  }

  return {
    points,
    stats: {
      totalPoints: points.length,
      byType,
      byPanel,
    },
    jobId,
  };
}

/**
 * Sync Designer Intent evaluation to CNC Overlay store.
 */
export function syncToCncOverlayStore(
  evaluation: { drilling: DrillingPlanPDF },
  cabinetDimensions: CabinetDimensions,
  setCncOverlay: (result: CncOverlayBuildResult) => void
): void {
  const result = convertDrillingPlanToCncOverlay(evaluation.drilling, {
    cabinetDimensions,
  });
  setCncOverlay(result);
}
