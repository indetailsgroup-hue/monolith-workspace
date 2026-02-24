/**
 * transformPrimitives.ts - Workpiece Transform Functions
 *
 * Core transform primitives for converting between:
 * - Workpiece coordinates (relative to panel)
 * - Machine coordinates (absolute)
 *
 * All transforms are pure functions with no side effects.
 * Transforms are composable and reversible.
 *
 * @version 1.0.0 - Phase D4.1: Workpiece Coordinate Mapping
 */

import type { Position3D } from '../operation/operationTypes';
import type {
  PanelFace,
  WorkpieceDatum,
  WorkpieceFrame,
  WorkpieceOffset,
  WorkpieceTransformContext,
  TransformResult,
  OperationWorkpieceContext,
} from './workpieceTypes';

// ============================================================================
// POSITION ARITHMETIC
// ============================================================================

/**
 * Add two positions together.
 */
export function addPositions(a: Position3D, b: Position3D): Position3D {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  };
}

/**
 * Subtract position b from position a.
 */
export function subtractPositions(a: Position3D, b: Position3D): Position3D {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

/**
 * Scale a position by a factor.
 */
export function scalePosition(pos: Position3D, factor: number): Position3D {
  return {
    x: pos.x * factor,
    y: pos.y * factor,
    z: pos.z * factor,
  };
}

/**
 * Negate a position (flip all signs).
 */
export function negatePosition(pos: Position3D): Position3D {
  return scalePosition(pos, -1);
}

/**
 * Check if two positions are equal (within tolerance).
 */
export function positionsEqual(
  a: Position3D,
  b: Position3D,
  tolerance: number = 0.001
): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.z - b.z) <= tolerance
  );
}

// ============================================================================
// TRANSLATION TRANSFORMS
// ============================================================================

/**
 * Apply offset to translate from workpiece to machine coordinates.
 *
 * @param workpiecePos Position in workpiece coordinates
 * @param offset Translation offset from machine origin to workpiece origin
 * @returns Position in machine coordinates
 */
export function applyOffset(
  workpiecePos: Position3D,
  offset: Position3D
): Position3D {
  return addPositions(workpiecePos, offset);
}

/**
 * Remove offset to translate from machine to workpiece coordinates.
 *
 * @param machinePos Position in machine coordinates
 * @param offset Translation offset from machine origin to workpiece origin
 * @returns Position in workpiece coordinates
 */
export function removeOffset(
  machinePos: Position3D,
  offset: Position3D
): Position3D {
  return subtractPositions(machinePos, offset);
}

// ============================================================================
// ROTATION TRANSFORMS
// ============================================================================

/**
 * Rotate position around Z axis.
 *
 * @param pos Position to rotate
 * @param angleRad Rotation angle in radians (positive = counter-clockwise)
 * @returns Rotated position
 */
export function rotateAroundZ(pos: Position3D, angleRad: number): Position3D {
  if (angleRad === 0) return { ...pos };

  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  return {
    x: pos.x * cos - pos.y * sin,
    y: pos.x * sin + pos.y * cos,
    z: pos.z,
  };
}

/**
 * Snap angle to nearest 90 degrees.
 *
 * @param angleRad Angle in radians
 * @returns Snapped angle in radians
 */
export function snapAngleTo90(angleRad: number): number {
  const degrees = (angleRad * 180) / Math.PI;
  const snapped = Math.round(degrees / 90) * 90;
  return (snapped * Math.PI) / 180;
}

// ============================================================================
// MIRROR TRANSFORMS
// ============================================================================

/**
 * Mirror position along X axis (flip Y coordinate).
 *
 * @param pos Position to mirror
 * @param axisPosition The Y value where the mirror plane is located
 * @returns Mirrored position
 */
export function mirrorAlongX(pos: Position3D, axisPosition: number = 0): Position3D {
  return {
    x: pos.x,
    y: 2 * axisPosition - pos.y,
    z: pos.z,
  };
}

/**
 * Mirror position along Y axis (flip X coordinate).
 *
 * @param pos Position to mirror
 * @param axisPosition The X value where the mirror plane is located
 * @returns Mirrored position
 */
export function mirrorAlongY(pos: Position3D, axisPosition: number = 0): Position3D {
  return {
    x: 2 * axisPosition - pos.x,
    y: pos.y,
    z: pos.z,
  };
}

/**
 * Mirror position along Z axis (flip Z coordinate).
 * Used for BOTTOM face machining.
 *
 * @param pos Position to mirror
 * @param axisPosition The Z value where the mirror plane is located
 * @returns Mirrored position
 */
export function mirrorAlongZ(pos: Position3D, axisPosition: number = 0): Position3D {
  return {
    x: pos.x,
    y: pos.y,
    z: 2 * axisPosition - pos.z,
  };
}

// ============================================================================
// FACE TRANSFORMS
// ============================================================================

/**
 * Transform position for BOTTOM face machining.
 *
 * When machining the bottom face:
 * 1. Panel is physically flipped over (rotated 180° around X axis)
 * 2. X coordinates are mirrored (to maintain physical location)
 * 3. Z coordinates are inverted (bottom is now top)
 *
 * @param pos Position in workpiece coordinates (TOP face convention)
 * @param panelWidth Panel width (Y dimension) for mirror calculation
 * @param panelThickness Panel thickness for Z calculation
 * @returns Position adjusted for BOTTOM face machining
 */
export function transformForBottomFace(
  pos: Position3D,
  panelWidth: number,
  panelThickness: number
): Position3D {
  // When panel is flipped around X axis:
  // - X stays the same
  // - Y is mirrored: Y' = panelWidth - Y
  // - Z is measured from new top (was bottom): Z' = -panelThickness - Z
  return {
    x: pos.x,
    y: panelWidth - pos.y,
    z: -panelThickness - pos.z,
  };
}

/**
 * Get the Z surface offset for a given face.
 *
 * @param face Panel face being machined
 * @param thickness Panel thickness
 * @returns Z offset to apply (0 for TOP, -thickness for BOTTOM)
 */
export function getFaceSurfaceZ(face: PanelFace, thickness: number): number {
  return face === 'TOP' ? 0 : -thickness;
}

// ============================================================================
// DATUM TRANSFORMS
// ============================================================================

/**
 * Get offset from FRONT_LEFT datum to specified datum.
 *
 * This calculates the translation needed to move the origin
 * from FRONT_LEFT to another datum point.
 *
 * @param datum Target datum point
 * @param length Panel length (X dimension)
 * @param width Panel width (Y dimension)
 * @returns Offset from FRONT_LEFT to target datum
 */
export function getDatumOffset(
  datum: WorkpieceDatum,
  length: number,
  width: number
): Position3D {
  switch (datum) {
    case 'FRONT_LEFT':
      return { x: 0, y: 0, z: 0 };
    case 'FRONT_RIGHT':
      return { x: length, y: 0, z: 0 };
    case 'BACK_LEFT':
      return { x: 0, y: width, z: 0 };
    case 'BACK_RIGHT':
      return { x: length, y: width, z: 0 };
    case 'CENTER':
      return { x: length / 2, y: width / 2, z: 0 };
  }
}

/**
 * Transform position from one datum to another.
 *
 * @param pos Position in source datum coordinates
 * @param fromDatum Source datum
 * @param toDatum Target datum
 * @param length Panel length
 * @param width Panel width
 * @returns Position in target datum coordinates
 */
export function transformDatum(
  pos: Position3D,
  fromDatum: WorkpieceDatum,
  toDatum: WorkpieceDatum,
  length: number,
  width: number
): Position3D {
  if (fromDatum === toDatum) return { ...pos };

  const fromOffset = getDatumOffset(fromDatum, length, width);
  const toOffset = getDatumOffset(toDatum, length, width);

  // pos + fromOffset - toOffset
  return subtractPositions(addPositions(pos, fromOffset), toOffset);
}

// ============================================================================
// COMPLETE TRANSFORM
// ============================================================================

/**
 * Transform a position from workpiece coordinates to machine coordinates.
 *
 * This is the main transform function that applies all necessary
 * transformations based on the workpiece context.
 *
 * Transform order:
 * 1. Handle face (if BOTTOM, apply flip transform)
 * 2. Handle datum (translate to standard FRONT_LEFT if needed)
 * 3. Apply rotation (if any)
 * 4. Apply placement offset
 *
 * @param workpiecePos Position in workpiece coordinates
 * @param context Complete workpiece transform context
 * @returns Transform result with machine position and audit info
 */
export function transformToMachine(
  workpiecePos: Position3D,
  context: WorkpieceTransformContext
): TransformResult {
  const { frame, placement, panelId } = context;
  const { datum, face, dimensions } = frame;

  let pos = { ...workpiecePos };

  // Step 1: Handle face transform (if BOTTOM)
  if (face === 'BOTTOM') {
    pos = transformForBottomFace(pos, dimensions.width, dimensions.thickness);
  }

  // Step 2: Transform from workpiece datum to FRONT_LEFT (standard)
  // Then we apply placement offset which is relative to FRONT_LEFT
  if (datum !== 'FRONT_LEFT') {
    pos = transformDatum(
      pos,
      datum,
      'FRONT_LEFT',
      dimensions.length,
      dimensions.width
    );
  }

  // Step 3: Apply rotation around Z
  if (placement.rotationZ !== 0) {
    pos = rotateAroundZ(pos, placement.rotationZ);
  }

  // Step 4: Apply placement offset
  const machinePosition = applyOffset(pos, placement.offset);

  // Build operation context for traceability
  const operationContext: OperationWorkpieceContext = {
    panelId,
    face,
    appliedOffset: placement.offset,
  };

  return {
    machinePosition,
    workpiecePosition: workpiecePos,
    context: operationContext,
  };
}

/**
 * Transform a position from machine coordinates to workpiece coordinates.
 *
 * This is the inverse of transformToMachine.
 *
 * @param machinePos Position in machine coordinates
 * @param context Complete workpiece transform context
 * @returns Position in workpiece coordinates
 */
export function transformFromMachine(
  machinePos: Position3D,
  context: WorkpieceTransformContext
): Position3D {
  const { frame, placement } = context;
  const { datum, face, dimensions } = frame;

  let pos = { ...machinePos };

  // Inverse of Step 4: Remove placement offset
  pos = removeOffset(pos, placement.offset);

  // Inverse of Step 3: Remove rotation
  if (placement.rotationZ !== 0) {
    pos = rotateAroundZ(pos, -placement.rotationZ);
  }

  // Inverse of Step 2: Transform from FRONT_LEFT back to workpiece datum
  if (datum !== 'FRONT_LEFT') {
    pos = transformDatum(
      pos,
      'FRONT_LEFT',
      datum,
      dimensions.length,
      dimensions.width
    );
  }

  // Inverse of Step 1: Handle face transform (if BOTTOM)
  // Note: transformForBottomFace is NOT self-inverse, we need to undo it properly
  if (face === 'BOTTOM') {
    // Undo: x stays, y = panelWidth - y, z = -thickness - z
    pos = {
      x: pos.x,
      y: dimensions.width - pos.y,
      z: -dimensions.thickness - pos.z,
    };
  }

  return pos;
}

// ============================================================================
// BATCH TRANSFORMS
// ============================================================================

/**
 * Transform multiple positions from workpiece to machine coordinates.
 *
 * @param positions Array of positions in workpiece coordinates
 * @param context Complete workpiece transform context
 * @returns Array of transform results
 */
export function transformBatchToMachine(
  positions: Position3D[],
  context: WorkpieceTransformContext
): TransformResult[] {
  return positions.map((pos) => transformToMachine(pos, context));
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a machine position is within workpiece bounds.
 *
 * @param machinePos Position in machine coordinates
 * @param context Workpiece transform context
 * @returns true if position is within workpiece bounds
 */
export function isWithinWorkpiece(
  machinePos: Position3D,
  context: WorkpieceTransformContext
): boolean {
  const workpiecePos = transformFromMachine(machinePos, context);
  const { dimensions } = context.frame;

  return (
    workpiecePos.x >= 0 &&
    workpiecePos.x <= dimensions.length &&
    workpiecePos.y >= 0 &&
    workpiecePos.y <= dimensions.width &&
    workpiecePos.z >= -dimensions.thickness &&
    workpiecePos.z <= 0
  );
}

/**
 * Clamp a workpiece position to panel bounds.
 *
 * @param pos Position to clamp
 * @param dimensions Panel dimensions
 * @returns Clamped position
 */
export function clampToWorkpiece(
  pos: Position3D,
  dimensions: WorkpieceFrame['dimensions']
): Position3D {
  return {
    x: Math.max(0, Math.min(dimensions.length, pos.x)),
    y: Math.max(0, Math.min(dimensions.width, pos.y)),
    z: Math.max(-dimensions.thickness, Math.min(0, pos.z)),
  };
}
