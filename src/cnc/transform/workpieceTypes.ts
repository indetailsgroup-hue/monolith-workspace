/**
 * workpieceTypes.ts - Workpiece Coordinate Types
 *
 * Defines types for workpiece coordinate mapping:
 * - Panel face selection (TOP/BOTTOM)
 * - Workpiece reference frames
 * - Transform primitives
 *
 * Coordinate System Convention:
 * - Machine coordinates: Absolute position in machine space (mm)
 * - Workpiece coordinates: Position relative to workpiece origin (mm)
 * - Z=0: Workpiece surface (TOP face)
 * - Negative Z: Into the material
 *
 * @version 1.0.0 - Phase D4.1: Workpiece Coordinate Mapping
 */

import type { Position3D } from '../operation/operationTypes';

// ============================================================================
// PANEL FACE
// ============================================================================

/**
 * Which face of the panel is being machined.
 *
 * - TOP: Standard machining - tool approaches from above
 * - BOTTOM: Flip machining - panel is flipped, tool approaches from what was the bottom
 *
 * Impact on coordinates:
 * - TOP: Z positive is up, drilling goes negative Z
 * - BOTTOM: Z positive is up after flip, coordinates are mirrored
 */
export type PanelFace = 'TOP' | 'BOTTOM';

// ============================================================================
// WORKPIECE REFERENCE FRAME
// ============================================================================

/**
 * Datum point on the workpiece.
 *
 * Defines which corner of the workpiece is the origin (0,0,0):
 * - FL: Front-Left (most common for CNC routers)
 * - FR: Front-Right
 * - BL: Back-Left
 * - BR: Back-Right
 * - CENTER: Workpiece center
 */
export type WorkpieceDatum =
  | 'FRONT_LEFT'
  | 'FRONT_RIGHT'
  | 'BACK_LEFT'
  | 'BACK_RIGHT'
  | 'CENTER';

/**
 * Workpiece reference frame defining coordinate semantics.
 *
 * This tells the system how to interpret positions:
 * - Where is the origin on the workpiece?
 * - Which face is up?
 * - What are the workpiece dimensions?
 */
export interface WorkpieceFrame {
  /** Which corner is the datum/origin */
  datum: WorkpieceDatum;
  /** Which face is being machined */
  face: PanelFace;
  /** Workpiece dimensions in mm */
  dimensions: {
    length: number; // X dimension
    width: number;  // Y dimension
    thickness: number; // Z dimension (panel thickness)
  };
}

// ============================================================================
// WORKPIECE OFFSET
// ============================================================================

/**
 * Transform offset from machine origin to workpiece origin.
 *
 * This represents where the workpiece is placed on the machine:
 * - offset: Translation from machine (0,0,0) to workpiece datum
 * - rotation: Rotation around Z axis (in radians)
 *
 * Example:
 * If workpiece is clamped 100mm in from machine origin on X,
 * and 50mm in on Y, offset = { x: 100, y: 50, z: 0 }
 */
export interface WorkpieceOffset {
  /** Translation offset from machine origin to workpiece origin (mm) */
  offset: Position3D;
  /** Rotation around Z axis (radians, 0 = no rotation) */
  rotationZ: number;
}

// ============================================================================
// TRANSFORM CONTEXT
// ============================================================================

/**
 * Complete transform context for a workpiece.
 *
 * Combines the workpiece frame (how coordinates are interpreted)
 * with the workpiece offset (where it sits on the machine).
 */
export interface WorkpieceTransformContext {
  /** Panel ID this context applies to */
  panelId: string;
  /** Reference frame defining workpiece coordinate semantics */
  frame: WorkpieceFrame;
  /** Offset from machine origin to workpiece origin */
  placement: WorkpieceOffset;
}

// ============================================================================
// OPERATION CONTEXT
// ============================================================================

/**
 * Workpiece context attached to an operation.
 *
 * This is a slimmed-down version of WorkpieceTransformContext
 * that gets attached to each operation to maintain traceability.
 */
export interface OperationWorkpieceContext {
  /** Source panel ID */
  panelId: string;
  /** Which face the operation is on */
  face: PanelFace;
  /** Offset applied during transform (for audit/debug) */
  appliedOffset: Position3D;
  /** Original position in workpiece coordinates (D4: for audit trail) */
  workpiecePosition?: Position3D;
}

// ============================================================================
// TRANSFORM RESULT
// ============================================================================

/**
 * Result of applying a workpiece transform.
 */
export interface TransformResult {
  /** Transformed position in machine coordinates */
  machinePosition: Position3D;
  /** Original position in workpiece coordinates */
  workpiecePosition: Position3D;
  /** Transform context used */
  context: OperationWorkpieceContext;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

/**
 * Default workpiece frame (standard router setup).
 */
export const DEFAULT_WORKPIECE_FRAME: WorkpieceFrame = {
  datum: 'FRONT_LEFT',
  face: 'TOP',
  dimensions: {
    length: 0,
    width: 0,
    thickness: 0,
  },
};

/**
 * Default workpiece offset (workpiece at machine origin).
 */
export const DEFAULT_WORKPIECE_OFFSET: WorkpieceOffset = {
  offset: { x: 0, y: 0, z: 0 },
  rotationZ: 0,
};

/**
 * Identity transform context (no transformation).
 */
export function createIdentityContext(panelId: string): WorkpieceTransformContext {
  return {
    panelId,
    frame: { ...DEFAULT_WORKPIECE_FRAME },
    placement: { ...DEFAULT_WORKPIECE_OFFSET },
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isPanelFace(value: unknown): value is PanelFace {
  return value === 'TOP' || value === 'BOTTOM';
}

export function isWorkpieceDatum(value: unknown): value is WorkpieceDatum {
  return (
    value === 'FRONT_LEFT' ||
    value === 'FRONT_RIGHT' ||
    value === 'BACK_LEFT' ||
    value === 'BACK_RIGHT' ||
    value === 'CENTER'
  );
}

export function isValidWorkpieceFrame(value: unknown): value is WorkpieceFrame {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    isWorkpieceDatum(obj.datum) &&
    isPanelFace(obj.face) &&
    typeof obj.dimensions === 'object' &&
    obj.dimensions !== null &&
    typeof (obj.dimensions as Record<string, unknown>).length === 'number' &&
    typeof (obj.dimensions as Record<string, unknown>).width === 'number' &&
    typeof (obj.dimensions as Record<string, unknown>).thickness === 'number'
  );
}
