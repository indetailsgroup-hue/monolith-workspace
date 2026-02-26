/**
 * generateDrillMap.ts - v4.0
 *
 * Deterministic Minifix S200 drill map generation using AABB-based panel basis.
 * Based on Häfele specifications and System 32.
 *
 * v4.0 MAJOR REFACTOR - SIDE-COVERS-TOP CONSTRUCTION:
 * - BOLT: Changed from EDGE drilling to FACE drilling on SIDE panels
 * - BOLT_ENTRY: Added edge bore on TOP/BOTTOM for bolt shaft passage
 * - DOWEL: Swapped depths (SIDE=12mm face, HORIZ=18mm edge)
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
 * | Bolt entry       | Ø10 (edge bore on HORIZ) |
 * | Dowel SIDE       | Ø8, 12mm (FACE_BORE)     |
 * | Dowel HORIZONTAL | Ø8, 18mm (EDGE_BORE)     |
 * | Distance B       | 24mm from MATING EDGE    |
 * | Spacing          | System32                 |
 * | Mating Tolerance | 0.1mm                    |
 */

import type { Cabinet, CabinetPanel, PanelRole } from '../../types/Cabinet';
import type {
  DrillMap,
  DrillMapPanel,
  DrillMapPoint,
  MinifixConfig,
  DrillingParams,
  Vec3Tuple,
  DrillPurpose,
  CornerType,
} from './types';
import { DEFAULT_DRILLING_PARAMS } from './types';
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
  type PanelWorldBasis,
  type Box3Like,
  type System32AutoParams,
} from './panelBasis';
import { validateBoltPocketLinkage } from './validateBoltPocketLinkage';
import {
  assertNoPreviewKeys,
  sanitizeManufacturingConfig,
} from '../../../components/ui/MinifixConfigPanel';
import { buildDrillMapMeta } from './traceability';
import { buildPairKeyV2 } from './pairKeyV2';

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

  const center = runLength / 2;
  const positions = [near, center, far]
    .filter((pos, idx, arr) => idx === 0 || Math.abs(pos - arr[idx - 1]) > 0.01)
    .sort((a, b) => a - b);

  return positions;
}

/** Default Minifix S200 config for 18mm panels (project default) */
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
  dowelDia: 8,
  dowelLength: 30,        // Total length (12 + 18 = 30mm)
  dowelOffset: 32,        // System 32 offset
  // v4.0 Split depth for Side-covers-Top construction:
  // - SIDE panel: FACE bore (shallow, avoids outer face)
  // - HORIZ panel: EDGE bore (deeper, into end grain)
  dowelDepthSideFace: 12,   // 12mm face bore into SIDE panel inner face
  dowelDepthHorizEdge: 18,  // 18mm edge bore into TOP/BOTTOM panel edge
  // Legacy fields (for backward compatibility, same as v3.5 naming)
  dowelDepthEdge: 18,       // @deprecated - use dowelDepthHorizEdge
  dowelDepthFace: 12,       // @deprecated - use dowelDepthSideFace
};

/** System 32 parameters */
const SYSTEM32: System32AutoParams = {
  firstHole: 37,      // First hole from front edge (mm)
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
 * @param sys32Z - System 32 position from front (37, 69, 101, ...)
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
 * @param sys32Z - System 32 position from front (37, 69, 101, ...)
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
 * @param sys32Z - System 32 position from front (e.g., 37, 69, 101, ...)
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
  angleDeg = 90  // Corner angle in degrees (30-150, default 90)
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


  // ========================================
  // BOLT POINT on VERTICAL panel (FACE drilling) - v4.0
  // ========================================
  // v4.0 Side-covers-Top construction:
  // BOLT is drilled INTO the INNER FACE of the SIDE panel (face bore)
  // The bolt shaft passes through an edge bore in the TOP/BOTTOM panel
  // CRITICAL: Calculate BOLT first, then align CAM with BOLT position
  const verticalAabb = calculatePanelAABB(vertical);
  const horizontalAabb = calculatePanelAABB(horizontal);

  // Use v4.0 face drilling function
  // MERGED FIX (wonderful-leakey + keen-jepsen):
  // - matingSurfaceY = real world Y from horizontal panel AABB (construction-agnostic)
  // - camCenterOffset = camDepth/2 for pocket center alignment
  const camCenterOffset = config.camDepth / 2;
  const isTopCorner = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';
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
    depth: config.sleeveLength,
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
    diameter: 7.5,
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
    // - SIDE panel: FACE bore 12mm (into inner face)
    // - TOP/BOTTOM panel: EDGE bore 18mm (into left/right edge)
    if (config.includeDowel) {
      const [, , maxZ] = verticalAabb.max;
      const isLeft = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';
      const isTopCorner = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';

      // Get SIDE panel basis for face drilling
      const sideBasis = getPanelBasisFromAABB(vertical, verticalAabb);

      // Dowels at ±32mm from BOLT position along Z axis (System 32 spacing)
      const dowelZPositions = [
        maxZ - sys32Z - config.dowelOffset,
        maxZ - sys32Z + config.dowelOffset,
      ].filter(z => z >= verticalAabb.min[2] + 10 && z <= verticalAabb.max[2] - 10);

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

        // SIDE panel: Use dowelDepthSideFace (12mm) for FACE_BORE
        result.dowelPoints.push(createDrillPoint({
          panelId: vertical.id,
          position: sideDowelPos,
          normal: facePoint.normal,  // Same drilling direction as BOLT (horizontal X)
          diameter: config.dowelDia,
          depth: config.dowelDepthSideFace ?? 12,  // 12mm face bore
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
      // This is the deeper bore (18mm) for the split depth
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

        // HORIZONTAL panel: Use dowelDepthHorizEdge (18mm) for EDGE_BORE
        result.dowelPoints.push(createDrillPoint({
          panelId: horizontal.id,
          position: horizDowelPos,
          normal: horizDowelNormal,
          diameter: config.dowelDia,
          depth: config.dowelDepthHorizEdge ?? 18,  // 18mm edge bore
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
  const connectorCount = maxConnectors ?? computeConnectorCount(sys32RunLength);
  const sys32Positions = buildCadConnectorRunPositions(
    sys32RunLength,
    fullParams.firstHoleZ,
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

  // Process each corner
  for (const corner of CORNERS) {
    const cornerAngle = getCornerAngle(corner);

    // Generate points for each System32 position (AUTO-CALCULATED)
    for (let i = 0; i < sys32Positions.length; i++) {
      const sys32Z = sys32Positions[i];
      const result = generateCornerJointPoints(corner, sys32Z, i, panelsByRole, fullConfig, fullParams, cornerAngle);

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
