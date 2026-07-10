/**
 * generateDrillMap.ts - v4.0
 *
 * Deterministic Minifix S200 drill map generation using AABB-based panel basis.
 * Based on Häfele specifications and System 32.
 *
 * v4.0 MAJOR REFACTOR - SIDE-COVERS-TOP CONSTRUCTION:
 * - BOLT: Changed from EDGE drilling to FACE drilling on SIDE panels
 * - BOLT_ENTRY: Added edge bore on TOP/BOTTOM for bolt shaft passage
 * - DOWEL: Swapped depths (SIDE=11mm face, HORIZ=19mm edge)
 *
 * CONSTRUCTION TYPE: "Side-covers-Top/Bottom" (European/System32 Standard)
 * - SIDE panels cover the ends of TOP/BOTTOM panels
 * - BOLT shaft passes THROUGH TOP/BOTTOM edge bore → engages CAM in face
 * - This is the standard Häfele Minifix S200 configuration
 *
 * v3.5 (superseded):
 * - Used "Top-on-Side" construction (incorrect for standard Minifix)
 * - BOLT drilled into SIDE panel EDGE (Y-axis)
 *
 * COORDINATE CONVENTIONS:
 * - World: X (left→right), Y (bottom→top), Z (back→front, front=maxZ)
 * - Panel-local: origin at front corner of machining face
 *
 * DRILLING PATTERN (v4.0 Side-covers-Top):
 *   Corner        CAM Panel   BOLT Panel   BOLT_ENTRY    BOLT Drill Direction
 *   TOP_LEFT      TOP         LEFT_SIDE    TOP           LEFT (-X) into side face
 *   TOP_RIGHT     TOP         RIGHT_SIDE   TOP           RIGHT (+X) into side face
 *   BOTTOM_LEFT   BOTTOM      LEFT_SIDE    BOTTOM        LEFT (-X) into side face
 *   BOTTOM_RIGHT  BOTTOM      RIGHT_SIDE   BOTTOM        RIGHT (+X) into side face
 *
 * G11 POLICY LOCK (Häfele Standards):
 * | Item             | Value                    |
 * |------------------|--------------------------|
 * | CAM              | Ø15 (face bore on HORIZ) |
 * | Bolt sleeve      | Ø10 (face bore on SIDE)  |
 * | Bolt entry       | config.boltEntryDia ?? 7.5 (edge bore on HORIZ) |
 * | Dowel SIDE       | Ø8, 11mm (FACE_BORE)     |
 * | Dowel HORIZONTAL | Ø8, 19mm (EDGE_BORE)     |
 * | Distance B       | 24mm from MATING EDGE    |
 * | Spacing          | System32                 |
 * | Mating Tolerance | 0.1mm                    |
 */

import { getSpreadGridPositions } from '../../connector/placer';
import type { Cabinet, CabinetPanel, PanelRole, JointType, ShelfConnectorConfig, BackPanelConnectorConfig } from '../../types/Cabinet';
import { DEFAULT_SHELF_CONNECTOR_CONFIG, DEFAULT_BACK_PANEL_CONNECTOR_CONFIG } from '../../types/Cabinet';
import type {
  DrillMap,
  DrillMapPanel,
  DrillMapPoint,
  MinifixConfig,
  DrillingParams,
  Vec3Tuple,
  DrillPurpose,
  CornerType,
  ShelfCornerType,
  BackCornerType,
} from './types';
import { DEFAULT_DRILLING_PARAMS, isShelfCorner } from './types';
import { resolveSeamDrivenTwist } from '../hardware/boltOrientationPolicy';
import {
  validateCornerAngle,
  calculateAngledDistanceB,
  isRightAngle,
} from './angledCornerGeometry';
import {
  calculatePanelAABB,
  getPanelBasisFromAABB,
  panelLocalToWorld,
  buildDowelXPositions,
  clamp,
  vecMul,
  vecAdd,
  vecSub,
  vecNorm,
  vecLen,
  boltEdgePointFromSideAABB,
  boltFacePointFromSideAABB_v4,
  boltEntryEdgePointFromHorizAABB,
  boltFacePointFromHorizAABB_overlay,
  boltEntryEdgePointFromSideAABB_overlay,
  camFacePointFromSideAABB_overlay,
  boltFacePointFromBackAABB,
  boltEntryEdgePointFromSideAABB_back,
  camFacePointFromSideAABB_back,
  type PanelWorldBasis,
  type Box3Like,
  type System32AutoParams,
} from './panelBasis';
import { validateBoltPocketLinkage } from './validateBoltPocketLinkage';
import { validateBRunDowelPairing } from './validateBRunDowelPairing';
import {
  assertNoPreviewKeys,
  sanitizeManufacturingConfig,
} from '../../../components/ui/MinifixConfigPanel';
import { buildDrillMapMeta } from './traceability';
import { buildPairKeyV2 } from './pairKeyV2';
import { lookupHardwareCatalog } from './hardwareCatalog';

// ============================================
// CONSTANTS
// ============================================

const DRILL_MAP_VERSION = '4.0';
const VALID_DRILLING_DISTANCE_B = [24, 34] as const;

/**
 * Maximum allowable mating misalignment (mm)
 * Per G11 Häfele standard: 0.1mm tolerance
 */
const MATING_THRESHOLD = 0.1;

/**
 * Compute connector count from side run length using the CAD threshold rule.
 *
 * CAD baseline:
 * - sideLen <= 400mm -> CORNER + CORNER (2 placements)
 * - sideLen > 400mm  -> CORNER + MIDDLE + CORNER (3 placements)
 *
 * @param faceWidth - Cabinet run length along the connector axis (mm)
 * @returns Number of Minifix placements per corner run
 */
export function computeConnectorCount(faceWidth: number): number {
  return faceWidth > 400 ? 3 : 2;
}

/**
 * Connector density profile (ADR-061 มติ owner 10 ก.ค. 2026):
 * ให้ผู้ใช้เลือกความถี่ Minifix เพื่อตัดสินใจกับลูกค้า
 * - CAD_STANDARD: กติกา CAD เดิม (≤400→2, >400→3) — ประหยัดฮาร์ดแวร์
 * - AWI_PREMIUM: ช่วงห่าง ≤128mm ตามมาตรฐาน AWI Premium — แข็งแรงขึ้น แลกต้นทุน
 */
export type ConnectorDensity = 'CAD_STANDARD' | 'AWI_PREMIUM';

/** AWI Premium: ระยะห่าง connector สูงสุด (mm) */
export const AWI_MAX_SPACING_MM = 128;

/**
 * จำนวน connector ตาม density profile —
 * AWI: อย่างน้อยเท่ากติกา CAD และพอให้ gap บนช่วง near..far ไม่เกิน 128mm
 * (near/far ใช้ margin เดียวกับ buildCadConnectorRunPositions เพื่อให้ตำแหน่งสอดคล้อง)
 */
export function computeConnectorCountForDensity(
  runLength: number,
  firstHole: number,
  density: ConnectorDensity,
): number {
  const base = computeConnectorCount(runLength);
  if (density !== 'AWI_PREMIUM') return base;

  const margin = Math.min(firstHole, Math.max(10, runLength / 2));
  const span = Math.max(0, runLength - margin * 2);
  if (span <= 0) return base;
  const awiCount = Math.ceil(span / AWI_MAX_SPACING_MM) + 1;
  return Math.max(base, awiCount);
}

/**
 * Build CAD-aligned connector positions for the run axis.
 *
 * This replaces generic "first N System32 holes" behavior in the production
 * drill-map path. We still keep the first-hole setback (typically 37mm), but
 * for >400mm runs we place the middle connector at the geometric center so the
 * pattern stays symmetric.
 */
function buildCadConnectorRunPositions(
  runLength: number,
  firstHole: number,
  connectorCount: number
): number[] {
  const margin = Math.min(firstHole, Math.max(10, runLength / 2));
  const near = margin;
  const far = Math.max(near, runLength - margin);

  if (connectorCount <= 1) {
    return [runLength / 2];
  }

  if (connectorCount === 2) {
    // For very short runs avoid duplicate points.
    return far > near ? [near, far] : [runLength / 2];
  }

  // For 3+: distribute evenly between near and far
  // e.g. count=3 → [near, center, far]
  //      count=4 → [near, near+1/3*(far-near), near+2/3*(far-near), far]
  //      count=5 → [near, near+1/4*span, near+2/4*span, near+3/4*span, far]
  const span = far - near;
  const positions: number[] = [];
  for (let i = 0; i < connectorCount; i++) {
    positions.push(near + (i / (connectorCount - 1)) * span);
  }

  // Deduplicate positions too close together (<1mm)
  return positions.filter(
    (pos, idx, arr) => idx === 0 || Math.abs(pos - arr[idx - 1]) > 0.5
  );
}

/** Default Minifix S200 config for 18mm panels (project default) */
/**
 * สเปค corner dowel (single source — worldSynthesis อ้างตัวเดียวกัน, ADR-061c)
 * split 30mm: ฝั่ง face 12 + ฝั่ง edge 18 (Häfele Ø8×30)
 */
export const CORNER_DOWEL_SPEC = {
  dia: 8,
  sideFaceDepth: 12,
  horizEdgeDepth: 18,
  offset: 32,
} as const;

const DEFAULT_MINIFIX_CONFIG: MinifixConfig = {
  minifixType: '15',
  drillingDistanceB: 24,  // Distance B = 24mm per CAD reference (Minifix 12 / Indetails standard)
  woodThickness: 18,      // Project default: 18mm
  // Ball Head
  ballHeadDia: 6.5,       // Ø6.5mm per Häfele catalog
  ballHeadOffset: 0,
  // Neck Shaft
  neckShaftDia: 6.5,
  neckShaftLength: 6.5,
  neckShaftOffset: 0,
  // Sleeve (BOLT hole)
  sleeveDia: 10,
  sleeveLength: 17.5,
  sleeveOffset: 0,
  boltEntryDia: 7.5,          // Ø7.5mm entry bore (bolt passage, smaller than sleeve)
  // Shaft
  shaftDia: 5,
  shaftLength: 11,
  shaftOffset: 0,
  // Cam (CAM_LOCK hole)
  camDia: 15,
  camDepth: 13.5,       // 13.5mm for 18mm wood per Häfele FF 3.10
  camHeight: 9, // dimA (18mm wood)
  camRimDia: 18,
  camRimHeight: 2,
  camOffset: 0,
  // Dowel (enabled per CAD reference - System 32 offset)
  includeDowel: true,
  dowelDia: CORNER_DOWEL_SPEC.dia,
  dowelLength: 30,        // Total length (12 + 18 = 30mm)
  dowelOffset: CORNER_DOWEL_SPEC.offset,
  // v4.0 Split depth for Side-covers-Top construction:
  // - SIDE panel: FACE bore (shallow, same side as bolt thread L)
  // - HORIZ panel: EDGE bore (deeper, same side as Cam + bolt entry B)
  dowelDepthSideFace: CORNER_DOWEL_SPEC.sideFaceDepth,
  dowelDepthHorizEdge: CORNER_DOWEL_SPEC.horizEdgeDepth,
  // Legacy fields (for backward compatibility, same as v3.5 naming)
  dowelDepthEdge: 18,       // @deprecated - use dowelDepthHorizEdge
  dowelDepthFace: 12,       // @deprecated - use dowelDepthSideFace
};

/** System 32 parameters */
const SYSTEM32: System32AutoParams = {
  firstHole: 50,      // First hole from front edge (mm)
  pitch: 32,          // Distance between holes (mm)
  endOffset: 40,      // Distance from end edge (mm)
  maxConnectors: undefined, // No limit - auto-calculate based on run length
};

// ============================================
// STABLE POINT ID GENERATION
// ============================================

const pointIdCounters = new Map<string, number>();

function generatePointId(purpose: string, cornerType?: CornerType): string {
  const key = cornerType ? `${purpose}-${cornerType}` : purpose;
  const currentIndex = pointIdCounters.get(key) || 0;
  pointIdCounters.set(key, currentIndex + 1);

  if (cornerType) {
    return `${purpose}-${cornerType}-${currentIndex}`;
  }
  return `${purpose}-${currentIndex}`;
}

function resetPointIdCounter(): void {
  pointIdCounters.clear();
}

// ============================================
// EMPTY DRILL MAP FACTORY
// ============================================

export function createEmptyDrillMap(cabinetId: string): DrillMap {
  return {
    cabinetId,
    version: DRILL_MAP_VERSION,
    generatedAt: Date.now(),
    panels: [],
    stats: {
      totalDrills: 0,
      totalBores: 0,
      byPurpose: {
        CAM_LOCK: 0,
        BOLT: 0,
        DOWEL: 0,
        SHELF_PIN: 0,
        HINGE: 0,
        MINIFIX: 0,
        OTHER: 0,
      },
    },
  };
}

// ============================================
// PANEL SELECTION HELPERS
// ============================================

type PanelsByRole = Partial<Record<PanelRole, CabinetPanel>>;

function buildPanelsByRole(panels: CabinetPanel[]): PanelsByRole {
  const map: PanelsByRole = {};
  for (const panel of panels) {
    map[panel.role] = panel;
  }
  return map;
}

/**
 * Get the correct panels for a corner joint.
 *
 * CRITICAL: CAM goes on HORIZONTAL panel, BOLT goes on VERTICAL panel
 * - TOP_LEFT: CAM→TOP, BOLT→LEFT_SIDE
 * - TOP_RIGHT: CAM→TOP, BOLT→RIGHT_SIDE
 * - BOTTOM_LEFT: CAM→BOTTOM, BOLT→LEFT_SIDE
 * - BOTTOM_RIGHT: CAM→BOTTOM, BOLT→RIGHT_SIDE
 */
function getCornerPanels(
  corner: CornerType,
  panelsByRole: PanelsByRole
): { horizontal: CabinetPanel | undefined; vertical: CabinetPanel | undefined } {
  const isTop = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';
  const isLeft = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';

  const horizontalRole: PanelRole = isTop ? 'TOP' : 'BOTTOM';
  const verticalRole: PanelRole = isLeft ? 'LEFT_SIDE' : 'RIGHT_SIDE';

  return {
    horizontal: panelsByRole[horizontalRole],  // CAM goes here (face drilling)
    vertical: panelsByRole[verticalRole],      // BOLT goes here (edge drilling)
  };
}

// ============================================
// COORDINATE MAPPING - HORIZONTAL PANELS (TOP/BOTTOM)
// ============================================

/**
 * Convert corner + System32 position to panel-local (x, y) for TOP/BOTTOM panels.
 *
 * For TOP/BOTTOM machining face:
 * - localX = left → right (cabinet width direction)
 * - localY = front → back (cabinet depth direction, System32 axis)
 *
 * @param faceW - Face width (cabinet width, X span)
 * @param faceH - Face height (cabinet depth, Z span)
 * @param corner - Corner type
 * @param endOffset - Distance from left/right edge (typically 40mm)
 * @param sys32Z - System 32 position from front (50, 82, 114, ...)
 */
function cornerToLocalXY_TopBottom(
  faceW: number,
  faceH: number,
  corner: CornerType,
  endOffset: number,
  sys32Z: number
): { x: number; y: number } {
  const isLeft = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';

  // x: measured from LEFT edge of face
  const x = isLeft ? endOffset : (faceW - endOffset);

  // y: measured from FRONT edge (System32 position)
  const y = sys32Z;

  return { x, y };
}

// ============================================
// COORDINATE MAPPING - VERTICAL PANELS (LEFT_SIDE/RIGHT_SIDE)
// ============================================

/**
 * Convert corner + System32 position to panel-local (x, y) for SIDE panels.
 *
 * For SIDE panel machining face:
 * - localX = front → back (cabinet depth direction, System32 axis)
 * - localY = bottom → top (cabinet height direction)
 *
 * @param faceW - Face width (cabinet depth, Z span)
 * @param faceH - Face height (cabinet height, Y span)
 * @param corner - Corner type
 * @param endOffset - Distance from top/bottom edge (typically 40mm)
 * @param sys32Z - System 32 position from front (50, 82, 114, ...)
 */
function cornerToLocalXY_Side(
  faceW: number,
  faceH: number,
  corner: CornerType,
  endOffset: number,
  sys32Z: number
): { x: number; y: number } {
  const isTop = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';

  // x: along depth (System32 axis, front->back)
  const x = sys32Z;

  // y: measured from BOTTOM edge of face
  const y = isTop ? (faceH - endOffset) : endOffset;

  return { x, y };
}

// ============================================
// DRILL POINT CREATION
// ============================================

interface CreateDrillPointParams {
  panelId: string;
  position: Vec3Tuple;
  normal: Vec3Tuple;
  diameter: number;
  depth: number;
  purpose: DrillPurpose;
  pairId: string;
  pairKeyV2?: string;  // Content-addressed key (v2)
  edgeDistance: number;
  depthPosition: number;
  cornerType: CornerType;
  cornerAngleDeg?: number;  // Corner angle in degrees (for angled joints)
  connectedPanelRole?: string;  // Panel role (LEFT_SIDE, RIGHT_SIDE, TOP, BOTTOM)
  specLength?: number;  // Display-only: total component length (e.g. dowelLength=30)
  hardwareName?: string;   // Catalog hardware name
  catalogNo?: string;      // Catalog part number
}

function createDrillPoint(params: CreateDrillPointParams): DrillMapPoint {
  return {
    id: generatePointId(params.purpose.toLowerCase(), params.cornerType),
    panelId: params.panelId,
    position: params.position,
    positionBase: [...params.position],
    normal: params.normal,
    diameter: params.diameter,
    depth: params.depth,
    specLength: params.specLength,
    purpose: params.purpose,
    componentType:
      params.purpose === 'CAM_LOCK'
        ? 'HOUSING'
        : params.purpose === 'BOLT' || params.purpose === 'BOLT_ENTRY' || params.purpose === 'BOLT_THREAD'
          ? 'BOLT'
        : params.purpose === 'DOWEL'
            ? 'DOWEL'
            : 'OTHER',
    status: 'VALID',
    pairId: params.pairId,
    pairKeyV2: params.pairKeyV2,
    edgeDistance: params.edgeDistance,
    depthPosition: params.depthPosition,
    cornerType: params.cornerType,
    cornerAngleDeg: params.cornerAngleDeg,  // Store corner angle for reference
    connectedPanelRole: params.connectedPanelRole,  // G11.5: Required for panel role inference
    hardwareName: params.hardwareName,
    catalogNo: params.catalogNo,
  };
}

// ============================================
// SINGLE CORNER JOINT GENERATION
// ============================================

interface CornerJointResult {
  camPoint: DrillMapPoint | null;
  boltPoint: DrillMapPoint | null;
  boltEntryPoint: DrillMapPoint | null;
  boltThreadPoint: DrillMapPoint | null;
  dowelPoints: DrillMapPoint[];
}

/**
 * Generate all drill points for a single corner at a specific System32 position.
 *
 * CRITICAL: This generates 2 points on 2 DIFFERENT panels:
 * - CAM → horizontal panel (TOP or BOTTOM) face drilling
 * - BOLT → vertical panel (LEFT_SIDE or RIGHT_SIDE) edge drilling
 *
 * @param corner - Corner type
 * @param sys32Z - System 32 position from front (e.g., 50, 82, 114, ...)
 * @param positionIndex - Index for unique ID generation
 * @param panelsByRole - Panel lookup map
 * @param config - Minifix config
 * @param params - Drilling parameters
 */
function generateCornerJointPoints(
  corner: CornerType,
  sys32Z: number,
  positionIndex: number,
  panelsByRole: PanelsByRole,
  config: MinifixConfig,
  params: DrillingParams,
  angleDeg = 90,  // Corner angle in degrees (30-150, default 90)
  jointMode: JointType = 'INSET'  // Joint construction type
): CornerJointResult {
  const result: CornerJointResult = {
    camPoint: null,
    boltPoint: null,
    boltEntryPoint: null,
    boltThreadPoint: null,
    dowelPoints: [],
  };

  // ========================================
  // VALIDATE CORNER ANGLE
  // ========================================
  const angleValidation = validateCornerAngle(angleDeg);
  if (!angleValidation.valid) {
    console.warn(`[DrillMap] Invalid corner angle for ${corner}: ${angleValidation.message}`);
    return result;
  }
  if (angleValidation.warning) {
    console.warn(`[DrillMap] Corner angle warning for ${corner}: ${angleValidation.message}`);
  }

  // Calculate adjusted Distance B for non-90° angles
  const effectiveDistanceB = isRightAngle(angleDeg)
    ? config.drillingDistanceB
    : calculateAngledDistanceB(config.drillingDistanceB, angleDeg);

  // Get target panels for this corner
  const { horizontal, vertical } = getCornerPanels(corner, panelsByRole);

  if (!horizontal || !vertical) {
    console.warn(`[DrillMap] Missing panels for corner ${corner}`);
    return result;
  }

  const pairId = `pair-${corner}-${positionIndex}`;
  const pairKeyV2 = buildPairKeyV2(corner, sys32Z);

  const verticalAabb = calculatePanelAABB(vertical);
  const horizontalAabb = calculatePanelAABB(horizontal);
  const isTopCorner = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';
  const isLeftSide = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';

  // ========================================
  // OVERLAY BRANCH — Top/Bottom covers Side
  // ========================================
  if (jointMode === 'OVERLAY') {
    // OVERLAY construction: bolt/cam panels SWAP
    // - BOLT: face bore into HORIZONTAL panel (±Y drilling axis)
    // - CAM: face bore into SIDE panel inner face (±X drilling axis)
    // - BOLT_ENTRY: edge bore into SIDE panel top/bottom edge (±Y axis)

    // Joint axis X = side panel thickness center (all horiz-panel points share this axis)
    const jointAxisX = (verticalAabb.min[0] + verticalAabb.max[0]) / 2;

    // --- BOLT on HORIZONTAL panel face ---
    const boltPoint = boltFacePointFromHorizAABB_overlay(
      corner, horizontalAabb, sys32Z, effectiveDistanceB
    );
    // Override X to use joint axis (side panel thickness center)
    boltPoint.position[0] = jointAxisX;

    const boltPanelRole = isTopCorner ? 'TOP' : 'BOTTOM';
    result.boltPoint = createDrillPoint({
      panelId: horizontal.id,
      position: boltPoint.position,
      normal: boltPoint.normal,
      diameter: config.sleeveDia,
      depth: config.boltBoreDepth ?? 17.5,  // Häfele S200: 17.5mm (NOT sleeveLength which is assembly 14.25mm)
      purpose: 'BOLT',
      pairId,
      pairKeyV2,
      edgeDistance: effectiveDistanceB,
      depthPosition: sys32Z,
      cornerType: corner,
      cornerAngleDeg: angleDeg,
      connectedPanelRole: boltPanelRole,
    });

    // --- BOLT_THREAD on HORIZONTAL panel (same position as BOLT) ---
    result.boltThreadPoint = createDrillPoint({
      panelId: horizontal.id,
      position: boltPoint.position,
      normal: boltPoint.normal,
      diameter: config.shaftDia,
      depth: config.shaftLength,
      purpose: 'BOLT_THREAD',
      pairId,
      pairKeyV2,
      edgeDistance: effectiveDistanceB,
      depthPosition: sys32Z,
      cornerType: corner,
      cornerAngleDeg: angleDeg,
      connectedPanelRole: boltPanelRole,
    });

    // --- BOLT_ENTRY on SIDE panel edge (top/bottom edge) ---
    const edgeEntryPoint = boltEntryEdgePointFromSideAABB_overlay(
      corner, verticalAabb, sys32Z, effectiveDistanceB
    );
    const entryPanelRole = isLeftSide ? 'LEFT_SIDE' : 'RIGHT_SIDE';
    result.boltEntryPoint = createDrillPoint({
      panelId: vertical.id,
      position: edgeEntryPoint.position,
      normal: edgeEntryPoint.normal,
      diameter: config.boltEntryDia ?? 7.5,
      depth: effectiveDistanceB,
      purpose: 'BOLT_ENTRY',
      pairId,
      pairKeyV2,
      edgeDistance: effectiveDistanceB,
      depthPosition: sys32Z,
      cornerType: corner,
      cornerAngleDeg: angleDeg,
      connectedPanelRole: entryPanelRole,
    });

    // --- CAM on SIDE panel inner face ---
    const camPoint = camFacePointFromSideAABB_overlay(
      corner, verticalAabb, sys32Z, effectiveDistanceB
    );
    const camPanelRole = isLeftSide ? 'LEFT_SIDE' : 'RIGHT_SIDE';
    result.camPoint = createDrillPoint({
      panelId: vertical.id,
      position: camPoint.position,
      normal: camPoint.normal,
      diameter: config.camDia,
      depth: config.camDepth,
      purpose: 'CAM_LOCK',
      pairId,
      pairKeyV2,
      edgeDistance: effectiveDistanceB,
      depthPosition: sys32Z,
      cornerType: corner,
      cornerAngleDeg: angleDeg,
      connectedPanelRole: camPanelRole,
    });

    // --- CAM ↔ BOLT Linkage ---
    if (result.camPoint && result.boltPoint) {
      result.camPoint.pairedHoleId = result.boltPoint.id;
      result.boltPoint.pairedHoleId = result.camPoint.id;
      if (result.boltEntryPoint) result.boltEntryPoint.pairedHoleId = result.boltPoint.id;
      if (result.boltThreadPoint) result.boltThreadPoint.pairedHoleId = result.boltPoint.id;

      // Pocket center: offset from CAM position along CAM normal by side panel thickness/2
      const sideThicknessHalf = Math.abs(verticalAabb.max[0] - verticalAabb.min[0]) / 2;
      const camPos = result.camPoint.position;
      const camNormal = result.camPoint.normal;
      const camPocketCenter: Vec3Tuple = [
        camPos[0] + camNormal[0] * sideThicknessHalf,
        camPos[1] + camNormal[1] * sideThicknessHalf,
        camPos[2] + camNormal[2] * sideThicknessHalf,
      ];
      result.boltPoint.targetPocketCenter = camPocketCenter;

      const boltPos = result.boltPoint.position;
      const boltDrillingAxis = result.boltPoint.normal;
      result.boltPoint.boltDirection = vecNorm(vecSub(camPocketCenter, boltPos));

      // OVERLAY twist: boltPanelNormal = horizontal panel face normal (±Y)
      const boltPanelNormal = isTopCorner
        ? { x: 0, y: -1, z: 0 }   // TOP panel: normal pointing down (toward side)
        : { x: 0, y: 1, z: 0 };   // BOTTOM panel: normal pointing up (toward side)

      const twistResult = resolveSeamDrivenTwist({
        jointPosition: isTopCorner ? 'TOP' : 'BOTTOM',
        jointMode: 'OVERLAY',
        panelSide: isLeftSide ? 'LEFT' : 'RIGHT',
        cornerType: corner,
        boltDir: {
          x: boltDrillingAxis[0],
          y: boltDrillingAxis[1],
          z: boltDrillingAxis[2],
        },
        boltPanelNormal,
        position: {
          x: boltPos[0],
          y: boltPos[1],
          z: boltPos[2],
        },
        targetPocketCenter: {
          x: camPocketCenter[0],
          y: camPocketCenter[1],
          z: camPocketCenter[2],
        },
      });
      result.boltPoint.boltTwistDeg = twistResult.twistDeg;
    }

    // --- OVERLAY DOWELS ---
    // OVERLAY swaps depths: SIDE=edge bore 19mm, HORIZONTAL=face bore 11mm
    if (config.includeDowel) {
      const [, , maxZ] = verticalAabb.max;

      // Edge margin = firstHoleZ so dowels don't get placed closer to panel edge than the bolt.
      // CAD reference: dowels only on CENTER side of each bolt, not toward the edge.
      // e.g., bolt at 50mm → dowel at 82mm (50+32) only, NOT at 18mm (50-32)
      const overlayEdgeMargin = params.firstHoleZ ?? 37;
      const dowelZPositions = [
        maxZ - sys32Z - config.dowelOffset,
        maxZ - sys32Z + config.dowelOffset,
      ].filter(z => z >= verticalAabb.min[2] + overlayEdgeMargin && z <= verticalAabb.max[2] - overlayEdgeMargin);

      // DOWEL on SIDE panel EDGE (top/bottom edge bore) — 19mm depth
      for (const dowelZ of dowelZPositions) {
        const sideDowelPos: Vec3Tuple = [
          edgeEntryPoint.position[0],  // X = side panel thickness center
          edgeEntryPoint.position[1],  // Y = top/bottom edge
          dowelZ,
        ];
        const sideDowelNormal: Vec3Tuple = isTopCorner ? [0, -1, 0] : [0, 1, 0];

        result.dowelPoints.push(createDrillPoint({
          panelId: vertical.id,
          position: sideDowelPos,
          normal: sideDowelNormal,
          diameter: config.dowelDia,
          depth: config.dowelDepthHorizEdge ?? 19,  // Edge bore = deeper (19mm)
          specLength: config.dowelLength,
          purpose: 'DOWEL',
          pairId: `${pairId}-dowel-side`,
          pairKeyV2: `${pairKeyV2}-dowel-side`,
          edgeDistance: effectiveDistanceB,
          depthPosition: sys32Z,
          cornerType: corner,
          connectedPanelRole: isLeftSide ? 'LEFT_SIDE' : 'RIGHT_SIDE',
        }));
      }

      // DOWEL on HORIZONTAL panel FACE (face bore) — 11mm depth
      for (const dowelZ of dowelZPositions) {
        const horizDowelPos: Vec3Tuple = [
          boltPoint.position[0],  // X = joint axis (side panel thickness center)
          boltPoint.position[1],  // Y = horizontal panel face
          dowelZ,
        ];

        result.dowelPoints.push(createDrillPoint({
          panelId: horizontal.id,
          position: horizDowelPos,
          normal: boltPoint.normal,  // Same drilling direction as BOLT (±Y)
          diameter: config.dowelDia,
          depth: config.dowelDepthSideFace ?? 11,  // Face bore = shallower (11mm)
          specLength: config.dowelLength,
          purpose: 'DOWEL',
          pairId: `${pairId}-dowel-horiz`,
          pairKeyV2: `${pairKeyV2}-dowel-horiz`,
          edgeDistance: effectiveDistanceB,
          depthPosition: sys32Z,
          cornerType: corner,
          connectedPanelRole: isTopCorner ? 'TOP' : 'BOTTOM',
        }));
      }
    }

    // NOTE: Hardware catalog enrichment is done centrally in generateMinifixDrillMap()
    // after all points are collected, so ALL branches (OVERLAY, INSET, shelf, B-run, back) get enriched.

    return result;
  }

  // ========================================
  // INSET BRANCH — Side covers Top/Bottom (v4.0)
  // ========================================

  // ========================================
  // BOLT POINT on VERTICAL panel (FACE drilling) - v4.0
  // ========================================
  // v4.0 Side-covers-Top construction:
  // BOLT is drilled INTO the INNER FACE of the SIDE panel (face bore)
  // The bolt shaft passes through an edge bore in the TOP/BOTTOM panel
  // CRITICAL: Calculate BOLT first, then align CAM with BOLT position

  // Use v4.0 face drilling function
  // MERGED FIX (wonderful-leakey + keen-jepsen):
  // - matingSurfaceY = real world Y from horizontal panel AABB (construction-agnostic)
  // - camCenterOffset = camDepth/2 for pocket center alignment
  const camCenterOffset = config.camDepth / 2;
  const matingSurfaceY = isTopCorner
    ? horizontalAabb.min[1]   // TOP panel: mating surface is bottom face (minY)
    : horizontalAabb.max[1];  // BOTTOM panel: mating surface is top face (maxY)

  // v4.4 FIX: Joint axis Y = horizontal panel thickness center.
  // All side-panel points (BOLT, BOLT_THREAD, DOWEL-side) must share this axis
  // so they align with the horizontal panel edge bore (BOLT_ENTRY, DOWEL-horiz).
  // Previously used camCenterOffset (camDepth/2 = 6.75mm from side panel edge),
  // which was 2.25mm off from the actual thickness center (9mm for 18mm panel).
  const jointAxisY = (horizontalAabb.min[1] + horizontalAabb.max[1]) / 2;

  const facePoint = boltFacePointFromSideAABB_v4(
    corner,
    verticalAabb,
    sys32Z,
    camCenterOffset
  );

  // Override Y to use joint axis (horizontal panel thickness center)
  // instead of camCenterOffset-based Y from boltFacePointFromSideAABB_v4
  facePoint.position[1] = jointAxisY;

  // Determine SIDE panel role based on corner
  const boltPanelRole = (corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT')
    ? 'LEFT_SIDE'
    : 'RIGHT_SIDE';

  result.boltPoint = createDrillPoint({
    panelId: vertical.id,
    position: facePoint.position,
    normal: facePoint.normal,
    diameter: config.sleeveDia,
    depth: config.boltBoreDepth ?? 17.5,  // Häfele S200: 17.5mm (NOT sleeveLength which is assembly 14.25mm)
    purpose: 'BOLT',
    pairId,
    pairKeyV2,
    edgeDistance: effectiveDistanceB, // Distance B from mating edge
    depthPosition: sys32Z,
    cornerType: corner,
    cornerAngleDeg: angleDeg,
    connectedPanelRole: boltPanelRole,  // G11.5: Required for validation
  });

  // THREAD pilot on vertical panel face (same axis as BOLT)
  result.boltThreadPoint = createDrillPoint({
    panelId: vertical.id,
    position: facePoint.position,
    normal: facePoint.normal,
    diameter: config.shaftDia,
    depth: config.shaftLength,
    purpose: 'BOLT_THREAD',
    pairId,
    pairKeyV2,
    edgeDistance: effectiveDistanceB,
    depthPosition: sys32Z,
    cornerType: corner,
    cornerAngleDeg: angleDeg,
    connectedPanelRole: boltPanelRole,
  });

  // Horizontal edge entry bore toward CAM (used for merged Ø10x24 display/CSG direction)
  const edgeEntryPoint = boltEntryEdgePointFromHorizAABB(
    corner,
    horizontalAabb,
    sys32Z,
    effectiveDistanceB
  );
  result.boltEntryPoint = createDrillPoint({
    panelId: horizontal.id,
    position: edgeEntryPoint.position,
    normal: edgeEntryPoint.normal,
    diameter: config.boltEntryDia ?? 7.5,
    depth: effectiveDistanceB,
    purpose: 'BOLT_ENTRY',
    pairId,
    pairKeyV2,
    edgeDistance: effectiveDistanceB,
    depthPosition: sys32Z,
    cornerType: corner,
    cornerAngleDeg: angleDeg,
    connectedPanelRole: (corner === 'TOP_LEFT' || corner === 'TOP_RIGHT') ? 'TOP' : 'BOTTOM',
  });

  // ========================================
  // CAM POINT on HORIZONTAL panel (face drilling)
  // ========================================
  // HÄFELE STANDARD FIX: Distance B is measured from MATE EDGE (LEFT/RIGHT)
  // to CAM center - NOT from FRONT edge and NOT aligned to BOLT X position.
  //
  // For INSET joint (TOP/BOTTOM between SIDEs):
  // - LEFT corners: CAM at Distance B from LEFT edge of horizontal panel
  // - RIGHT corners: CAM at Distance B from RIGHT edge of horizontal panel
  {
    const aabb = calculatePanelAABB(horizontal);
    const basis = getPanelBasisFromAABB(horizontal, aabb);

    const isLeft = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';

    // HÄFELE STANDARD: CAM position at Distance B from mate edge
    // For panel-local coordinates on TOP/BOTTOM:
    // - localX = 0 at LEFT edge, localX = faceWidth at RIGHT edge
    // - Distance B is measured from mate edge (LEFT or RIGHT) toward panel center
    let camLocalX: number;
    if (isLeft) {
      // LEFT corner: Distance B from LEFT edge
      camLocalX = effectiveDistanceB;
    } else {
      // RIGHT corner: Distance B from RIGHT edge
      camLocalX = basis.faceWidth - effectiveDistanceB;
    }

    // Ensure CAM is within panel bounds (with cam diameter margin)
    const camMargin = config.camDia / 2 + 2; // Half diameter + 2mm margin
    camLocalX = clamp(camLocalX, camMargin, basis.faceWidth - camMargin);

    // System 32 position for Y (depth from front)
    const camLocalY = sys32Z;
    const clampedY = clamp(camLocalY, 10, basis.faceHeight - 10);

    // Convert to world position
    const worldPos = panelLocalToWorld(basis, camLocalX, clampedY);

    // Edge distance = Distance B (as intended by Häfele standard)
    const actualEdgeDistance = effectiveDistanceB;

    // Determine HORIZONTAL panel role based on corner
    const camPanelRole = (corner === 'TOP_LEFT' || corner === 'TOP_RIGHT')
      ? 'TOP'
      : 'BOTTOM';

    // Drill normal = into the panel face (uAxis)
    result.camPoint = createDrillPoint({
      panelId: horizontal.id,
      position: worldPos,
      normal: basis.uAxis,
      diameter: config.camDia,
      depth: config.camDepth,
      purpose: 'CAM_LOCK',
      pairId,
      pairKeyV2,
      edgeDistance: actualEdgeDistance,
      depthPosition: sys32Z,
      cornerType: corner,
      cornerAngleDeg: angleDeg,
      connectedPanelRole: camPanelRole,  // G11.5: Required for validation
    });
  }

  // Link CAM and BOLT now that both are created
  {

    // ========================================
    // SET pairedHoleId AND boltDirection FOR CAM ↔ BOLT LINKAGE
    // ========================================
    // CRITICAL: Gate validation requires:
    // - pairedHoleId to link cam and bolt
    // - boltDirection to point toward CAM POCKET CENTER (for geometric validation)
    if (result.camPoint && result.boltPoint) {
      result.camPoint.pairedHoleId = result.boltPoint.id;
      result.boltPoint.pairedHoleId = result.camPoint.id;
      if (result.boltEntryPoint) result.boltEntryPoint.pairedHoleId = result.boltPoint.id;
      if (result.boltThreadPoint) result.boltThreadPoint.pairedHoleId = result.boltPoint.id;

      // Use the horizontal panel thickness center as the shared pivot for
      // CAM/BOLT/THREAD alignment and Vertical Flip behavior.
      const boltAxisOffset = Math.abs(horizontalAabb.max[1] - horizontalAabb.min[1]) / 2;
      const camPos = result.camPoint.position;
      const camNormal = result.camPoint.normal;
      const pocketOffset = boltAxisOffset;
      const camPocketCenter: Vec3Tuple = [
        camPos[0] + camNormal[0] * pocketOffset,
        camPos[1] + camNormal[1] * pocketOffset,
        camPos[2] + camNormal[2] * pocketOffset,
      ];

      // ✅ Store pocket center on bolt point for downstream render (B=C truth chain)
      result.boltPoint.targetPocketCenter = camPocketCenter;

      // ========================================
      // BOLT DIRECTION CONTRACT (LOCKED — see minifixRenderInvariant.test.ts)
      // ========================================
      // - boltPoint.normal        = drilling axis INTO panel face (manufacturing truth)
      // - boltPoint.boltDirection = entry → cam pocket center   (preview + pairing truth)
      //   DO NOT set boltDirection = normal/drillingAxis — that breaks preview orientation.
      const boltPos = result.boltPoint.position;
      const boltDrillingAxis = result.boltPoint.normal; // [±1, 0, 0] — kept for twist calc below
      result.boltPoint.boltDirection = vecNorm(vecSub(camPocketCenter, boltPos));

      // ========================================
      // COMPUTE BOLT TWIST ANGLE
      // ========================================
      // Use seam-driven twist calculation for proper fin orientation
      // jointMode: INSET = fins horizontal (parallel to seam/depth)
      // jointMode: OVERLAY = fins vertical (perpendicular to seam)
      const isLeftSide = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';
      const isTopCorner = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';

      // CRITICAL FIX: boltPanelNormal = normal of the SIDE panel (where bolt is drilled)
      // NOT the horizontal panel's normal!
      // - LEFT_SIDE inner face normal = [1, 0, 0] (pointing right, into cabinet)
      // - RIGHT_SIDE inner face normal = [-1, 0, 0] (pointing left, into cabinet)
      const boltPanelNormal = isLeftSide
        ? { x: 1, y: 0, z: 0 }   // LEFT_SIDE panel inner face
        : { x: -1, y: 0, z: 0 }; // RIGHT_SIDE panel inner face

      const twistResult = resolveSeamDrivenTwist({
        jointPosition: isTopCorner ? 'TOP' : 'BOTTOM',
        jointMode: 'INSET',  // Default for standard cabinet corners
        panelSide: isLeftSide ? 'LEFT' : 'RIGHT',
        cornerType: corner,
        boltDir: {
          x: boltDrillingAxis[0],
          y: boltDrillingAxis[1],
          z: boltDrillingAxis[2],
        },
        boltPanelNormal,  // Now correctly ±X for SIDE panels
        position: {
          x: boltPos[0],
          y: boltPos[1],
          z: boltPos[2],
        },
        targetPocketCenter: {
          x: camPocketCenter[0],
          y: camPocketCenter[1],
          z: camPocketCenter[2],
        },
      });

      result.boltPoint.boltTwistDeg = twistResult.twistDeg;

    }

    // ========================================
    // DOWEL POINTS - v4.0 Side-covers-Top Construction
    // ========================================
    // v4.0 Split depth:
    // - SIDE panel: FACE bore 11mm (into inner face)
    // - TOP/BOTTOM panel: EDGE bore 19mm (into left/right edge)
    if (config.includeDowel) {
      const [, , maxZ] = verticalAabb.max;
      const isLeft = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';
      const isTopCorner = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';

      // Get SIDE panel basis for face drilling
      const sideBasis = getPanelBasisFromAABB(vertical, verticalAabb);

      // Dowels at ±32mm from BOLT position along Z axis (System 32 spacing)
      // Edge margin = firstHoleZ so dowels don't get placed closer to panel edge than the bolt.
      // CAD reference: dowels only on CENTER side of each bolt, not toward the edge.
      // e.g., bolt at 50mm → dowel at 82mm (50+32) only, NOT at 18mm (50-32)
      const insetEdgeMargin = params.firstHoleZ ?? 37;
      const dowelZPositions = [
        maxZ - sys32Z - config.dowelOffset,
        maxZ - sys32Z + config.dowelOffset,
      ].filter(z => z >= verticalAabb.min[2] + insetEdgeMargin && z <= verticalAabb.max[2] - insetEdgeMargin);

      // ========================================
      // DOWEL on SIDE panel (FACE_BORE) - v4.0
      // ========================================
      // Drill into SIDE panel INNER FACE (same as BOLT)
      // Position at Distance B from mating edge (same Y as BOLT)
      for (const dowelZ of dowelZPositions) {
        // SIDE panel face bore: use same X position as bolt (inner face)
        // Y position: Distance B from mating edge (same as BOLT)
        const sideDowelPos: Vec3Tuple = [
          facePoint.position[0],  // X = inner face
          facePoint.position[1],  // Y = Distance B from mating edge
          dowelZ,                 // Z = ±32mm from bolt
        ];

        // SIDE panel: Use dowelDepthSideFace (11mm) for FACE_BORE
        result.dowelPoints.push(createDrillPoint({
          panelId: vertical.id,
          position: sideDowelPos,
          normal: facePoint.normal,  // Same drilling direction as BOLT (horizontal X)
          diameter: config.dowelDia,
          depth: config.dowelDepthSideFace ?? 11,  // 11mm face bore
          specLength: config.dowelLength,
          purpose: 'DOWEL',
          pairId: `${pairId}-dowel-side`,
          pairKeyV2: `${pairKeyV2}-dowel-side`,
          edgeDistance: effectiveDistanceB,
          depthPosition: sys32Z,
          cornerType: corner,
          connectedPanelRole: boltPanelRole,  // G11: Same as BOLT panel
        }));
      }

      // ========================================
      // DOWEL on HORIZONTAL panel (EDGE_BORE) - v4.0
      // ========================================
      // Drill into TOP/BOTTOM panel LEFT/RIGHT EDGE (end grain)
      // This is the deeper bore (19mm) for the split depth
      const horizBasis = getPanelBasisFromAABB(horizontal, horizontalAabb);

      for (let i = 0; i < dowelZPositions.length; i++) {
        const dowelZ = dowelZPositions[i];

        // Calculate horizontal panel edge bore position
        // X = left or right edge of horizontal panel
        // Y = center of panel thickness
        // Z = same as SIDE dowel
        const [hMinX, hMinY,] = horizontalAabb.min;
        const [hMaxX, hMaxY, hMaxZ] = horizontalAabb.max;

        const horizDowelX = isLeft ? hMinX : hMaxX;
        const horizDowelY = (hMinY + hMaxY) / 2;  // Center of panel thickness

        const horizDowelPos: Vec3Tuple = [horizDowelX, horizDowelY, dowelZ];

        // Edge drilling normal (horizontal, into panel edge)
        // LEFT corner: drill toward right (+X)
        // RIGHT corner: drill toward left (-X)
        const horizDowelNormal: Vec3Tuple = isLeft ? [1, 0, 0] : [-1, 0, 0];

        // Determine HORIZONTAL panel role for dowel
        const dowelHorizPanelRole = isTopCorner ? 'TOP' : 'BOTTOM';

        // HORIZONTAL panel: Use dowelDepthHorizEdge (19mm) for EDGE_BORE
        result.dowelPoints.push(createDrillPoint({
          panelId: horizontal.id,
          position: horizDowelPos,
          normal: horizDowelNormal,
          diameter: config.dowelDia,
          depth: config.dowelDepthHorizEdge ?? 19,  // 19mm edge bore
          specLength: config.dowelLength,
          purpose: 'DOWEL',
          pairId: `${pairId}-dowel-horiz`,
          pairKeyV2: `${pairKeyV2}-dowel-horiz`,
          edgeDistance: effectiveDistanceB,
          depthPosition: sys32Z,
          cornerType: corner,
          connectedPanelRole: dowelHorizPanelRole,  // G11: HORIZONTAL panel role
        }));
      }
    }
  }

  return result;
}

// ============================================
// B-RUN DOWEL GENERATION (WIDTH AXIS)
// ============================================

/**
 * Generate dowel pairs for a single B-run position at one corner.
 *
 * B-run = width axis (X direction) for lateral alignment / anti-rack.
 * Each position produces a dowel pair:
 *   - HORIZ panel FACE bore (Ø8 × 11mm) — drills into TOP/BOTTOM inner face
 *   - SIDE panel EDGE bore (Ø8 × 19mm)  — drills into LEFT_SIDE/RIGHT_SIDE top/bottom edge
 *
 * Construction: Side-covers-Top
 *   TOP corners: SIDE panel top edge ↔ TOP panel bottom face
 *   BOTTOM corners: SIDE panel bottom edge ↔ BOTTOM panel top face
 *
 * @param corner - Corner type
 * @param sys32X - System32 position along width axis (mm from corner's edge)
 * @param positionIndex - Index for unique ID generation
 * @param panelsByRole - Panel lookup
 * @param config - Minifix config
 */
// ========================================
// B-RUN DOWEL CONTRACT (LOCKED — see bRunDowelGeneration.test.ts)
// ========================================
// Each B-run position produces EXACTLY 2 points (1 pair):
//   1. HORIZ face bore  — panel=TOP/BOTTOM, depth=dowelDepthSideFace(11mm)
//   2. SIDE edge bore   — panel=LEFT_SIDE/RIGHT_SIDE, depth=dowelDepthHorizEdge(19mm)
//
// Invariants:
//   a) Both bores share the same Ø (config.dowelDia, default 8mm)
//   b) Normals are OPPOSING (dot = -1) — they face each other at the joint
//   c) pairId/pairKeyV2 roots are SHARED (suffix distinguishes -horiz / -side)
//   d) worldX and worldZ are IDENTICAL between paired bores
//
// DO NOT change bore assignments, depths, or normal directions without
// also updating validateBRunDowelPairing and bRunDowelGeneration.test.ts.
// ========================================

function generateBRunDowelPoints(
  corner: CornerType,
  sys32X: number,
  positionIndex: number,
  panelsByRole: PanelsByRole,
  config: MinifixConfig,
): DrillMapPoint[] {
  const points: DrillMapPoint[] = [];
  const { horizontal, vertical } = getCornerPanels(corner, panelsByRole);
  if (!horizontal || !vertical) return points;

  const horizAabb = calculatePanelAABB(horizontal);
  const sideAabb = calculatePanelAABB(vertical);

  const isLeft = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';
  const isTop = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';

  // Content-addressed key with B-run namespace
  const pairId = `pair-B-${corner}-${positionIndex}`;
  const pairKeyV2 = buildPairKeyV2(corner, sys32X, 'B');

  // X position: corner-relative from width edge
  const worldX = isLeft
    ? horizAabb.min[0] + sys32X
    : horizAabb.max[0] - sys32X;

  // Z position: drillingDistanceB from FRONT edge (maxZ)
  const worldZ = horizAabb.max[2] - config.drillingDistanceB;

  // Panel roles
  const horizPanelRole = isTop ? 'TOP' : 'BOTTOM';
  const sidePanelRole = isLeft ? 'LEFT_SIDE' : 'RIGHT_SIDE';

  // ---- HORIZ panel face bore (Ø8 × 11mm) ----
  // Drill into inner face of TOP/BOTTOM panel
  const horizFaceY = isTop ? horizAabb.min[1] : horizAabb.max[1]; // inner face
  const horizNormal: Vec3Tuple = isTop ? [0, 1, 0] : [0, -1, 0]; // drill into face

  // ---- SIDE panel edge bore (Ø8 × 19mm) ----
  // Drill into top/bottom edge of SIDE panel
  const sideEdgeY = isTop ? sideAabb.max[1] : sideAabb.min[1]; // top or bottom edge
  const sideNormal: Vec3Tuple = isTop ? [0, -1, 0] : [0, 1, 0]; // opposing direction

  // DEV-ONLY: contract assertion — normals must oppose
  if (import.meta.env.DEV) {
    const dot = horizNormal[0] * sideNormal[0] + horizNormal[1] * sideNormal[1] + horizNormal[2] * sideNormal[2];
    if (Math.abs(dot + 1) > 0.001) {
      console.error(`[B-run] CONTRACT VIOLATION: normals not opposing for ${corner} (dot=${dot})`);
    }
  }

  points.push(createDrillPoint({
    panelId: horizontal.id,
    position: [worldX, horizFaceY, worldZ],
    normal: horizNormal,
    diameter: config.dowelDia,
    depth: config.dowelDepthSideFace ?? 11,  // face bore = 11mm (shallow)
    specLength: config.dowelLength,
    purpose: 'DOWEL',
    pairId: `${pairId}-dowel-brun-horiz`,
    pairKeyV2: `${pairKeyV2}-dowel-brun-horiz`,
    edgeDistance: config.drillingDistanceB,
    depthPosition: sys32X,
    cornerType: corner,
    connectedPanelRole: horizPanelRole,
  }));

  points.push(createDrillPoint({
    panelId: vertical.id,
    position: [worldX, sideEdgeY, worldZ],
    normal: sideNormal,
    diameter: config.dowelDia,
    depth: config.dowelDepthHorizEdge ?? 19,  // edge bore = 19mm (deep)
    specLength: config.dowelLength,
    purpose: 'DOWEL',
    pairId: `${pairId}-dowel-brun-side`,
    pairKeyV2: `${pairKeyV2}-dowel-brun-side`,
    edgeDistance: config.drillingDistanceB,
    depthPosition: sys32X,
    cornerType: corner,
    connectedPanelRole: sidePanelRole,
  }));

  return points;
}

// ============================================
// SHELF JUNCTION GENERATION
// ============================================

/**
 * Generate Minifix drill points for a shelf-to-side-panel junction.
 *
 * Shelf connectors are geometrically identical to INSET cabinet corners:
 * - BOLT: face bore into SIDE panel inner face (±X drilling axis)
 * - CAM: face bore into SHELF panel face (±Y drilling axis)
 * - BOLT_ENTRY: edge bore into SHELF panel edge (±X axis)
 *
 * The shelf acts as the "horizontal" panel, and the side panel is the "vertical" panel.
 *
 * @param shelfCorner - Shelf corner type (e.g., 'SHELF_0_LEFT')
 * @param sys32Z - System 32 Z position from front
 * @param positionIndex - Index for unique ID generation
 * @param shelfPanel - The shelf CabinetPanel
 * @param sidePanel - The side CabinetPanel (LEFT_SIDE or RIGHT_SIDE)
 * @param config - Minifix config
 * @param params - Drilling parameters
 */
function generateShelfJointPoints(
  shelfCorner: ShelfCornerType,
  sys32Z: number,
  positionIndex: number,
  shelfPanel: CabinetPanel,
  sidePanel: CabinetPanel,
  config: MinifixConfig,
  params: DrillingParams,
): CornerJointResult {
  const result: CornerJointResult = {
    camPoint: null,
    boltPoint: null,
    boltEntryPoint: null,
    boltThreadPoint: null,
    dowelPoints: [],
  };

  const isLeft = shelfCorner.endsWith('_LEFT');

  const shelfAabb = calculatePanelAABB(shelfPanel);
  const sideAabb = calculatePanelAABB(sidePanel);

  const pairId = `pair-${shelfCorner}-${positionIndex}`;
  const pairKeyV2 = buildPairKeyV2(shelfCorner, sys32Z);

  const effectiveDistanceB = config.drillingDistanceB;
  const camCenterOffset = config.camDepth / 2;

  // v4.4 FIX: Joint axis Y = shelf panel thickness CENTER (matching INSET pattern).
  // All points (BOLT, BOLT_ENTRY, BOLT_THREAD, DOWEL) must share this Y axis
  // so they align with the shelf panel edge bore and CAM pocket center.
  const jointAxisY = (shelfAabb.min[1] + shelfAabb.max[1]) / 2;

  const facePoint = boltFacePointFromSideAABB_v4(
    // Map shelf corner to equivalent cabinet corner for the helper
    // SHELF_N_LEFT → behaves like BOTTOM_LEFT (bolt into left side, Y = shelf center)
    // SHELF_N_RIGHT → behaves like BOTTOM_RIGHT (bolt into right side, Y = shelf center)
    isLeft ? 'BOTTOM_LEFT' : 'BOTTOM_RIGHT',
    sideAabb,
    sys32Z,
    camCenterOffset,
  );

  // Override Y to use shelf panel thickness center (joint axis)
  facePoint.position[1] = jointAxisY;

  // Override Z to use SHELF panel front edge (not side panel front edge).
  // In INSET mode, side and horizontal panels share the same maxZ, but shelves
  // may be set back from the front edge. The bolt enters through the shelf edge,
  // so both BOLT and BOLT_ENTRY must share the shelf's Z coordinate.
  facePoint.position[2] = shelfAabb.max[2] - sys32Z;

  const boltPanelRole: PanelRole = isLeft ? 'LEFT_SIDE' : 'RIGHT_SIDE';

  result.boltPoint = createDrillPoint({
    panelId: sidePanel.id,
    position: facePoint.position,
    normal: facePoint.normal,
    diameter: config.sleeveDia,
    depth: config.boltBoreDepth ?? 17.5,  // Häfele S200: 17.5mm (NOT sleeveLength which is assembly 14.25mm)
    purpose: 'BOLT',
    pairId,
    pairKeyV2,
    edgeDistance: effectiveDistanceB,
    depthPosition: sys32Z,
    cornerType: shelfCorner,
    connectedPanelRole: boltPanelRole,
  });

  // BOLT_THREAD pilot on side panel face (same axis as BOLT)
  result.boltThreadPoint = createDrillPoint({
    panelId: sidePanel.id,
    position: facePoint.position,
    normal: facePoint.normal,
    diameter: config.shaftDia,
    depth: config.shaftLength,
    purpose: 'BOLT_THREAD',
    pairId,
    pairKeyV2,
    edgeDistance: effectiveDistanceB,
    depthPosition: sys32Z,
    cornerType: shelfCorner,
    connectedPanelRole: boltPanelRole,
  });

  // ========================================
  // BOLT_ENTRY on SHELF panel edge (±X axis, toward side panel)
  // ========================================
  // The bolt shaft passes through the shelf panel edge bore
  // For LEFT: bolt enters from left edge of shelf, drill toward right → normal = [+1, 0, 0]
  // For RIGHT: bolt enters from right edge of shelf, drill toward left → normal = [-1, 0, 0]
  {
    const edgeX = isLeft ? shelfAabb.min[0] : shelfAabb.max[0];
    // Drill direction INTO shelf edge (toward the interior of the panel)
    const edgeNormal: Vec3Tuple = isLeft ? [1, 0, 0] : [-1, 0, 0];
    // Z = depth from front: front = maxZ, so world Z = maxZ - sys32Z
    const entryPos: Vec3Tuple = [
      edgeX,
      jointAxisY,
      shelfAabb.max[2] - sys32Z,
    ];

    result.boltEntryPoint = createDrillPoint({
      panelId: shelfPanel.id,
      position: entryPos,
      normal: edgeNormal,
      diameter: config.boltEntryDia ?? 7.5,
      depth: effectiveDistanceB,
      purpose: 'BOLT_ENTRY',
      pairId,
      pairKeyV2,
      edgeDistance: effectiveDistanceB,
      depthPosition: sys32Z,
      cornerType: shelfCorner,
      connectedPanelRole: 'SHELF',
    });
  }

  // ========================================
  // CAM on SHELF panel face (±Y drilling)
  // ========================================
  // CAM is drilled into the shelf panel face, at Distance B from the mating edge (left or right)
  {
    const shelfBasis = getPanelBasisFromAABB(shelfPanel, shelfAabb);

    // Distance B from mating edge (left or right edge of shelf)
    let camLocalX: number;
    if (isLeft) {
      camLocalX = effectiveDistanceB;
    } else {
      camLocalX = shelfBasis.faceWidth - effectiveDistanceB;
    }

    // Clamp within shelf bounds
    const camMargin = config.camDia / 2 + 2;
    camLocalX = clamp(camLocalX, camMargin, shelfBasis.faceWidth - camMargin);

    const camLocalY = sys32Z;
    const clampedY = clamp(camLocalY, 10, shelfBasis.faceHeight - 10);

    const worldPos = panelLocalToWorld(shelfBasis, camLocalX, clampedY);

    result.camPoint = createDrillPoint({
      panelId: shelfPanel.id,
      position: worldPos,
      normal: shelfBasis.uAxis,
      diameter: config.camDia,
      depth: config.camDepth,
      purpose: 'CAM_LOCK',
      pairId,
      pairKeyV2,
      edgeDistance: effectiveDistanceB,
      depthPosition: sys32Z,
      cornerType: shelfCorner,
      connectedPanelRole: 'SHELF',
    });
  }

  // ========================================
  // LINK CAM ↔ BOLT and compute twist
  // ========================================
  if (result.camPoint && result.boltPoint) {
    result.camPoint.pairedHoleId = result.boltPoint.id;
    result.boltPoint.pairedHoleId = result.camPoint.id;
    if (result.boltEntryPoint) result.boltEntryPoint.pairedHoleId = result.boltPoint.id;
    if (result.boltThreadPoint) result.boltThreadPoint.pairedHoleId = result.boltPoint.id;

    // Use the shelf panel thickness center as the shared pivot for
    // CAM/BOLT/THREAD alignment (matching INSET pattern exactly).
    const boltAxisOffset = Math.abs(shelfAabb.max[1] - shelfAabb.min[1]) / 2;
    const camPos = result.camPoint.position;
    const camNormal = result.camPoint.normal;
    const pocketOffset = boltAxisOffset;
    const camPocketCenter: Vec3Tuple = [
      camPos[0] + camNormal[0] * pocketOffset,
      camPos[1] + camNormal[1] * pocketOffset,
      camPos[2] + camNormal[2] * pocketOffset,
    ];

    result.boltPoint.targetPocketCenter = camPocketCenter;

    // Bolt direction = entry → cam pocket center
    const boltPos = result.boltPoint.position;
    const boltDrillingAxis = result.boltPoint.normal;
    result.boltPoint.boltDirection = vecNorm(vecSub(camPocketCenter, boltPos));

    // Compute twist for shelf corner (INSET mode — bolt on side panel face)
    const boltPanelNormal = isLeft
      ? { x: 1, y: 0, z: 0 }   // LEFT_SIDE inner face
      : { x: -1, y: 0, z: 0 }; // RIGHT_SIDE inner face

    const twistResult = resolveSeamDrivenTwist({
      jointPosition: 'BOTTOM',  // Shelf acts like a "bottom" panel relative to bolt position
      jointMode: 'INSET',
      panelSide: isLeft ? 'LEFT' : 'RIGHT',
      cornerType: shelfCorner,
      boltDir: {
        x: boltDrillingAxis[0],
        y: boltDrillingAxis[1],
        z: boltDrillingAxis[2],
      },
      boltPanelNormal,
      position: {
        x: boltPos[0],
        y: boltPos[1],
        z: boltPos[2],
      },
      targetPocketCenter: {
        x: camPocketCenter[0],
        y: camPocketCenter[1],
        z: camPocketCenter[2],
      },
    });

    result.boltPoint.boltTwistDeg = twistResult.twistDeg;
  }

  // ========================================
  // DOWEL POINTS — Side-covers-Shelf (same as INSET cabinet corners)
  // ========================================
  if (config.includeDowel) {
    // Dowels at ±32mm from bolt position along Z axis (System 32 spacing)
    // Use shelfAabb.max[2] (shelf front edge) as Z base — same correction as BOLT Z
    // Edge margin = firstHoleZ so dowels don't get placed closer to panel edge than the bolt.
    const shelfMaxZ = shelfAabb.max[2];
    const shelfEdgeMargin = params.firstHoleZ ?? 37;
    const dowelZPositions = [
      shelfMaxZ - sys32Z - config.dowelOffset,
      shelfMaxZ - sys32Z + config.dowelOffset,
    ].filter(z => z >= shelfAabb.min[2] + shelfEdgeMargin && z <= shelfAabb.max[2] - shelfEdgeMargin);

    for (const dowelZ of dowelZPositions) {
      // DOWEL on SIDE panel FACE (face bore, 11mm depth)
      const sideDowelPos: Vec3Tuple = [
        facePoint.position[0],  // X = side panel inner face
        jointAxisY,             // Y = shelf thickness center
        dowelZ,                 // Z = ±32mm from bolt (world Z)
      ];

      result.dowelPoints.push(createDrillPoint({
        panelId: sidePanel.id,
        position: sideDowelPos,
        normal: facePoint.normal,
        diameter: config.dowelDia,
        depth: config.dowelDepthSideFace ?? 11,
        specLength: config.dowelLength,
        purpose: 'DOWEL',
        pairId: `${pairId}-dowel-side`,
        pairKeyV2: `${pairKeyV2}-dowel-side`,
        edgeDistance: effectiveDistanceB,
        depthPosition: sys32Z,
        cornerType: shelfCorner,
        connectedPanelRole: boltPanelRole,
      }));

      // DOWEL on SHELF panel EDGE (edge bore, 19mm depth)
      const shelfEdgeX = isLeft ? shelfAabb.min[0] : shelfAabb.max[0];
      // Edge drilling normal: drill INTO shelf edge (same as INSET horizontal edge)
      // LEFT corner: drill toward right (+X), RIGHT corner: drill toward left (-X)
      const shelfEdgeNormal: Vec3Tuple = isLeft ? [1, 0, 0] : [-1, 0, 0];
      const shelfDowelPos: Vec3Tuple = [
        shelfEdgeX,
        jointAxisY,
        dowelZ,  // Same world Z as side panel dowel
      ];

      result.dowelPoints.push(createDrillPoint({
        panelId: shelfPanel.id,
        position: shelfDowelPos,
        normal: shelfEdgeNormal,
        diameter: config.dowelDia,
        depth: config.dowelDepthHorizEdge ?? 19,
        specLength: config.dowelLength,
        purpose: 'DOWEL',
        pairId: `${pairId}-dowel-shelf`,
        pairKeyV2: `${pairKeyV2}-dowel-shelf`,
        edgeDistance: effectiveDistanceB,
        depthPosition: sys32Z,
        cornerType: shelfCorner,
        connectedPanelRole: 'SHELF',
      }));
    }
  }

  return result;
}

// ============================================
// BACK PANEL OVERLAY JOINT GENERATION
// ============================================

/**
 * Generate Minifix S200 + Dowel drill points for a BACK panel ↔ SIDE panel junction
 * in OVERLAY construction.
 *
 * BACK panel overlay: back panel covers side panel back edges.
 * - BOLT: face bore into BACK panel inner face (z = maxZ, drill [0, 0, -1])
 * - BOLT_ENTRY: edge bore into SIDE panel back edge (z = minZ, drill [0, 0, +1])
 * - CAM: face bore into SIDE panel inner face (x = maxX/minX)
 * - DOWEL: ±32mm from bolt along Y axis
 *
 * Run axis = Y (height direction). System 32 positions along Y.
 *
 * @param backCorner - BACK_LEFT or BACK_RIGHT
 * @param sys32Y - System32 position along Y axis (from bottom edge of back panel)
 * @param positionIndex - Index for unique ID generation
 * @param backPanel - Back panel
 * @param sidePanel - Side panel (LEFT_SIDE or RIGHT_SIDE)
 * @param config - Minifix config
 * @param params - Drilling params
 */
function generateBackPanelJointPoints(
  backCorner: BackCornerType,
  sys32Y: number,
  positionIndex: number,
  backPanel: CabinetPanel,
  sidePanel: CabinetPanel,
  config: MinifixConfig,
  params: DrillingParams,
): CornerJointResult {
  const result: CornerJointResult = {
    camPoint: null,
    boltPoint: null,
    boltEntryPoint: null,
    boltThreadPoint: null,
    dowelPoints: [],
  };

  const isLeft = backCorner === 'BACK_LEFT';

  const backAabb = calculatePanelAABB(backPanel);
  const sideAabb = calculatePanelAABB(sidePanel);

  const pairId = `pair-${backCorner}-${positionIndex}`;
  const pairKeyV2 = buildPairKeyV2(backCorner, sys32Y);

  const effectiveDistanceB = config.drillingDistanceB;
  const camCenterOffset = config.camDepth / 2;

  // World Y = back panel bottom edge + sys32Y offset
  const worldY = backAabb.min[1] + sys32Y;

  // ========================================
  // BOLT on BACK panel (face bore, inner face z=maxZ)
  // ========================================
  const boltPoint = boltFacePointFromBackAABB(isLeft, backAabb, sys32Y, camCenterOffset, sideAabb);

  const boltPanelRole: PanelRole = 'BACK';

  result.boltPoint = createDrillPoint({
    panelId: backPanel.id,
    position: boltPoint.position,
    normal: boltPoint.normal,
    diameter: config.sleeveDia,
    depth: config.boltBoreDepth ?? 17.5,  // Häfele S200: 17.5mm (NOT sleeveLength which is assembly 14.25mm)
    purpose: 'BOLT',
    pairId,
    pairKeyV2,
    edgeDistance: effectiveDistanceB,
    depthPosition: sys32Y,
    cornerType: backCorner,
    connectedPanelRole: boltPanelRole,
  });

  // BOLT_THREAD pilot on back panel face (same axis as BOLT)
  result.boltThreadPoint = createDrillPoint({
    panelId: backPanel.id,
    position: boltPoint.position,
    normal: boltPoint.normal,
    diameter: config.shaftDia,
    depth: config.shaftLength,
    purpose: 'BOLT_THREAD',
    pairId,
    pairKeyV2,
    edgeDistance: effectiveDistanceB,
    depthPosition: sys32Y,
    cornerType: backCorner,
    connectedPanelRole: boltPanelRole,
  });

  // ========================================
  // BOLT_ENTRY on SIDE panel back edge (edge bore, z=minZ)
  // ========================================
  const entryPoint = boltEntryEdgePointFromSideAABB_back(isLeft, sideAabb, worldY);

  const sidePanelRole: PanelRole = isLeft ? 'LEFT_SIDE' : 'RIGHT_SIDE';

  result.boltEntryPoint = createDrillPoint({
    panelId: sidePanel.id,
    position: entryPoint.position,
    normal: entryPoint.normal,
    diameter: config.boltEntryDia ?? 7.5,  // Entry bore (bolt passage), smaller than sleeve bore
    depth: effectiveDistanceB,
    purpose: 'BOLT_ENTRY',
    pairId,
    pairKeyV2,
    edgeDistance: effectiveDistanceB,
    depthPosition: sys32Y,
    cornerType: backCorner,
    connectedPanelRole: sidePanelRole,
  });

  // ========================================
  // CAM on SIDE panel inner face
  // ========================================
  const camPoint = camFacePointFromSideAABB_back(isLeft, sideAabb, worldY, effectiveDistanceB);

  result.camPoint = createDrillPoint({
    panelId: sidePanel.id,
    position: camPoint.position,
    normal: camPoint.normal,
    diameter: config.camDia,
    depth: config.camDepth,
    purpose: 'CAM_LOCK',
    pairId,
    pairKeyV2,
    edgeDistance: effectiveDistanceB,
    depthPosition: sys32Y,
    cornerType: backCorner,
    connectedPanelRole: sidePanelRole,
  });

  // ========================================
  // LINK CAM ↔ BOLT and compute twist
  // ========================================
  if (result.camPoint && result.boltPoint) {
    result.camPoint.pairedHoleId = result.boltPoint.id;
    result.boltPoint.pairedHoleId = result.camPoint.id;
    if (result.boltEntryPoint) result.boltEntryPoint.pairedHoleId = result.boltPoint.id;
    if (result.boltThreadPoint) result.boltThreadPoint.pairedHoleId = result.boltPoint.id;

    // Pocket center = CAM position + normal * (side panel thickness / 2)
    const boltAxisOffset = Math.abs(sideAabb.max[0] - sideAabb.min[0]) / 2;
    const camPos = result.camPoint.position;
    const camNormal = result.camPoint.normal;
    const pocketOffset = boltAxisOffset;
    const camPocketCenter: Vec3Tuple = [
      camPos[0] + camNormal[0] * pocketOffset,
      camPos[1] + camNormal[1] * pocketOffset,
      camPos[2] + camNormal[2] * pocketOffset,
    ];

    result.boltPoint.targetPocketCenter = camPocketCenter;

    const boltPos = result.boltPoint.position;
    const boltDrillingAxis = result.boltPoint.normal;
    result.boltPoint.boltDirection = vecNorm(vecSub(camPocketCenter, boltPos));

    // Compute twist for back panel corner
    const boltPanelNormal = { x: 0, y: 0, z: -1 }; // Back panel inner face normal

    const twistResult = resolveSeamDrivenTwist({
      jointPosition: 'BOTTOM',  // Back panel acts like a covering panel
      jointMode: 'OVERLAY',
      panelSide: isLeft ? 'LEFT' : 'RIGHT',
      cornerType: backCorner,
      boltDir: {
        x: boltDrillingAxis[0],
        y: boltDrillingAxis[1],
        z: boltDrillingAxis[2],
      },
      boltPanelNormal,
      position: {
        x: boltPos[0],
        y: boltPos[1],
        z: boltPos[2],
      },
      targetPocketCenter: {
        x: camPocketCenter[0],
        y: camPocketCenter[1],
        z: camPocketCenter[2],
      },
    });

    result.boltPoint.boltTwistDeg = twistResult.twistDeg;
  }

  // ========================================
  // DOWEL POINTS — Back panel ↔ Side panel
  // ========================================
  // Dowels are PARALLEL to BOLT direction (Z axis), NOT parallel to CAM (X axis).
  // Same pattern as INSET: dowels at ±offset along RUN AXIS from bolt position.
  //
  // Back panel overlay joint:
  //   - BACK panel FACE bore (11mm) — drills [0,0,-1] into back panel inner face
  //   - SIDE panel EDGE bore (19mm) — drills [0,0,+1] into side panel back edge
  //   Both bores are colinear along Z, meeting at the joint interface.
  if (config.includeDowel) {
    // Dowels at ±32mm from bolt position along Y axis (run axis)
    const dowelYPositions = [
      worldY - config.dowelOffset,
      worldY + config.dowelOffset,
    ].filter(y => y >= backAabb.min[1] + (params.firstHoleZ ?? 37) && y <= backAabb.max[1] - (params.firstHoleZ ?? 37));

    for (const dowelY of dowelYPositions) {
      // DOWEL on BACK panel FACE (face bore, 11mm depth)
      // Same face and normal as BOLT — drills into back panel inner face [0,0,-1]
      const backDowelPos: Vec3Tuple = [
        boltPoint.position[0],  // X = same as bolt (side panel thickness center)
        dowelY,                 // Y = ±32mm from bolt
        backAabb.max[2],        // Z = back panel inner face (same as BOLT)
      ];

      result.dowelPoints.push(createDrillPoint({
        panelId: backPanel.id,
        position: backDowelPos,
        normal: [0, 0, -1],  // Same direction as BOLT (into back panel face)
        diameter: config.dowelDia,
        depth: config.dowelDepthSideFace ?? 11,  // 11mm face bore (shallow)
        specLength: config.dowelLength,
        purpose: 'DOWEL',
        pairId: `${pairId}-dowel-back`,
        pairKeyV2: `${pairKeyV2}-dowel-back`,
        edgeDistance: effectiveDistanceB,
        depthPosition: sys32Y,
        cornerType: backCorner,
        connectedPanelRole: 'BACK',
      }));

      // DOWEL on SIDE panel EDGE (edge bore, 19mm depth)
      // Same edge and normal as BOLT_ENTRY — drills into side panel back edge [0,0,+1]
      const sideDowelPos: Vec3Tuple = [
        entryPoint.position[0],  // X = center of side panel thickness (same as BOLT_ENTRY)
        dowelY,                  // Y = ±32mm from bolt
        sideAabb.min[2],         // Z = side panel back edge (same as BOLT_ENTRY)
      ];

      result.dowelPoints.push(createDrillPoint({
        panelId: sidePanel.id,
        position: sideDowelPos,
        normal: [0, 0, 1],  // Same direction as BOLT_ENTRY (into side panel back edge)
        diameter: config.dowelDia,
        depth: config.dowelDepthHorizEdge ?? 19,  // 19mm edge bore (deep)
        specLength: config.dowelLength,
        purpose: 'DOWEL',
        pairId: `${pairId}-dowel-side`,
        pairKeyV2: `${pairKeyV2}-dowel-side`,
        edgeDistance: effectiveDistanceB,
        depthPosition: sys32Y,
        cornerType: backCorner,
        connectedPanelRole: sidePanelRole,
      }));
    }
  }

  return result;
}

// ============================================
// MAIN GENERATION FUNCTION
// ============================================

/**
 * Generate Minifix S200 drill map for a cabinet.
 *
 * Uses AABB-based panel basis for robust coordinate transformation.
 *
 * @param cabinet - Cabinet with panels
 * @param config - Partial MinifixConfig overrides (manufacturing truth only)
 * @param params - Drilling parameters (optional)
 * @param options - Generation options
 * @returns DrillMap with all drill points
 */
export function generateMinifixDrillMap(
  cabinet: Cabinet,
  config?: Partial<MinifixConfig>,
  params?: Partial<DrillingParams>,
  options?: {
    connectorCount?: number;
    /** Per-group connector count overrides from ConnectorList Add/Del buttons.
     *  Keys: "main" (TOP/BOTTOM corners), "shelf_0"/"shelf_1"/... (shelves), "back" (back panel) */
    connectorCountOverrides?: Record<string, number>;
    /** ADR-061: ความถี่ Minifix ที่ผู้ใช้เลือก (default CAD_STANDARD) */
    connectorDensity?: ConnectorDensity;
  }
): DrillMap {
  if (!cabinet || !cabinet.panels || cabinet.panels.length === 0) {
    return createEmptyDrillMap(cabinet?.id || 'unknown');
  }

  // Reset point ID counter for consistent IDs
  resetPointIdCounter();

  // Type-safe API: config is always arg #2, params is arg #3 (no union/detection)
  const mergedConfig = {
    ...DEFAULT_MINIFIX_CONFIG,
    ...(config ?? {}),
  } as Record<string, unknown>;
  const fullConfig = sanitizeManufacturingConfig(mergedConfig) as unknown as MinifixConfig;
  // Guard against stale persisted values (e.g. 17.5) leaking into manufacturing B distance.
  if (!VALID_DRILLING_DISTANCE_B.some((b) => Math.abs(fullConfig.drillingDistanceB - b) < 0.001)) {
    fullConfig.drillingDistanceB = DEFAULT_MINIFIX_CONFIG.drillingDistanceB;
  }
  const fullParams: DrillingParams = { ...DEFAULT_DRILLING_PARAMS, ...(params ?? {}) };

  // DEV-ONLY: Guard — preview-only keys must never reach the compiler
  assertNoPreviewKeys(fullConfig as unknown as Record<string, unknown>, 'generateMinifixDrillMap');

  // Traceability: hash inputs for audit trail
  const meta = buildDrillMapMeta({
    generatorName: 'generateMinifixDrillMap',
    fullConfig: fullConfig as unknown as Record<string, unknown>,
    fullParams: fullParams as unknown as Record<string, unknown>,
    connectorCount: options?.connectorCount,
  });

  // maxConnectors option: undefined = auto (all that fit), or a specific number
  const maxConnectors = options?.connectorCount;

  // Build panel lookup
  const panelsByRole = buildPanelsByRole(cabinet.panels);
  const topPanel = panelsByRole['TOP'];
  const bottomPanel = panelsByRole['BOTTOM'];

  // Initialize drill map
  const drillMap = createEmptyDrillMap(cabinet.id);

  // Map to collect points per panel
  const panelPointsMap = new Map<string, DrillMapPoint[]>();

  // ========================================
  // CALCULATE SYSTEM32 RUN LENGTH
  // ========================================
  // System32 axis = depth direction (Z span) for horizontal panels
  // Use TOP panel AABB to determine the run length
  let sys32RunLength = 500; // fallback default

  if (topPanel) {
    const topAabb = calculatePanelAABB(topPanel);
    sys32RunLength = topAabb.max[2] - topAabb.min[2]; // Z span = depth
  } else if (bottomPanel) {
    const bottomAabb = calculatePanelAABB(bottomPanel);
    sys32RunLength = bottomAabb.max[2] - bottomAabb.min[2];
  }

  // CAD pattern baseline (A/B threshold rule): 2 placements for <=400mm, 3 for >400mm.
  // If caller explicitly requests connectorCount, honor it.
  // Per-group overrides take priority over global connectorCount.
  const perGroupOverrides = options?.connectorCountOverrides;
  const mainOverride = perGroupOverrides?.['main'];
  const density: ConnectorDensity = options?.connectorDensity ?? 'CAD_STANDARD';
  const connectorCount = mainOverride ?? maxConnectors ??
    computeConnectorCountForDensity(sys32RunLength, fullParams.firstHoleZ, density);
  // ADR-061 มติ ก: ตำแหน่ง snap ลง System32 grid (แหล่งเดียวกับ Connector OS placer)
  const sys32Positions = getSpreadGridPositions(
    sys32RunLength,
    { firstHole: fullParams.firstHoleZ, pitch: 32, endOffset: 40 },
    connectorCount
  );

  // Define all 4 corners
  const CORNERS: CornerType[] = ['TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'];

  // Get corner angles from cabinet structure (default to 90° if not specified)
  const getCornerAngle = (corner: CornerType): number => {
    const angles = cabinet.structure?.cornerAngles;
    if (!angles) return 90;
    switch (corner) {
      case 'TOP_LEFT': return angles.topLeft ?? 90;
      case 'TOP_RIGHT': return angles.topRight ?? 90;
      case 'BOTTOM_LEFT': return angles.bottomLeft ?? 90;
      case 'BOTTOM_RIGHT': return angles.bottomRight ?? 90;
      default: return 90;
    }
  };

  // Resolve joint mode per corner from cabinet structure
  const getJointMode = (corner: CornerType): JointType => {
    const isTop = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';
    const mode = isTop ? cabinet.structure?.topJoint : cabinet.structure?.bottomJoint;
    return mode ?? 'INSET';
  };

  // Resolve top/bottom connector configs (default = minifix enabled)
  const topConnectors = cabinet.structure?.topConnectors;
  const bottomConnectors = cabinet.structure?.bottomConnectors;

  // Check if a corner is enabled based on top/bottom connector configs
  const isCornerEnabled = (corner: CornerType): boolean => {
    const isTop = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';
    const isLeft = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';
    const cfg = isTop ? topConnectors : bottomConnectors;

    // Default: minifix enabled on both sides (backward compatible)
    if (!cfg || cfg.connectionType === 'minifix') {
      const side = isLeft ? cfg?.left : cfg?.right;
      return side?.enabled !== false; // default true
    }
    // connectionType === 'none' → skip this corner
    return false;
  };

  // Process each corner
  for (const corner of CORNERS) {
    // Skip corners disabled by top/bottom connector config
    if (!isCornerEnabled(corner)) continue;

    const cornerAngle = getCornerAngle(corner);
    const cornerJointMode = getJointMode(corner);

    // Generate points for each System32 position (AUTO-CALCULATED)
    for (let i = 0; i < sys32Positions.length; i++) {
      const sys32Z = sys32Positions[i];
      const result = generateCornerJointPoints(corner, sys32Z, i, panelsByRole, fullConfig, fullParams, cornerAngle, cornerJointMode);

      // Add CAM point
      if (result.camPoint) {
        const points = panelPointsMap.get(result.camPoint.panelId) || [];
        points.push(result.camPoint);
        panelPointsMap.set(result.camPoint.panelId, points);
      }

      // Add BOLT point
      if (result.boltPoint) {
        const points = panelPointsMap.get(result.boltPoint.panelId) || [];
        points.push(result.boltPoint);
        panelPointsMap.set(result.boltPoint.panelId, points);
      }

      // Add BOLT_ENTRY point (horizontal edge bore, used for merged display/CSG direction)
      if (result.boltEntryPoint) {
        const points = panelPointsMap.get(result.boltEntryPoint.panelId) || [];
        points.push(result.boltEntryPoint);
        panelPointsMap.set(result.boltEntryPoint.panelId, points);
      }

      // Add BOLT_THREAD point (vertical pilot)
      if (result.boltThreadPoint) {
        const points = panelPointsMap.get(result.boltThreadPoint.panelId) || [];
        points.push(result.boltThreadPoint);
        panelPointsMap.set(result.boltThreadPoint.panelId, points);
      }

      // Add DOWEL points
      for (const dowel of result.dowelPoints) {
        const points = panelPointsMap.get(dowel.panelId) || [];
        points.push(dowel);
        panelPointsMap.set(dowel.panelId, points);
      }
    }
  }

  // ========================================
  // SHELF JUNCTION CONNECTORS
  // ========================================
  // Generate Minifix drill points at shelf-to-side-panel junctions
  // Only for shelves configured with connectionType = 'minifix'
  {
    const shelfConnectors = cabinet.structure?.shelfConnectors;
    const leftSide = panelsByRole['LEFT_SIDE'];
    const rightSide = panelsByRole['RIGHT_SIDE'];

    if (shelfConnectors && (leftSide || rightSide)) {
      // Find all SHELF panels sorted by Y position (bottom to top)
      const shelfPanels = cabinet.panels
        .filter(p => p.role === 'SHELF')
        .sort((a, b) => a.position[1] - b.position[1]);

      for (let shelfIdx = 0; shelfIdx < shelfPanels.length; shelfIdx++) {
        const shelfPanel = shelfPanels[shelfIdx];
        const shelfKey = String(shelfIdx);
        const shelfConfig = shelfConnectors[shelfKey];

        // Skip shelves that don't have minifix connectors configured
        if (!shelfConfig || shelfConfig.connectionType !== 'minifix') continue;

        const shelfAabb = calculatePanelAABB(shelfPanel);
        const shelfRunLength = shelfAabb.max[2] - shelfAabb.min[2]; // Z span = depth run

        // Calculate System 32 positions for this shelf's depth
        // ALWAYS auto-calculate from shelf depth — same algorithm as TOP/BOTTOM corners.
        // This ensures shelf connector count and spacing matches TOP/BOTTOM exactly.
        const shelfGroupKey = `shelf_${shelfIdx}`;
        const shelfCountOverride = perGroupOverrides?.[shelfGroupKey];
        const shelfSys32Positions = buildCadConnectorRunPositions(
            shelfRunLength,
            fullParams.firstHoleZ,
            shelfCountOverride ?? computeConnectorCount(shelfRunLength),
          );

        // LEFT side junction
        if (shelfConfig.left?.enabled && leftSide) {
          const shelfCornerLeft: ShelfCornerType = `SHELF_${shelfIdx}_LEFT`;

          for (let i = 0; i < shelfSys32Positions.length; i++) {
            const sys32Z = shelfSys32Positions[i];
            const result = generateShelfJointPoints(
              shelfCornerLeft, sys32Z, i, shelfPanel, leftSide, fullConfig, fullParams,
            );

            // Add all points to panel map
            if (result.camPoint) {
              const points = panelPointsMap.get(result.camPoint.panelId) || [];
              points.push(result.camPoint);
              panelPointsMap.set(result.camPoint.panelId, points);
            }
            if (result.boltPoint) {
              const points = panelPointsMap.get(result.boltPoint.panelId) || [];
              points.push(result.boltPoint);
              panelPointsMap.set(result.boltPoint.panelId, points);
            }
            if (result.boltEntryPoint) {
              const points = panelPointsMap.get(result.boltEntryPoint.panelId) || [];
              points.push(result.boltEntryPoint);
              panelPointsMap.set(result.boltEntryPoint.panelId, points);
            }
            if (result.boltThreadPoint) {
              const points = panelPointsMap.get(result.boltThreadPoint.panelId) || [];
              points.push(result.boltThreadPoint);
              panelPointsMap.set(result.boltThreadPoint.panelId, points);
            }
            for (const dowel of result.dowelPoints) {
              const points = panelPointsMap.get(dowel.panelId) || [];
              points.push(dowel);
              panelPointsMap.set(dowel.panelId, points);
            }
          }
        }

        // RIGHT side junction
        if (shelfConfig.right?.enabled && rightSide) {
          const shelfCornerRight: ShelfCornerType = `SHELF_${shelfIdx}_RIGHT`;

          // Use same auto-calculated positions for right side (matching TOP/BOTTOM symmetry)
          const rightSys32Positions = shelfSys32Positions;

          for (let i = 0; i < rightSys32Positions.length; i++) {
            const sys32Z = rightSys32Positions[i];
            const result = generateShelfJointPoints(
              shelfCornerRight, sys32Z, i, shelfPanel, rightSide, fullConfig, fullParams,
            );

            if (result.camPoint) {
              const points = panelPointsMap.get(result.camPoint.panelId) || [];
              points.push(result.camPoint);
              panelPointsMap.set(result.camPoint.panelId, points);
            }
            if (result.boltPoint) {
              const points = panelPointsMap.get(result.boltPoint.panelId) || [];
              points.push(result.boltPoint);
              panelPointsMap.set(result.boltPoint.panelId, points);
            }
            if (result.boltEntryPoint) {
              const points = panelPointsMap.get(result.boltEntryPoint.panelId) || [];
              points.push(result.boltEntryPoint);
              panelPointsMap.set(result.boltEntryPoint.panelId, points);
            }
            if (result.boltThreadPoint) {
              const points = panelPointsMap.get(result.boltThreadPoint.panelId) || [];
              points.push(result.boltThreadPoint);
              panelPointsMap.set(result.boltThreadPoint.panelId, points);
            }
            for (const dowel of result.dowelPoints) {
              const points = panelPointsMap.get(dowel.panelId) || [];
              points.push(dowel);
              panelPointsMap.set(dowel.panelId, points);
            }
          }
        }
      }
    }
  }

  // ========================================
  // BACK PANEL OVERLAY CONNECTORS
  // ========================================
  // Generate Minifix + Dowel drill points at back panel ↔ side panel junctions.
  // Only for overlay construction where back panel covers side panel back edges.
  {
    const backPanel = panelsByRole['BACK'];
    const leftSide = panelsByRole['LEFT_SIDE'];
    const rightSide = panelsByRole['RIGHT_SIDE'];
    const backPanelConstruction = cabinet.structure?.backPanelConstruction;

    // Auto-enable: if overlay construction with back panel, default to enabled
    // This handles both explicit config AND legacy cabinets without backPanelConnectors
    const backPanelConnectors = cabinet.structure?.backPanelConnectors
      ?? (backPanelConstruction === 'overlay'
        ? DEFAULT_BACK_PANEL_CONNECTOR_CONFIG  // fallback: use default (enabled=false→true below)
        : undefined);
    const backConnectorsEnabled = backPanelConstruction === 'overlay'
      && backPanel
      && (leftSide || rightSide)
      && (backPanelConnectors?.enabled !== false);  // enabled unless explicitly disabled

    if (backConnectorsEnabled && backPanelConnectors && backPanel) {
      const backAabb = calculatePanelAABB(backPanel);
      const backRunLength = backAabb.max[1] - backAabb.min[1]; // Y span = height run

      const backCountOverride = perGroupOverrides?.['back'];
      const backSys32Positions = buildCadConnectorRunPositions(
        backRunLength,
        fullParams.firstHoleZ,
        backCountOverride ?? computeConnectorCount(backRunLength),
      );

      // Helper to push all result points into panelPointsMap
      const pushResult = (result: CornerJointResult) => {
        if (result.camPoint) {
          const points = panelPointsMap.get(result.camPoint.panelId) || [];
          points.push(result.camPoint);
          panelPointsMap.set(result.camPoint.panelId, points);
        }
        if (result.boltPoint) {
          const points = panelPointsMap.get(result.boltPoint.panelId) || [];
          points.push(result.boltPoint);
          panelPointsMap.set(result.boltPoint.panelId, points);
        }
        if (result.boltEntryPoint) {
          const points = panelPointsMap.get(result.boltEntryPoint.panelId) || [];
          points.push(result.boltEntryPoint);
          panelPointsMap.set(result.boltEntryPoint.panelId, points);
        }
        if (result.boltThreadPoint) {
          const points = panelPointsMap.get(result.boltThreadPoint.panelId) || [];
          points.push(result.boltThreadPoint);
          panelPointsMap.set(result.boltThreadPoint.panelId, points);
        }
        for (const dowel of result.dowelPoints) {
          const points = panelPointsMap.get(dowel.panelId) || [];
          points.push(dowel);
          panelPointsMap.set(dowel.panelId, points);
        }
      };

      // LEFT side junction (BACK ↔ LEFT_SIDE)
      if (backPanelConnectors.left.enabled && leftSide) {
        for (let i = 0; i < backSys32Positions.length; i++) {
          const sys32Y = backSys32Positions[i];
          const backCorner: BackCornerType = 'BACK_LEFT';
          const configWithDowels = {
            ...fullConfig,
            includeDowel: backPanelConnectors.left.includeDowels && fullConfig.includeDowel,
          };
          const result = generateBackPanelJointPoints(
            backCorner, sys32Y, i, backPanel, leftSide, configWithDowels, fullParams,
          );
          pushResult(result);
        }
      }

      // RIGHT side junction (BACK ↔ RIGHT_SIDE)
      if (backPanelConnectors.right.enabled && rightSide) {
        for (let i = 0; i < backSys32Positions.length; i++) {
          const sys32Y = backSys32Positions[i];
          const backCorner: BackCornerType = 'BACK_RIGHT';
          const configWithDowels = {
            ...fullConfig,
            includeDowel: backPanelConnectors.right.includeDowels && fullConfig.includeDowel,
          };
          const result = generateBackPanelJointPoints(
            backCorner, sys32Y, i, backPanel, rightSide, configWithDowels, fullParams,
          );
          pushResult(result);
        }
      }
    }
  }

  // ========================================
  // B-RUN: WIDTH AXIS DOWEL POSITIONS
  // ========================================
  // B-run = dowel-only along width (X) for lateral alignment / anti-rack.
  // Spec: always 2 positions per corner. If panel too narrow (< 2× firstHoleZ)
  // buildCadConnectorRunPositions may return 1 or collapse — warn and skip.
  if (fullConfig.includeDowel && topPanel) {
    const topAabb = calculatePanelAABB(topPanel);
    const widthSpan = topAabb.max[0] - topAabb.min[0]; // X span = width
    const minSpanForBRun = fullParams.firstHoleZ * 2; // need room for 2 setback positions

    if (widthSpan >= minSpanForBRun) {
      const sys32WidthPositions = buildCadConnectorRunPositions(widthSpan, fullParams.firstHoleZ, 2); // B-run always 2

      for (const corner of CORNERS) {
        // Skip B-run dowels for corners disabled by connector config
        if (!isCornerEnabled(corner)) continue;

        for (let i = 0; i < sys32WidthPositions.length; i++) {
          const sys32X = sys32WidthPositions[i]!;
          const bRunPoints = generateBRunDowelPoints(corner, sys32X, i, panelsByRole, fullConfig);
          for (const point of bRunPoints) {
            const points = panelPointsMap.get(point.panelId) || [];
            points.push(point);
            panelPointsMap.set(point.panelId, points);
          }
        }
      }
    } else if (import.meta.env.DEV) {
      console.warn(
        `[DrillMap] B-run skipped: widthSpan ${widthSpan.toFixed(1)}mm < ${minSpanForBRun}mm minimum`,
      );
    }
  }

  // ========================================
  // CENTRALIZED HARDWARE CATALOG ENRICHMENT
  // ========================================
  // Enrich ALL drill points with hardware name + catalog number.
  // Done here (after all generation) so every branch benefits:
  // OVERLAY corners, INSET corners, shelf junctions, B-run dowels, back panel.
  for (const [, pts] of panelPointsMap) {
    for (const pt of pts) {
      if (pt.hardwareName && pt.catalogNo) continue; // already enriched (shouldn't happen, but safe)
      const catalog = lookupHardwareCatalog(pt.purpose, pt.diameter, pt.depth, fullConfig, {
        specLength: pt.specLength,
        model: 'S200',  // TODO: derive from cabinet hardware config
      });
      pt.hardwareName = catalog.hardwareName;
      pt.catalogNo = catalog.catalogNo;
    }
  }

  // Convert map to DrillMapPanel array
  for (const panel of cabinet.panels) {
    const points = panelPointsMap.get(panel.id) || [];
    if (points.length === 0) continue;

    const drillPanel: DrillMapPanel = {
      panelId: panel.id,
      role: panel.role,
      dimensions: {
        width: panel.finishWidth,
        height: panel.finishHeight,
        thickness: panel.computed.realThickness,
      },
      worldPosition: panel.position,
      worldRotation: panel.rotation,
      points,
    };

    drillMap.panels.push(drillPanel);

    // Update stats
    if (drillMap.stats) {
      for (const point of points) {
        drillMap.stats.totalDrills = (drillMap.stats.totalDrills ?? 0) + 1;
        if (point.diameter > 10) {
          drillMap.stats.totalBores = (drillMap.stats.totalBores ?? 0) + 1;
        }
        drillMap.stats.byPurpose[point.purpose] = (drillMap.stats.byPurpose[point.purpose] ?? 0) + 1;
      }
    }
  }

  // Attach traceability meta
  drillMap.meta = meta;

  // ========================================
  // POST-GENERATION VALIDATION: bolt → pocket linkage contract
  // ========================================
  if (import.meta.env.DEV) {
    const allPoints = drillMap.panels.flatMap(p => p.points);

    const linkageIssues = validateBoltPocketLinkage(allPoints);
    if (linkageIssues.length > 0) {
      console.warn(
        '[DrillMap] bolt→pocket linkage contract violated:',
        linkageIssues,
      );
    }

    const bRunIssues = validateBRunDowelPairing(allPoints);
    if (bRunIssues.length > 0) {
      // Group by code for concise dev output
      const byCode = new Map<string, number>();
      for (const i of bRunIssues) byCode.set(i.code, (byCode.get(i.code) ?? 0) + 1);
      const summary = [...byCode.entries()].map(([c, n]) => `${c}:${n}`).join(', ');
      console.warn(
        `[DrillMap] B-run dowel pairing: ${bRunIssues.length} issue(s) [${summary}]`,
        bRunIssues,
      );
    }
  }

  return drillMap;
}

// ============================================
// EXPORTS
// ============================================

export { generateMinifixDrillMap as generateDrillMap };
export { DEFAULT_MINIFIX_CONFIG };
export { SYSTEM32 as SYSTEM32_PARAMS };
export { MATING_THRESHOLD };

// Re-export panel basis utilities for external use
export {
  calculatePanelAABB,
  getPanelBasisFromAABB,
  panelLocalToWorld,
  boltEdgePointFromSideAABB,        // v3.x legacy (Top-on-Side construction)
  boltFacePointFromSideAABB_v4,     // v4.0 (Side-covers-Top construction)
  boltEntryEdgePointFromHorizAABB,  // v4.0 (optional through-hole for bolt passage)
  buildSystem32PositionsAuto,
  type System32AutoParams,
} from './panelBasis';

// Export coordinate mapping functions for testing
export { cornerToLocalXY_TopBottom, cornerToLocalXY_Side };

// ============================================================================
// CONNECTOR POSITION SELECTION (Häfele CAD Spec)
// ============================================================================

/**
 * Position type: CORNER positions at front/back, MIDDLE at center
 */
export type ConnectorPositionType = 'CORNER' | 'MIDDLE';

/**
 * A selected connector position along the depth axis.
 */
export interface ConnectorPosition {
  /** Sequential index (0-based) */
  index: number;
  /** System32 Z coordinate */
  sys32Z: number;
  /** Position type */
  type: ConnectorPositionType;
}

/**
 * Select connector positions from available System32 holes based on depth.
 *
 * Häfele CAD specification:
 * - depth < 400mm: 2 CORNER positions (first + last)
 * - depth >= 400mm: 2 CORNER + 1 MIDDLE (closest to center)
 *
 * @param sys32Positions - Available System32 Z positions (sorted ascending)
 * @param depth - Cabinet depth in mm (B dimension)
 * @returns Selected positions with type annotations
 */
export function selectConnectorPositions(
  sys32Positions: number[],
  depth: number
): ConnectorPosition[] {
  if (sys32Positions.length === 0) return [];

  if (sys32Positions.length === 1) {
    return [{ index: 0, sys32Z: sys32Positions[0], type: 'CORNER' }];
  }

  const first = sys32Positions[0];
  const last = sys32Positions[sys32Positions.length - 1];

  // B < 400: 2 corners only
  if (depth < 400) {
    return [
      { index: 0, sys32Z: first, type: 'CORNER' },
      { index: 1, sys32Z: last, type: 'CORNER' },
    ];
  }

  // B >= 400: 2 corners + 1 middle (if room)
  // Need at least 3 positions for a distinct middle
  if (sys32Positions.length < 3) {
    return [
      { index: 0, sys32Z: first, type: 'CORNER' },
      { index: 1, sys32Z: last, type: 'CORNER' },
    ];
  }

  // Find position closest to geometric center
  const centerZ = (first + last) / 2;
  const middleCandidates = sys32Positions.slice(1, -1); // exclude first/last
  let bestMiddle = middleCandidates[0];
  let bestDist = Math.abs(bestMiddle - centerZ);
  for (const z of middleCandidates) {
    const dist = Math.abs(z - centerZ);
    if (dist < bestDist) {
      bestDist = dist;
      bestMiddle = z;
    }
  }

  return [
    { index: 0, sys32Z: first, type: 'CORNER' },
    { index: 1, sys32Z: bestMiddle, type: 'MIDDLE' },
    { index: 2, sys32Z: last, type: 'CORNER' },
  ];
}
