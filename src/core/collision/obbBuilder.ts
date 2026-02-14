/**
 * obbBuilder.ts - Build World OBBs from Local Definitions
 *
 * ARCHITECTURE:
 * - Uses quaternion-based transform for accurate rotation
 * - Builds OBBs from local cabinet coordinates to world space
 * - Supports carcass body and use envelope generation
 *
 * DETERMINISTIC: Same inputs always produce same OBBs
 */

import type { Vec3 } from '../types/SnapTypes';
import type { OBB, CabinetCollisionShape } from './obbTypes';
import type { TransformQ } from '../math/transformQ';
import { localToWorldPoint, getCabinetAxes } from '../math/transformQ';

// ============================================
// TYPES
// ============================================

/**
 * Local box definition (in cabinet local space)
 */
export interface LocalBoxDef {
  /** Center in local coordinates (mm) */
  localCenter: Vec3;

  /** Half extents in local space (mm) */
  halfSize: Vec3;
}

/**
 * Cabinet dimensions for body OBB generation
 */
export interface CabinetDimensions {
  width: number;  // mm (X-axis)
  height: number; // mm (Y-axis)
  depth: number;  // mm (Z-axis)
}

// ============================================
// SINGLE OBB BUILDER
// ============================================

/**
 * Build world OBB from local box definition
 *
 * @param localBox - Box definition in local space
 * @param transform - Cabinet transform (position + rotation)
 * @returns OBB in world space
 */
export function buildWorldOBB(localBox: LocalBoxDef, transform: TransformQ): OBB {
  // Get world axes from quaternion
  const { axisX, axisY, axisZ } = getCabinetAxes(transform);

  // Transform local center to world
  const worldCenter = localToWorldPoint(transform, localBox.localCenter);

  return {
    center: worldCenter,
    axisX,
    axisY,
    axisZ,
    halfSize: localBox.halfSize, // Half size stays same, axes rotate
  };
}

/**
 * Build world OBB from corner position and dimensions
 * (Common pattern for cabinet carcass)
 *
 * @param cornerLocal - Local corner position (min X, min Y, min Z)
 * @param dimensions - Box dimensions
 * @param transform - Cabinet transform
 */
export function buildWorldOBBFromCorner(
  cornerLocal: Vec3,
  dimensions: CabinetDimensions,
  transform: TransformQ
): OBB {
  // Convert corner to center
  const localCenter: Vec3 = {
    x: cornerLocal.x + dimensions.width / 2,
    y: cornerLocal.y + dimensions.height / 2,
    z: cornerLocal.z + dimensions.depth / 2,
  };

  const halfSize: Vec3 = {
    x: dimensions.width / 2,
    y: dimensions.height / 2,
    z: dimensions.depth / 2,
  };

  return buildWorldOBB({ localCenter, halfSize }, transform);
}

// ============================================
// CABINET BODY OBB BUILDER
// ============================================

/**
 * Build cabinet body OBB (carcass collision shape)
 *
 * @param dimensions - Cabinet dimensions
 * @param transform - Cabinet transform (position at corner, rotation)
 * @returns CabinetCollisionShape with single body OBB
 */
export function buildCabinetBodyOBB(
  dimensions: CabinetDimensions,
  transform: TransformQ
): CabinetCollisionShape {
  // Cabinet body: from corner (0,0,0) to (width, height, depth) in local space
  const obb = buildWorldOBBFromCorner({ x: 0, y: 0, z: 0 }, dimensions, transform);

  return { obbs: [obb] };
}

/**
 * Build cabinet body with inset (for face frame cabinets)
 *
 * @param dimensions - Outer cabinet dimensions
 * @param inset - Inset amount on each side (mm)
 * @param transform - Cabinet transform
 */
export function buildCabinetBodyOBBWithInset(
  dimensions: CabinetDimensions,
  inset: number,
  transform: TransformQ
): CabinetCollisionShape {
  const insetDimensions: CabinetDimensions = {
    width: dimensions.width - inset * 2,
    height: dimensions.height - inset * 2,
    depth: dimensions.depth - inset * 2,
  };

  const cornerLocal: Vec3 = {
    x: inset,
    y: inset,
    z: inset,
  };

  const obb = buildWorldOBBFromCorner(cornerLocal, insetDimensions, transform);

  return { obbs: [obb] };
}

// ============================================
// MULTIPLE OBB BUILDER
// ============================================

/**
 * Build multiple world OBBs from local definitions
 *
 * @param localBoxes - Array of local box definitions
 * @param transform - Cabinet transform
 */
export function buildWorldOBBs(
  localBoxes: LocalBoxDef[],
  transform: TransformQ
): OBB[] {
  return localBoxes.map(box => buildWorldOBB(box, transform));
}

/**
 * Build collision shape from multiple local boxes
 *
 * @param localBoxes - Array of local box definitions
 * @param transform - Cabinet transform
 */
export function buildCollisionShapeFromBoxes(
  localBoxes: LocalBoxDef[],
  transform: TransformQ
): CabinetCollisionShape {
  return {
    obbs: buildWorldOBBs(localBoxes, transform),
  };
}

// ============================================
// DOOR SWING OBB BUILDER
// ============================================

/**
 * Build door swing OBB at specific angle
 *
 * @param doorLocalOrigin - Door hinge position in local space
 * @param doorWidth - Door width (swing radius)
 * @param doorHeight - Door height
 * @param doorThickness - Door thickness
 * @param swingAngleRad - Current swing angle in radians (0 = closed)
 * @param hingeSide - Which side is the hinge ('left' | 'right')
 * @param transform - Cabinet transform
 */
export function buildDoorSwingOBB(
  doorLocalOrigin: Vec3,
  doorWidth: number,
  doorHeight: number,
  doorThickness: number,
  swingAngleRad: number,
  hingeSide: 'left' | 'right',
  transform: TransformQ
): OBB {
  // Door center relative to hinge
  const halfWidth = doorWidth / 2;
  const halfHeight = doorHeight / 2;
  const halfThickness = doorThickness / 2;

  // Calculate door center position based on swing angle
  // Door rotates around Y axis at hinge point
  const cos = Math.cos(swingAngleRad);
  const sin = Math.sin(swingAngleRad);

  let doorCenterLocal: Vec3;

  if (hingeSide === 'left') {
    // Hinge on left, door swings to +Z
    doorCenterLocal = {
      x: doorLocalOrigin.x + halfWidth * cos,
      y: doorLocalOrigin.y + halfHeight,
      z: doorLocalOrigin.z + halfWidth * sin + halfThickness * cos,
    };
  } else {
    // Hinge on right, door swings to +Z (mirrored)
    doorCenterLocal = {
      x: doorLocalOrigin.x - halfWidth * cos,
      y: doorLocalOrigin.y + halfHeight,
      z: doorLocalOrigin.z + halfWidth * sin + halfThickness * cos,
    };
  }

  // Get cabinet axes
  const { axisX, axisY, axisZ } = getCabinetAxes(transform);

  // Door has its own rotation (swing angle) on top of cabinet rotation
  // Rotate axisX and axisZ around Y by swing angle
  let doorAxisX: Vec3;
  let doorAxisZ: Vec3;

  if (hingeSide === 'left') {
    doorAxisX = {
      x: axisX.x * cos + axisZ.x * sin,
      y: axisX.y * cos + axisZ.y * sin,
      z: axisX.z * cos + axisZ.z * sin,
    };
    doorAxisZ = {
      x: -axisX.x * sin + axisZ.x * cos,
      y: -axisX.y * sin + axisZ.y * cos,
      z: -axisX.z * sin + axisZ.z * cos,
    };
  } else {
    doorAxisX = {
      x: axisX.x * cos - axisZ.x * sin,
      y: axisX.y * cos - axisZ.y * sin,
      z: axisX.z * cos - axisZ.z * sin,
    };
    doorAxisZ = {
      x: axisX.x * sin + axisZ.x * cos,
      y: axisX.y * sin + axisZ.y * cos,
      z: axisX.z * sin + axisZ.z * cos,
    };
  }

  // Transform center to world
  const worldCenter = localToWorldPoint(transform, doorCenterLocal);

  return {
    center: worldCenter,
    axisX: doorAxisX,
    axisY: axisY, // Y axis unchanged
    axisZ: doorAxisZ,
    halfSize: { x: halfWidth, y: halfHeight, z: halfThickness },
  };
}

// ============================================
// DRAWER PULL OBB BUILDER
// ============================================

/**
 * Build drawer OBB at specific extension
 *
 * @param drawerLocalOrigin - Drawer closed position in local space
 * @param drawerWidth - Drawer width
 * @param drawerHeight - Drawer height
 * @param drawerDepth - Drawer depth
 * @param extensionMm - Current extension in mm (0 = closed)
 * @param transform - Cabinet transform
 */
export function buildDrawerPullOBB(
  drawerLocalOrigin: Vec3,
  drawerWidth: number,
  drawerHeight: number,
  drawerDepth: number,
  extensionMm: number,
  transform: TransformQ
): OBB {
  const halfWidth = drawerWidth / 2;
  const halfHeight = drawerHeight / 2;
  const halfDepth = drawerDepth / 2;

  // Drawer extends along +Z axis
  const drawerCenterLocal: Vec3 = {
    x: drawerLocalOrigin.x + halfWidth,
    y: drawerLocalOrigin.y + halfHeight,
    z: drawerLocalOrigin.z + halfDepth + extensionMm,
  };

  // Get cabinet axes (drawer uses cabinet rotation directly)
  const { axisX, axisY, axisZ } = getCabinetAxes(transform);

  // Transform center to world
  const worldCenter = localToWorldPoint(transform, drawerCenterLocal);

  return {
    center: worldCenter,
    axisX,
    axisY,
    axisZ,
    halfSize: { x: halfWidth, y: halfHeight, z: halfDepth },
  };
}

// ============================================
// UTILITY: TRANSLATE SHAPE
// ============================================

/**
 * Translate all OBBs in a shape by delta (for preview)
 */
export function translateOBBs(obbs: OBB[], delta: Vec3): OBB[] {
  return obbs.map(obb => ({
    ...obb,
    center: {
      x: obb.center.x + delta.x,
      y: obb.center.y + delta.y,
      z: obb.center.z + delta.z,
    },
  }));
}

/**
 * Translate collision shape by delta
 */
export function translateShape(
  shape: CabinetCollisionShape,
  delta: Vec3
): CabinetCollisionShape {
  return {
    obbs: translateOBBs(shape.obbs, delta),
  };
}
