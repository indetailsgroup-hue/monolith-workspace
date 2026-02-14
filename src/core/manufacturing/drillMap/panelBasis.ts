/**
 * panelBasis.ts - v1.0
 *
 * Robust Panel Basis calculation using AABB (Axis-Aligned Bounding Box).
 * Derives panel-local coordinate system from world bounds, avoiding
 * issues with Z-bias (-ET/2) in panel.position.
 *
 * COORDINATE CONVENTIONS:
 * - World: X (left→right), Y (bottom→top), Z (back→front, -D to 0)
 * - Panel-local (machining face): x=0,y=0 at bottom-front corner
 *   - +x = along face width (toward right/back depending on role)
 *   - +y = along face height (upward)
 *   - u = depth axis (into material)
 */

import type { Vec3Tuple, CornerType } from './types';
import type { CabinetPanel, PanelRole } from '../../types/Cabinet';

// ============================================
// TYPES
// ============================================

export interface Box3Like {
  min: Vec3Tuple;
  max: Vec3Tuple;
}

/**
 * Panel World Basis - defines machining face coordinate system in world space
 */
export interface PanelWorldBasis {
  /** World position of panel-local (0,0) on machining face */
  origin: Vec3Tuple;

  /** +X axis direction on machining face (rightward on face) */
  xAxis: Vec3Tuple;

  /** +Y axis direction on machining face (upward on face) */
  yAxis: Vec3Tuple;

  /** Depth axis direction (into material, perpendicular to face) */
  uAxis: Vec3Tuple;

  /** Face width along xAxis (mm) */
  faceWidth: number;

  /** Face height along yAxis (mm) */
  faceHeight: number;

  /** Panel thickness (mm) */
  thickness: number;

  /** Panel role for reference */
  role: PanelRole;
}

/**
 * Panel-local point on machining face
 */
export interface PanelLocalPoint {
  /** X coordinate on machining face (mm) */
  x: number;

  /** Y coordinate on machining face (mm) */
  y: number;

  /** Corner type for this point */
  corner: CornerType;

  /** Depth from front edge - System 32 position (mm) */
  depthPositionFromFront: number;

  /** Edge distance A - geometric offset (mm) */
  edgeDistanceA: number;

  /** Drilling distance B - catalog spec (mm) */
  drillingDistanceB?: number;
}

// ============================================
// VECTOR UTILITIES
// ============================================

export function vecAdd(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vecSub(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vecMul(a: Vec3Tuple, s: number): Vec3Tuple {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function vecDot(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vecLen(a: Vec3Tuple): number {
  return Math.sqrt(vecDot(a, a));
}

export function vecNorm(a: Vec3Tuple): Vec3Tuple {
  const len = vecLen(a);
  if (len < 1e-9) return [0, 0, 0];
  return [a[0] / len, a[1] / len, a[2] / len];
}

// ============================================
// AABB CALCULATION
// ============================================

/**
 * Calculate AABB from panel center position and dimensions.
 * Handles the Z-bias issue by computing actual bounds.
 *
 * NOTE: Panel position is CENTER of box geometry.
 * For TOP/BOTTOM panels: width=W, height=D (depth as height)
 * For LEFT/RIGHT panels: width=D, height=H (depth as width)
 */
export function calculatePanelAABB(panel: CabinetPanel): Box3Like {
  const [px, py, pz] = panel.position;
  const T = panel.computed.realThickness;

  // Determine box dimensions based on role
  // Panel geometry in Three.js: BoxGeometry(width, thickness, depth)
  // But panel data stores: finishWidth, finishHeight
  let boxW: number, boxH: number, boxD: number;

  if (panel.role === 'TOP' || panel.role === 'BOTTOM') {
    // Horizontal panel: lies flat
    // finishWidth = cabinet width (X direction)
    // finishHeight = cabinet depth (Z direction)
    boxW = panel.finishWidth;   // X extent
    boxH = T;                   // Y extent (thickness)
    boxD = panel.finishHeight;  // Z extent
  } else if (panel.role === 'LEFT_SIDE' || panel.role === 'RIGHT_SIDE') {
    // Vertical panel: stands upright
    // finishWidth = cabinet depth (Z direction)
    // finishHeight = cabinet height (Y direction)
    boxW = T;                   // X extent (thickness)
    boxH = panel.finishHeight;  // Y extent
    boxD = panel.finishWidth;   // Z extent
  } else {
    // Default for BACK, SHELF, etc.
    boxW = panel.finishWidth;
    boxH = panel.finishHeight;
    boxD = T;
  }

  // Calculate AABB from center position
  const min: Vec3Tuple = [
    px - boxW / 2,
    py - boxH / 2,
    pz - boxD / 2,
  ];
  const max: Vec3Tuple = [
    px + boxW / 2,
    py + boxH / 2,
    pz + boxD / 2,
  ];

  return { min, max };
}

// ============================================
// PANEL BASIS FROM AABB
// ============================================

/**
 * Get Panel World Basis from AABB - ROBUST method that doesn't depend on pz bias.
 *
 * WORLD COORDINATE SYSTEM (your system):
 * - X: left → right
 * - Y: bottom → top
 * - Z: back → front (-D to 0, so front = maxZ)
 *
 * Machining face = interior-facing surface of the panel:
 * - TOP: BOTTOM face (y = minY) - drilling INTO material goes UP (+Y)
 * - BOTTOM: TOP face (y = maxY) - drilling INTO material goes DOWN (-Y)
 * - LEFT_SIDE: RIGHT face (x = maxX) - drilling INTO material goes LEFT (-X)
 * - RIGHT_SIDE: LEFT face (x = minX) - drilling INTO material goes RIGHT (+X)
 *
 * Origin = front-left corner of machining face (front = maxZ)
 */
export function getPanelBasisFromAABB(panel: CabinetPanel, aabb: Box3Like): PanelWorldBasis {
  const T = panel.computed.realThickness;

  // AABB bounds
  const [minX, minY, minZ] = aabb.min;
  const [maxX, maxY, maxZ] = aabb.max;

  // AABB sizes
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;

  switch (panel.role) {
    case 'TOP': {
      // Machining face = BOTTOM face of TOP panel (y = minY)
      // This is the interior-facing surface
      //
      // Panel-local coordinates:
      // - localX: left → right (world +X)
      // - localY: front → back (world -Z)
      // - localU: into material = upward (world +Y)
      //
      // Origin = front-left corner on machining face
      return {
        origin: [minX, minY, maxZ],     // front-left on machining face
        xAxis: [1, 0, 0],               // +localX = +X (right)
        yAxis: [0, 0, -1],              // +localY = -Z (toward back)
        uAxis: [0, 1, 0],               // +localU = +Y (into material, upward)
        faceWidth: sizeX,               // X span
        faceHeight: sizeZ,              // Z span
        thickness: T,
        role: panel.role,
      };
    }

    case 'BOTTOM': {
      // Machining face = TOP face of BOTTOM panel (y = maxY)
      //
      // Panel-local coordinates:
      // - localX: left → right (world +X)
      // - localY: front → back (world -Z)
      // - localU: into material = downward (world -Y)
      //
      // Origin = front-left corner on machining face
      return {
        origin: [minX, maxY, maxZ],     // front-left on machining face
        xAxis: [1, 0, 0],               // +localX = +X (right)
        yAxis: [0, 0, -1],              // +localY = -Z (toward back)
        uAxis: [0, -1, 0],              // +localU = -Y (into material, downward)
        faceWidth: sizeX,               // X span
        faceHeight: sizeZ,              // Z span
        thickness: T,
        role: panel.role,
      };
    }

    case 'LEFT_SIDE': {
      // Machining face = RIGHT face of LEFT_SIDE panel (x = maxX)
      //
      // Panel-local coordinates:
      // - localX: front → back (world -Z)
      // - localY: bottom → top (world +Y)
      // - localU: into material = leftward (world -X)
      //
      // Origin = front-bottom corner on machining face
      return {
        origin: [maxX, minY, maxZ],     // front-bottom on machining face
        xAxis: [0, 0, -1],              // +localX = -Z (toward back)
        yAxis: [0, 1, 0],               // +localY = +Y (up)
        uAxis: [-1, 0, 0],              // +localU = -X (into material, leftward)
        faceWidth: sizeZ,               // Z span
        faceHeight: sizeY,              // Y span
        thickness: T,
        role: panel.role,
      };
    }

    case 'RIGHT_SIDE': {
      // Machining face = LEFT face of RIGHT_SIDE panel (x = minX)
      //
      // Panel-local coordinates:
      // - localX: front → back (world -Z)
      // - localY: bottom → top (world +Y)
      // - localU: into material = rightward (world +X)
      //
      // Origin = front-bottom corner on machining face
      return {
        origin: [minX, minY, maxZ],     // front-bottom on machining face
        xAxis: [0, 0, -1],              // +localX = -Z (toward back)
        yAxis: [0, 1, 0],               // +localY = +Y (up)
        uAxis: [1, 0, 0],               // +localU = +X (into material, rightward)
        faceWidth: sizeZ,               // Z span
        faceHeight: sizeY,              // Y span
        thickness: T,
        role: panel.role,
      };
    }

    default:
      throw new Error(`Unsupported panel role for basis calculation: ${panel.role}`);
  }
}

// ============================================
// COORDINATE TRANSFORMATIONS
// ============================================

/**
 * Convert panel-local (x, y) on machining face to world coordinates.
 */
export function panelLocalToWorld(basis: PanelWorldBasis, x: number, y: number): Vec3Tuple {
  return vecAdd(basis.origin, vecAdd(vecMul(basis.xAxis, x), vecMul(basis.yAxis, y)));
}

/**
 * Convert corner type + offsets to panel-local (x, y) for HORIZONTAL panels (TOP/BOTTOM).
 *
 * For TOP/BOTTOM panels:
 * - localX = left → right (cabinet width direction)
 * - localY = front → back (cabinet depth direction, System32 axis)
 *
 * @param faceW - Face width (mm) - cabinet width
 * @param faceH - Face height (mm) - cabinet depth (System32 direction)
 * @param corner - Corner type (which joint this connector belongs to)
 * @param endOffset - Distance from left/right edge (mm) - typically 40mm
 * @param depthFromFront - System 32 position from front edge (mm) - typically 37mm
 */
export function cornerToLocalXY(
  faceW: number,
  faceH: number,
  corner: CornerType,
  endOffset: number,
  depthFromFront: number
): { x: number; y: number } {
  // For TOP/BOTTOM panels:
  // - All connectors at same depth from front (depthFromFront = 37mm)
  // - LEFT corners: x = endOffset from left edge
  // - RIGHT corners: x = endOffset from right edge

  switch (corner) {
    case 'TOP_LEFT':
    case 'BOTTOM_LEFT':
      return { x: endOffset, y: depthFromFront };

    case 'TOP_RIGHT':
    case 'BOTTOM_RIGHT':
      return { x: faceW - endOffset, y: depthFromFront };

    default:
      return { x: endOffset, y: depthFromFront };
  }
}

/**
 * Convert corner type + offsets to panel-local (x, y) for VERTICAL panels (LEFT_SIDE/RIGHT_SIDE).
 *
 * For SIDE panels:
 * - localX = front → back (cabinet depth direction, System32 axis)
 * - localY = bottom → top (cabinet height direction)
 *
 * @param faceW - Face width (mm) - cabinet depth (System32 direction)
 * @param faceH - Face height (mm) - cabinet height
 * @param corner - Corner type (which joint this connector belongs to)
 * @param endOffset - Distance from top/bottom edge (mm) - typically 40mm
 * @param depthFromFront - System 32 position from front edge (mm) - typically 37mm
 */
export function cornerToLocalXY_Side(
  faceW: number,
  faceH: number,
  corner: CornerType,
  endOffset: number,
  depthFromFront: number
): { x: number; y: number } {
  // For SIDE panels:
  // - localX = depth direction (System32: 37mm from front)
  // - localY = height direction
  // - TOP corners: y = endOffset from top edge
  // - BOTTOM corners: y = endOffset from bottom edge

  switch (corner) {
    case 'TOP_LEFT':
    case 'TOP_RIGHT':
      // Near TOP edge: y = endOffset from top
      return { x: depthFromFront, y: faceH - endOffset };

    case 'BOTTOM_LEFT':
    case 'BOTTOM_RIGHT':
      // Near BOTTOM edge: y = endOffset from bottom
      return { x: depthFromFront, y: endOffset };

    default:
      return { x: depthFromFront, y: endOffset };
  }
}

/**
 * Clamp value to range [min, max]
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Build System 32 positions along axis (fixed count).
 *
 * @param count - Number of connector positions
 * @param first - First hole position (default: 37mm)
 * @param pitch - Distance between holes (default: 32mm)
 */
export function buildSystem32Positions(count: number, first: number = 37, pitch: number = 32): number[] {
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    positions.push(first + i * pitch);
  }
  return positions;
}

/**
 * System 32 auto-calculation parameters
 */
export interface System32AutoParams {
  firstHole: number;      // First hole from front (default: 37mm)
  pitch: number;          // Distance between holes (default: 32mm)
  endOffset: number;      // Minimum distance from end edge (default: 40mm)
  maxConnectors?: number; // Optional max connectors per corner (e.g., 2 or 3)
}

/**
 * Auto-calculate System 32 positions based on run length.
 *
 * Generates positions: firstHole, firstHole+pitch, firstHole+2*pitch, ...
 * until reaching (runLength - endOffset).
 *
 * @param runLength - Total length of the System32 axis (mm)
 * @param params - System32 parameters
 * @returns Array of positions along the axis
 */
export function buildSystem32PositionsAuto(
  runLength: number,
  params: System32AutoParams
): number[] {
  const { firstHole, pitch, endOffset, maxConnectors } = params;
  const maxPos = runLength - endOffset;
  const positions: number[] = [];

  for (let i = 0; ; i++) {
    const pos = firstHole + i * pitch;
    if (pos > maxPos) break;
    positions.push(pos);
    if (maxConnectors && positions.length >= maxConnectors) break;
  }

  // Fallback for very short runs - at least one position
  if (positions.length === 0) {
    positions.push(Math.min(firstHole, Math.max(10, runLength / 2)));
  }

  return positions;
}

/**
 * Calculate dowel X positions relative to minifix position.
 * Dowels are placed at ±32mm from minifix along the X axis.
 *
 * @param xMinifix - X position of minifix on face
 * @param faceW - Face width for bounds checking
 * @param offset - Dowel offset from minifix (default: 32mm)
 */
export function buildDowelXPositions(
  xMinifix: number,
  faceW: number,
  offset: number = 32
): number[] {
  const positions: number[] = [];
  const left = xMinifix - offset;
  const right = xMinifix + offset;

  // Only include positions within bounds (with small margin)
  const margin = 10; // mm
  if (left >= margin && left <= faceW - margin) {
    positions.push(left);
  }
  if (right >= margin && right <= faceW - margin) {
    positions.push(right);
  }

  return positions;
}

// ============================================
// DRILL NORMAL CALCULATION
// ============================================

/**
 * Get drill normal direction for a given panel role and drilling type.
 *
 * CAM holes are drilled INTO the machining face (face drilling).
 * BOLT holes are drilled INTO the edge (edge drilling into end grain).
 */
export function getDrillNormal(
  basis: PanelWorldBasis,
  drillType: 'CAM' | 'BOLT' | 'DOWEL'
): Vec3Tuple {
  // For face drilling (CAM), drill into the panel along uAxis
  // For edge drilling (BOLT), drill perpendicular to face edge
  // For now, all use uAxis (into machining face)
  return basis.uAxis;
}

/**
 * Determine which panel receives CAM vs BOLT for a given corner.
 *
 * Convention:
 * - CAM holes go into horizontal panels (TOP/BOTTOM) - face drilling
 * - BOLT holes go into vertical panels (LEFT_SIDE/RIGHT_SIDE) - edge drilling
 */
export function getJointPanelRoles(corner: CornerType): {
  camPanelRole: PanelRole;
  boltPanelRole: PanelRole;
} {
  const isTop = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';
  const isLeft = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';

  return {
    camPanelRole: isTop ? 'TOP' : 'BOTTOM',
    boltPanelRole: isLeft ? 'LEFT_SIDE' : 'RIGHT_SIDE',
  };
}

// ============================================
// BOLT EDGE DRILLING POSITION
// ============================================

/**
 * Result of bolt edge position calculation
 */
export interface BoltEdgePoint {
  /** World position for BOLT drill entry */
  position: Vec3Tuple;
  /** Drill direction (into edge) */
  normal: Vec3Tuple;
}

/**
 * @deprecated Do not use - Distance B > panel thickness makes this calculation invalid.
 * Use boltEdgePointFromSideAABB() instead for standard Minifix joints.
 *
 * This function attempted FACE drilling with Distance B (24mm) from inner face,
 * but for 18mm panels, this would place the bolt OUTSIDE the panel.
 *
 * INCORRECT: Calculate BOLT drill entry point for FACE drilling on vertical (SIDE) panels.
 */
export function boltFacePointFromSideAABB(
  corner: CornerType,
  sideAabb: Box3Like,
  sys32Z: number,
  camY: number,
  distanceB: number = 24
): BoltEdgePoint {
  const [minX, , ] = sideAabb.min;
  const [maxX, , maxZ] = sideAabb.max;

  const isLeftSide = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';

  // x = Distance B from inner face into the panel
  // LEFT panel: inner face at maxX, drill toward minX
  // RIGHT panel: inner face at minX, drill toward maxX
  const x = isLeftSide
    ? maxX - distanceB  // Left panel: inner face (maxX) - B
    : minX + distanceB; // Right panel: inner face (minX) + B

  // y = CAM Y position (where bolt engages the CAM)
  const y = camY;

  // z = System32 depth from front (front = maxZ)
  const z = maxZ - sys32Z;

  // normal = drill direction (into panel, toward outer face)
  // LEFT panel: drill toward minX (left) = [-1, 0, 0]
  // RIGHT panel: drill toward maxX (right) = [1, 0, 0]
  const normal: Vec3Tuple = isLeftSide ? [-1, 0, 0] : [1, 0, 0];

  return {
    position: [x, y, z],
    normal,
  };
}

/**
 * Calculate BOLT drill entry point for EDGE drilling on vertical (SIDE) panels.
 *
 * @deprecated Use boltFacePointFromSideAABB_v4() for Side-covers-Top construction.
 *
 * BOLT holes are drilled INTO the TOP or BOTTOM EDGE of the SIDE panel (end grain).
 * This is for Top-on-Side construction (v3.x).
 *
 * For TOP corners (TOP_LEFT, TOP_RIGHT):
 * - Bolt is drilled DOWN into the top edge (y = maxY)
 * - normal = [0, -1, 0] (drill downward)
 *
 * For BOTTOM corners (BOTTOM_LEFT, BOTTOM_RIGHT):
 * - Bolt is drilled UP into the bottom edge (y = minY)
 * - normal = [0, 1, 0] (drill upward)
 *
 * X position is at the CENTER of panel thickness (for edge drilling into end grain).
 * Distance B (24mm) is measured on the HORIZONTAL panel from edge to bolt axis.
 *
 * @param corner - Corner type (determines top vs bottom edge)
 * @param sideAabb - AABB of the SIDE panel
 * @param sys32Z - System 32 depth from front (e.g., 37mm)
 * @returns Position and normal for edge drilling
 */
export function boltEdgePointFromSideAABB(
  corner: CornerType,
  sideAabb: Box3Like,
  sys32Z: number
): BoltEdgePoint {
  const [minX, minY, ] = sideAabb.min;
  const [maxX, maxY, maxZ] = sideAabb.max;

  const isTopCorner = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';

  // x = center of panel thickness
  const x = (minX + maxX) / 2;

  // y = top edge (maxY) for top corners, bottom edge (minY) for bottom corners
  const y = isTopCorner ? maxY : minY;

  // z = System32 depth from front (front = maxZ)
  const z = maxZ - sys32Z;

  // normal = drill direction (into edge)
  const normal: Vec3Tuple = isTopCorner ? [0, -1, 0] : [0, 1, 0];

  return {
    position: [x, y, z],
    normal,
  };
}

// ============================================
// V4.0 - SIDE-COVERS-TOP CONSTRUCTION
// ============================================

/**
 * Calculate BOLT drill entry point for FACE drilling on vertical (SIDE) panels.
 *
 * v4.0 "Side-covers-Top/Bottom" construction:
 * BOLT holes are drilled INTO the INNER FACE of the SIDE panel (face bore).
 * The bolt shaft passes through an edge bore on the TOP/BOTTOM panel.
 *
 * For LEFT_SIDE panels (TOP_LEFT, BOTTOM_LEFT corners):
 * - Inner face at x = maxX (right side of left panel)
 * - Drill direction = [-1, 0, 0] (leftward into material)
 *
 * For RIGHT_SIDE panels (TOP_RIGHT, BOTTOM_RIGHT corners):
 * - Inner face at x = minX (left side of right panel)
 * - Drill direction = [+1, 0, 0] (rightward into material)
 *
 * CRITICAL: Y position must align with CAM pocket center, NOT Distance B!
 * - Distance B is for X-axis (horizontal offset from mate edge to CAM center)
 * - Y position = camDepth/2 from TOP/BOTTOM panel mating surface
 *
 * @param corner - Corner type (determines which SIDE panel and edge)
 * @param sideAabb - AABB of the SIDE panel
 * @param sys32Z - System 32 depth from front (e.g., 37mm)
 * @param camCenterOffset - Distance from panel surface to CAM center (camDepth/2)
 * @returns Position and normal for face drilling
 */
export function boltFacePointFromSideAABB_v4(
  corner: CornerType,
  sideAabb: Box3Like,
  sys32Z: number,
  camCenterOffset: number
): BoltEdgePoint {
  const [minX, minY, ] = sideAabb.min;
  const [maxX, maxY, maxZ] = sideAabb.max;

  const isLeftSide = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';
  const isTopCorner = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';

  // x = inner face of SIDE panel (drilling entry point)
  // LEFT panel: inner face at maxX
  // RIGHT panel: inner face at minX
  const x = isLeftSide ? maxX : minX;

  // y = CAM pocket center offset from mating edge
  // CRITICAL FIX: Use camCenterOffset (camDepth/2), NOT Distance B!
  // - For 16mm wood: camDepth=12.5mm → offset=6.25mm
  // - TOP corner: bolt at (maxY - camCenterOffset) to align with CAM center
  // - BOTTOM corner: bolt at (minY + camCenterOffset) to align with CAM center
  const y = isTopCorner
    ? maxY - camCenterOffset
    : minY + camCenterOffset;

  // z = System32 depth from front (front = maxZ)
  const z = maxZ - sys32Z;

  // normal = drill direction (into SIDE panel face, horizontal X)
  // LEFT panel: drill toward minX = [-1, 0, 0]
  // RIGHT panel: drill toward maxX = [+1, 0, 0]
  const normal: Vec3Tuple = isLeftSide ? [-1, 0, 0] : [1, 0, 0];

  return {
    position: [x, y, z],
    normal,
  };
}

/**
 * Calculate BOLT_ENTRY edge bore on HORIZONTAL panel (TOP/BOTTOM).
 *
 * v4.0 "Side-covers-Top/Bottom" construction:
 * The bolt shaft passes THROUGH an edge bore on the TOP/BOTTOM panel.
 * This hole allows the bolt to reach the CAM housing on the opposite side.
 *
 * For TOP panel at LEFT corner:
 * - Drill from LEFT edge (x = minX) toward right
 * - normal = [+1, 0, 0]
 *
 * For TOP panel at RIGHT corner:
 * - Drill from RIGHT edge (x = maxX) toward left
 * - normal = [-1, 0, 0]
 *
 * Y position is at panel surface where bolt enters.
 *
 * @param corner - Corner type (determines left vs right edge)
 * @param horizAabb - AABB of the HORIZONTAL panel (TOP or BOTTOM)
 * @param sys32Z - System 32 depth from front (e.g., 37mm)
 * @param distanceB - Distance from outer edge to bolt center (24mm default)
 * @returns Position and normal for edge drilling
 */
export function boltEntryEdgePointFromHorizAABB(
  corner: CornerType,
  horizAabb: Box3Like,
  sys32Z: number,
  distanceB: number = 24
): BoltEdgePoint {
  const [minX, minY, ] = horizAabb.min;
  const [maxX, maxY, maxZ] = horizAabb.max;

  const isLeftCorner = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';
  const isTopPanel = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';

  // x = edge of horizontal panel (drilling entry point)
  // LEFT corner: drill from left edge (minX)
  // RIGHT corner: drill from right edge (maxX)
  const x = isLeftCorner ? minX : maxX;

  // y = center of panel thickness
  const y = (minY + maxY) / 2;

  // z = System32 depth from front (front = maxZ)
  const z = maxZ - sys32Z;

  // normal = drill direction (into horizontal panel edge)
  // LEFT corner: drill toward maxX = [+1, 0, 0]
  // RIGHT corner: drill toward minX = [-1, 0, 0]
  const normal: Vec3Tuple = isLeftCorner ? [1, 0, 0] : [-1, 0, 0];

  return {
    position: [x, y, z],
    normal,
  };
}
