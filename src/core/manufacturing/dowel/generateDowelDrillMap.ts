/**
 * generateDowelDrillMap.ts — Dowel Drill Map Compiler MVP
 *
 * Generates DrillMap for standalone dowel joints (no Minifix).
 * MVP scope: single panel pair (A/B), System 32 placement.
 *
 * Construction: Side-covers-Top (European standard)
 * - Panel A (SIDE): FACE bore into inner face (depthFaceBore = 12mm)
 * - Panel B (HORIZONTAL): EDGE bore into end grain (depthEdgeBore = 18mm)
 *
 * Coordinate conventions (same as generateDrillMap.ts):
 * - World: X (left→right), Y (bottom→top), Z (back→front, front=maxZ)
 * - Panel-local: origin at front corner of machining face
 *
 * @version 1.0.0
 */

import type { Cabinet, CabinetPanel, PanelRole } from '../../types/Cabinet';
import type {
  DrillMap,
  DrillMapPanel,
  DrillMapPoint,
  Vec3Tuple,
  CornerType,
} from '../drillMap/types';
import {
  calculatePanelAABB,
  getPanelBasisFromAABB,
  buildSystem32PositionsAuto,
  vecAdd,
  vecMul,
  type PanelWorldBasis,
  type System32AutoParams,
} from '../drillMap/panelBasis';
import { buildDrillMapMeta } from '../drillMap/traceability';
import { dowelGuard } from './dowelGuard';
import type { DowelConfig, DowelDrillingParams } from './types';
import { DEFAULT_DOWEL_CONFIG, DEFAULT_DOWEL_DRILLING_PARAMS } from './types';

// ============================================================================
// Constants
// ============================================================================

const DRILL_MAP_VERSION = '1.0-dowel';

/** Point ID counter — reset per generation call for deterministic IDs */
let _pointIdCounter = 0;
function resetPointIdCounter(): void { _pointIdCounter = 0; }
function nextPointId(prefix: string): string { return `${prefix}-${++_pointIdCounter}`; }

// ============================================================================
// Panel Lookup
// ============================================================================

function buildPanelsByRole(panels: CabinetPanel[]): Partial<Record<PanelRole, CabinetPanel>> {
  const map: Partial<Record<PanelRole, CabinetPanel>> = {};
  for (const p of panels) {
    if (!map[p.role]) map[p.role] = p;
  }
  return map;
}

// ============================================================================
// Corner → Panel Pair Mapping (Side-covers-Top construction)
// ============================================================================

/**
 * For dowel joints, the SIDE panel gets FACE bores and the
 * HORIZONTAL panel gets EDGE bores (same as Minifix construction).
 */
function getDowelPanelRoles(corner: CornerType): {
  sidePanelRole: PanelRole;
  horizPanelRole: PanelRole;
} {
  const isTop = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';
  const isLeft = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';

  return {
    horizPanelRole: isTop ? 'TOP' : 'BOTTOM',
    sidePanelRole: isLeft ? 'LEFT_SIDE' : 'RIGHT_SIDE',
  };
}

// ============================================================================
// Dowel Position Calculator (Single Corner)
// ============================================================================

interface DowelPairPoints {
  /** Face bore on SIDE panel (into inner face) */
  sidePoint: DrillMapPoint;
  /** Edge bore on HORIZONTAL panel (into end grain) */
  horizPoint: DrillMapPoint;
}

/**
 * Calculate dowel drill points for one corner of the cabinet.
 *
 * For each System 32 position along the joint:
 * - SIDE panel: FACE bore at (edgeDistance from mating edge, sys32Z)
 * - HORIZ panel: EDGE bore at matching world position
 *
 * The mating edge of the SIDE panel is the top or bottom edge (Y-axis extent),
 * and edgeDistance is measured inward from that edge along the face.
 */
function calculateCornerDowels(
  corner: CornerType,
  sidePanel: CabinetPanel,
  horizPanel: CabinetPanel,
  sys32Positions: number[],
  config: DowelConfig,
  params: DowelDrillingParams,
): DowelPairPoints[] {
  const pairs: DowelPairPoints[] = [];

  const sideAabb = calculatePanelAABB(sidePanel);
  const horizAabb = calculatePanelAABB(horizPanel);
  const sideBasis = getPanelBasisFromAABB(sidePanel, sideAabb);
  const horizBasis = getPanelBasisFromAABB(horizPanel, horizAabb);

  const isTop = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';

  for (let i = 0; i < sys32Positions.length; i++) {
    const sys32Z = sys32Positions[i];
    const pairId = `dowel-${corner}-${i}`;

    // ── SIDE PANEL: FACE bore ──
    // localX = depth axis (front→back), localY = height axis (bottom→top)
    // sys32Z maps to localX on SIDE panel basis
    const sideLocalX = sys32Z; // Z position along depth

    // edgeDistance from mating edge (top or bottom of SIDE panel)
    // For TOP corner: mating edge is at localY = faceHeight (top)
    // For BOTTOM corner: mating edge is at localY = 0 (bottom)
    const sideLocalY = isTop
      ? sideBasis.faceHeight - params.edgeDistance
      : params.edgeDistance;

    const sideWorldPos = vecAdd(
      sideBasis.origin,
      vecAdd(
        vecMul(sideBasis.xAxis, sideLocalX),
        vecMul(sideBasis.yAxis, sideLocalY),
      ),
    );

    // Normal: into SIDE panel face (uAxis)
    const sideNormal = sideBasis.uAxis;

    const sidePoint: DrillMapPoint = {
      id: nextPointId('dowel-side'),
      panelId: sidePanel.id,
      position: sideWorldPos,
      normal: sideNormal,
      diameter: config.dowelDia,
      depth: config.depthFaceBore,
      purpose: 'DOWEL',
      componentType: 'DOWEL',
      status: 'VALID',
      pairId,
      edgeDistance: params.edgeDistance,
      depthPosition: sys32Z,
      cornerType: corner,
      face: isTop ? 'TOP' : 'BOTTOM',
      connectedPanelRole: sidePanel.role,
    };

    // ── HORIZONTAL PANEL: EDGE bore ──
    // localX = width axis (left→right), localY = depth axis (front→back)
    // The edge bore is on the end grain of the HORIZ panel.
    // For LEFT corners: bore into the left edge (localX = 0 side)
    // For RIGHT corners: bore into the right edge (localX = faceWidth side)
    const isLeft = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';

    // The HORIZ panel edge bore is positioned at the edge that mates with SIDE panel.
    // The drill enters from the end grain in the direction toward the SIDE panel.
    //
    // World position: align with the SIDE panel face bore position.
    // The edge bore Y coordinate = the mating boundary between panels.
    // The edge bore Z coordinate = sys32Z (same as side panel).
    // The edge bore X coordinate = edge of HORIZ panel (left or right).

    const horizLocalX = isLeft ? 0 : horizBasis.faceWidth;
    const horizLocalY = sys32Z; // System 32 position along depth

    const horizWorldPos = vecAdd(
      horizBasis.origin,
      vecAdd(
        vecMul(horizBasis.xAxis, horizLocalX),
        vecMul(horizBasis.yAxis, horizLocalY),
      ),
    );

    // Normal for EDGE bore: into the end grain of the HORIZONTAL panel
    // For LEFT: drill goes +X (into left end grain toward right)
    // For RIGHT: drill goes -X (into right end grain toward left)
    const horizNormal: Vec3Tuple = isLeft ? [1, 0, 0] : [-1, 0, 0];

    const horizPoint: DrillMapPoint = {
      id: nextPointId('dowel-horiz'),
      panelId: horizPanel.id,
      position: horizWorldPos,
      normal: horizNormal,
      diameter: config.dowelDia,
      depth: config.depthEdgeBore,
      purpose: 'DOWEL',
      componentType: 'DOWEL',
      status: 'VALID',
      pairId,
      edgeDistance: params.edgeDistance,
      depthPosition: sys32Z,
      cornerType: corner,
      face: isLeft ? 'LEFT' : 'RIGHT',
      connectedPanelRole: horizPanel.role,
    };

    pairs.push({ sidePoint, horizPoint });
  }

  return pairs;
}

// ============================================================================
// Empty DrillMap Factory
// ============================================================================

function createEmptyDrillMap(cabinetId: string): DrillMap {
  return {
    cabinetId,
    version: DRILL_MAP_VERSION,
    generatedAt: new Date().toISOString(),
    panels: [],
    stats: {
      totalDrills: 0,
      totalBores: 0,
      byPurpose: { DOWEL: 0 },
    },
  };
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Generate standalone dowel drill map for a cabinet.
 *
 * MVP scope: processes all 4 corners (TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT).
 * Each corner produces paired FACE bore (SIDE) + EDGE bore (HORIZ) points.
 *
 * @param cabinet - Cabinet with panels
 * @param config - Partial DowelConfig overrides (manufacturing truth only)
 * @param params - Drilling parameters (optional)
 * @param options - Generation options
 * @returns DrillMap with all dowel drill points
 */
export function generateDowelDrillMap(
  cabinet: Cabinet,
  config?: Partial<DowelConfig>,
  params?: Partial<DowelDrillingParams>,
  options?: {
    /** Override number of dowels per corner. null = auto */
    dowelCount?: number;
    /** Restrict to specific corners. Default: all 4 */
    corners?: CornerType[];
  },
): DrillMap {
  if (!cabinet || !cabinet.panels || cabinet.panels.length === 0) {
    return createEmptyDrillMap(cabinet?.id || 'unknown');
  }

  // Reset point ID counter for deterministic IDs
  resetPointIdCounter();

  // Merge defaults
  const fullConfig: DowelConfig = { ...DEFAULT_DOWEL_CONFIG, ...(config ?? {}) };
  const fullParams: DowelDrillingParams = { ...DEFAULT_DOWEL_DRILLING_PARAMS, ...(params ?? {}) };

  // DEV-ONLY: Guard — preview-only keys must never reach the compiler
  dowelGuard.assertClean(fullConfig as unknown as Record<string, unknown>, 'generateDowelDrillMap');

  // Traceability: hash inputs for audit trail
  const meta = buildDrillMapMeta({
    generatorName: 'generateDowelDrillMap',
    fullConfig: fullConfig as unknown as Record<string, unknown>,
    fullParams: fullParams as unknown as Record<string, unknown>,
  });

  // Build panel lookup
  const panelsByRole = buildPanelsByRole(cabinet.panels);

  // Determine System 32 run length from TOP or BOTTOM panel
  const topPanel = panelsByRole['TOP'];
  const bottomPanel = panelsByRole['BOTTOM'];
  let sys32RunLength = 500; // fallback

  if (topPanel) {
    const topAabb = calculatePanelAABB(topPanel);
    sys32RunLength = topAabb.max[2] - topAabb.min[2]; // Z span
  } else if (bottomPanel) {
    const bottomAabb = calculatePanelAABB(bottomPanel);
    sys32RunLength = bottomAabb.max[2] - bottomAabb.min[2];
  }

  // Calculate System 32 positions
  const sys32Params: System32AutoParams = {
    firstHole: fullParams.firstHoleZ,
    pitch: fullConfig.pitch,
    endOffset: fullConfig.endOffset,
    maxConnectors: options?.dowelCount ?? undefined,
  };
  const sys32Positions = buildSystem32PositionsAuto(sys32RunLength, sys32Params);

  // Corners to process
  const corners: CornerType[] = options?.corners ?? ['TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'];

  // Collect all drill points per panel
  const panelPointsMap = new Map<string, DrillMapPoint[]>();
  let totalDowels = 0;

  for (const corner of corners) {
    const { sidePanelRole, horizPanelRole } = getDowelPanelRoles(corner);
    const sidePanel = panelsByRole[sidePanelRole];
    const horizPanel = panelsByRole[horizPanelRole];

    if (!sidePanel || !horizPanel) continue;

    const pairs = calculateCornerDowels(
      corner, sidePanel, horizPanel, sys32Positions, fullConfig, fullParams,
    );

    for (const { sidePoint, horizPoint } of pairs) {
      // Side panel points
      if (!panelPointsMap.has(sidePanel.id)) panelPointsMap.set(sidePanel.id, []);
      panelPointsMap.get(sidePanel.id)!.push(sidePoint);

      // Horiz panel points
      if (!panelPointsMap.has(horizPanel.id)) panelPointsMap.set(horizPanel.id, []);
      panelPointsMap.get(horizPanel.id)!.push(horizPoint);

      totalDowels += 2;
    }
  }

  // Build DrillMapPanel array
  const drillMapPanels: DrillMapPanel[] = [];

  for (const panel of cabinet.panels) {
    const points = panelPointsMap.get(panel.id);
    if (!points || points.length === 0) continue;

    const aabb = calculatePanelAABB(panel);

    drillMapPanels.push({
      panelId: panel.id,
      role: panel.role,
      cabinetId: cabinet.id,
      dimensions: {
        width: panel.finishWidth,
        height: panel.finishHeight,
        thickness: panel.computed.realThickness,
      },
      worldPosition: panel.position,
      worldRotation: panel.rotation,
      points,
    });
  }

  // Build DrillMap
  const drillMap: DrillMap = {
    cabinetId: cabinet.id,
    version: DRILL_MAP_VERSION,
    generatedAt: new Date().toISOString(),
    panels: drillMapPanels,
    stats: {
      totalDrills: totalDowels,
      totalBores: 0,
      byPurpose: { DOWEL: totalDowels },
    },
    meta,
  };

  return drillMap;
}
