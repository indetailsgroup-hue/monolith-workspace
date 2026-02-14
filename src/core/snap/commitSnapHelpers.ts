/**
 * commitSnapHelpers.ts - Helpers for Committing Snap Operations
 *
 * ARCHITECTURE:
 * - Apply position changes to cabinet store
 * - Update collision shapes in registry
 * - Run Gate validation
 * - Handle history recording
 *
 * WORKFLOW:
 * 1. Preview phase: Show snap preview with collision feedback
 * 2. Commit phase: Apply changes, update registry, run Gate
 * 3. History phase: Record state for undo/redo
 */

import type { Vec3 } from '../types/SnapTypes';
import type { CabinetCollisionShape, OBB } from '../collision/obbTypes';
import type { TransformQ } from '../math/transformQ';
import { translateShape } from '../collision/obbBuilder';
import { getWorldCollisionRegistryV2 } from '../world/worldCollisionRegistryV2';
import type { ClearanceValidationResult } from '../clearance/clearanceValidator';
import { validateClearance } from '../clearance/clearanceValidator';

// ============================================
// TYPES
// ============================================

export interface SnapCommitInput {
  /** Cabinet ID being moved */
  cabinetId: string;

  /** New position (corner in mm) */
  newPosition: Vec3;

  /** Position delta from original */
  positionDelta: Vec3;

  /** Original position */
  originalPosition: Vec3;

  /** Cabinet body shape at new position */
  bodyShape: CabinetCollisionShape;

  /** Use envelope shape at new position (optional) */
  useEnvelopeShape?: CabinetCollisionShape;
}

export interface SnapCommitResult {
  /** Whether commit was successful (no ERROR) */
  success: boolean;

  /** Validation result */
  validation: ClearanceValidationResult;

  /** New position if successful */
  committedPosition?: Vec3;
}

export interface ShapeTranslation {
  /** Original body shape */
  originalBody: CabinetCollisionShape;

  /** Translated body shape */
  translatedBody: CabinetCollisionShape;

  /** Original use envelope (if any) */
  originalEnvelope?: CabinetCollisionShape;

  /** Translated use envelope (if any) */
  translatedEnvelope?: CabinetCollisionShape;
}

// ============================================
// SHAPE TRANSLATION
// ============================================

/**
 * Translate cabinet shapes by delta
 *
 * @param originalBody - Original body collision shape
 * @param originalEnvelope - Original use envelope shape (optional)
 * @param delta - Position delta in mm
 */
export function translateCabinetShapes(
  originalBody: CabinetCollisionShape,
  originalEnvelope: CabinetCollisionShape | undefined,
  delta: Vec3
): ShapeTranslation {
  const translatedBody = translateShape(originalBody, delta);

  let translatedEnvelope: CabinetCollisionShape | undefined;
  if (originalEnvelope) {
    translatedEnvelope = translateShape(originalEnvelope, delta);
  }

  return {
    originalBody,
    translatedBody,
    originalEnvelope,
    translatedEnvelope,
  };
}

// ============================================
// REGISTRY UPDATE
// ============================================

/**
 * Update cabinet in collision registry
 *
 * @param cabinetId - Cabinet ID
 * @param bodyShape - New body shape
 * @param useEnvelopeShape - New use envelope shape (optional)
 */
export function updateCabinetInRegistry(
  cabinetId: string,
  bodyShape: CabinetCollisionShape,
  useEnvelopeShape?: CabinetCollisionShape
): void {
  const registry = getWorldCollisionRegistryV2();

  // Update body in spatial hash
  registry.upsertCabinetBody(cabinetId, bodyShape);

  // Update use envelope (not in spatial hash)
  if (useEnvelopeShape) {
    registry.upsertCabinetUseEnvelope(cabinetId, useEnvelopeShape);
  }
}

/**
 * Update cabinet OBBs only (faster for drag operations)
 */
export function updateCabinetObbsInRegistry(
  cabinetId: string,
  bodyObbs: OBB[],
  useEnvelopeObbs?: OBB[]
): void {
  const registry = getWorldCollisionRegistryV2();

  // Update body OBBs using delta update
  registry.updateCabinetBodyObbs(cabinetId, bodyObbs);

  // Update use envelope if provided
  if (useEnvelopeObbs) {
    registry.upsertCabinetUseEnvelope(cabinetId, { obbs: useEnvelopeObbs });
  }
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate cabinet at new position
 *
 * @param cabinetId - Cabinet ID
 * @param bodyShape - Body shape at new position
 * @param useEnvelopeShape - Use envelope at new position (optional)
 */
export function validateCabinetPosition(
  cabinetId: string,
  bodyShape: CabinetCollisionShape,
  useEnvelopeShape?: CabinetCollisionShape
): ClearanceValidationResult {
  const registry = getWorldCollisionRegistryV2();

  // Build collision context from registry
  const { nearObstacles, nearCabinets } = registry.buildCollisionContext(
    cabinetId,
    bodyShape.obbs,
    150 // padding
  );

  // Convert to CollisionContextOBB format
  const ctx = {
    obstacles: nearObstacles.map(o => ({
      id: o.id,
      obbs: o.obbs,
      kind: o.kind,
    })),
    cabinets: nearCabinets.map(c => ({
      id: c.id,
      shape: { obbs: c.obbs },
    })),
  };

  return validateClearance(cabinetId, bodyShape, useEnvelopeShape, ctx);
}

// ============================================
// COMMIT SNAP
// ============================================

/**
 * Commit snap operation
 *
 * 1. Validate position
 * 2. If valid, update registry
 * 3. Return result with validation info
 *
 * @param input - Snap commit input
 * @returns Commit result
 */
export function commitSnap(input: SnapCommitInput): SnapCommitResult {
  const { cabinetId, newPosition, bodyShape, useEnvelopeShape } = input;

  // Validate new position
  const validation = validateCabinetPosition(cabinetId, bodyShape, useEnvelopeShape);

  // If ERROR, don't commit
  if (!validation.ok) {
    return {
      success: false,
      validation,
    };
  }

  // Update registry with new shapes
  updateCabinetInRegistry(cabinetId, bodyShape, useEnvelopeShape);

  return {
    success: true,
    validation,
    committedPosition: newPosition,
  };
}

/**
 * Force commit snap (bypass validation)
 * Use with caution - only for special cases
 */
export function forceCommitSnap(input: SnapCommitInput): SnapCommitResult {
  const { cabinetId, newPosition, bodyShape, useEnvelopeShape } = input;

  // Validate for info only
  const validation = validateCabinetPosition(cabinetId, bodyShape, useEnvelopeShape);

  // Always update registry
  updateCabinetInRegistry(cabinetId, bodyShape, useEnvelopeShape);

  return {
    success: true,
    validation,
    committedPosition: newPosition,
  };
}

// ============================================
// PREVIEW HELPERS
// ============================================

/**
 * Check if snap preview is valid (no body collision)
 */
export function isSnapPreviewValid(
  cabinetId: string,
  previewBodyShape: CabinetCollisionShape
): boolean {
  const validation = validateCabinetPosition(cabinetId, previewBodyShape);
  return validation.ok;
}

/**
 * Get preview validation result
 */
export function getPreviewValidation(
  cabinetId: string,
  previewBodyShape: CabinetCollisionShape,
  previewEnvelopeShape?: CabinetCollisionShape
): ClearanceValidationResult {
  return validateCabinetPosition(cabinetId, previewBodyShape, previewEnvelopeShape);
}

// ============================================
// POSITION DELTA UTILITIES
// ============================================

/**
 * Calculate position delta from original to new position
 */
export function calculatePositionDelta(original: Vec3, newPos: Vec3): Vec3 {
  return {
    x: newPos.x - original.x,
    y: newPos.y - original.y,
    z: newPos.z - original.z,
  };
}

/**
 * Apply position delta to a position
 */
export function applyPositionDelta(position: Vec3, delta: Vec3): Vec3 {
  return {
    x: position.x + delta.x,
    y: position.y + delta.y,
    z: position.z + delta.z,
  };
}

/**
 * Clamp position delta to maximum magnitude
 */
export function clampPositionDelta(delta: Vec3, maxMagnitude: number): Vec3 {
  const magnitude = Math.sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z);

  if (magnitude <= maxMagnitude) return delta;

  const scale = maxMagnitude / magnitude;
  return {
    x: delta.x * scale,
    y: delta.y * scale,
    z: delta.z * scale,
  };
}

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Commit multiple snap operations
 * Fails if any cabinet has ERROR validation
 */
export function commitMultipleSnaps(
  inputs: SnapCommitInput[]
): { success: boolean; results: SnapCommitResult[] } {
  // First, validate all positions
  const validations = inputs.map(input =>
    validateCabinetPosition(input.cabinetId, input.bodyShape, input.useEnvelopeShape)
  );

  // Check if any have errors
  const hasErrors = validations.some(v => !v.ok);

  if (hasErrors) {
    return {
      success: false,
      results: inputs.map((input, i) => ({
        success: false,
        validation: validations[i],
      })),
    };
  }

  // All valid, commit all
  const results = inputs.map((input, i) => {
    updateCabinetInRegistry(input.cabinetId, input.bodyShape, input.useEnvelopeShape);

    return {
      success: true,
      validation: validations[i],
      committedPosition: input.newPosition,
    };
  });

  return { success: true, results };
}
