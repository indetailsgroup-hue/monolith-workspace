/**
 * snapPreviewOrchestrator.ts - Snap Preview with Collision-Aware Filtering
 *
 * ARCHITECTURE:
 * - Uses spatial hash for broad-phase (only check nearby objects)
 * - Uses OBB SAT for narrow-phase collision detection
 * - Filters snap candidates that would cause collision
 * - Supports candidate cycling (Tab key)
 *
 * FLOW:
 * 1. Generate anchor snap candidates
 * 2. Build near-field collision context
 * 3. Filter candidates by collision
 * 4. Solve and validate best candidate
 * 5. Return preview result
 */

import type { Vec3 } from '../types/SnapTypes';
import type { OBB, CabinetCollisionShape } from '../collision/obbTypes';
import { translateCollisionShape, obbsToAabb, expandAabb } from '../collision/obbTypes';
import { buildCollisionContextNear } from '../collision/collisionContextBuilder';
import { hasAnyCollision } from '../collision/collisionEngine';
import type { WorldCollisionRegistry } from '../world/worldCollisionRegistry';
import {
  SnapCandidate,
  SnapResult,
  SnapConstants,
  SnapAlignment,
  SnapCabinetInstance,
  DEFAULT_SNAP_CONSTANTS,
} from '../types/SnapTypes';
import {
  findAllSnapCandidates,
  solveRigidSnap,
  validateSnapResult,
} from '../utils/cabinetSnap';
import { SPATIAL_CONFIG } from '../config/snapClearanceConfig';

// ============================================
// TYPES
// ============================================

export interface SnapPreviewInput {
  /** Cabinet A (static target) */
  targetCabinet: SnapCabinetInstance;

  /** Cabinet B (moving) */
  movingCabinet: SnapCabinetInstance;

  /** Moving cabinet body collision shape */
  movingBodyShape: CabinetCollisionShape;

  /** Alignment options */
  alignment?: SnapAlignment;

  /** Snap constants */
  constants?: SnapConstants;

  /** Collision registry */
  registry: WorldCollisionRegistry;

  /** Active candidate index (for cycling) */
  activeIndex?: number;
}

export interface SnapPreviewResult {
  /** Valid snap candidates (collision-filtered) */
  candidates: SnapCandidate[];

  /** Currently selected candidate index */
  selectedIndex: number;

  /** Preview result (null if no valid snap) */
  preview: SnapResult | null;

  /** Whether the preview position would cause collision */
  hasCollision: boolean;
}

// ============================================
// COLLISION-AWARE CANDIDATE FILTERING
// ============================================

/**
 * Filter candidates by checking if solved position causes collision
 */
function filterCandidatesByCollision(
  targetCab: SnapCabinetInstance,
  movingCab: SnapCabinetInstance,
  movingBodyShape: CabinetCollisionShape,
  candidates: SnapCandidate[],
  constants: SnapConstants,
  alignment: SnapAlignment,
  registry: WorldCollisionRegistry
): SnapCandidate[] {
  const validCandidates: SnapCandidate[] = [];

  for (const candidate of candidates) {
    // Solve snap transform
    const result = solveRigidSnap(targetCab, movingCab, candidate, constants, alignment);

    if (!result.isValid) {
      continue;
    }

    // Calculate delta from original position
    const delta: Vec3 = result.delta;

    // Translate body shape to solved position
    const movedShape = translateCollisionShape(movingBodyShape, delta);

    // Build near-field collision context
    const ctxNear = buildCollisionContextNear(
      movedShape.obbs,
      registry.getSpatialRegistries(),
      registry.getShapeRegistries(),
      SPATIAL_CONFIG.nearPaddingMm
    );

    // Check collision (excluding self)
    const collides = hasAnyCollision(movingCab.id, movedShape, ctxNear);

    if (!collides) {
      validCandidates.push(candidate);
    }
  }

  return validCandidates;
}

// ============================================
// MAIN ORCHESTRATOR
// ============================================

/**
 * Run snap preview with collision-aware filtering
 *
 * @param input - Snap preview input
 * @returns SnapPreviewResult
 */
export function runSnapPreview(input: SnapPreviewInput): SnapPreviewResult {
  const {
    targetCabinet,
    movingCabinet,
    movingBodyShape,
    alignment = { alignBottom: true, alignFrontFlush: true },
    constants = DEFAULT_SNAP_CONSTANTS,
    registry,
    activeIndex = 0,
  } = input;

  // Generate all anchor snap candidates
  const rawCandidates = findAllSnapCandidates(
    movingCabinet,
    [targetCabinet],
    constants
  );

  if (rawCandidates.length === 0) {
    return {
      candidates: [],
      selectedIndex: 0,
      preview: null,
      hasCollision: false,
    };
  }

  // Filter by collision
  const validCandidates = filterCandidatesByCollision(
    targetCabinet,
    movingCabinet,
    movingBodyShape,
    rawCandidates,
    constants,
    alignment,
    registry
  );

  if (validCandidates.length === 0) {
    // All candidates cause collision
    // Return first raw candidate with collision flag
    const firstResult = solveRigidSnap(
      targetCabinet,
      movingCabinet,
      rawCandidates[0],
      constants,
      alignment
    );

    return {
      candidates: rawCandidates,
      selectedIndex: 0,
      preview: firstResult,
      hasCollision: true,
    };
  }

  // Select candidate by index (wrapping)
  const idx = activeIndex % validCandidates.length;
  const selectedCandidate = validCandidates[idx];

  // Solve and validate
  const result = solveRigidSnap(
    targetCabinet,
    movingCabinet,
    selectedCandidate,
    constants,
    alignment
  );

  const validated = validateSnapResult(
    targetCabinet,
    movingCabinet,
    result,
    constants
  );

  return {
    candidates: validCandidates,
    selectedIndex: idx,
    preview: validated,
    hasCollision: false,
  };
}

// ============================================
// MULTI-TARGET PREVIEW
// ============================================

/**
 * Find best snap among multiple target cabinets
 */
export function runSnapPreviewMultiTarget(
  movingCabinet: SnapCabinetInstance,
  movingBodyShape: CabinetCollisionShape,
  targetCabinets: SnapCabinetInstance[],
  alignment: SnapAlignment,
  constants: SnapConstants,
  registry: WorldCollisionRegistry,
  activeIndex: number = 0
): SnapPreviewResult {
  // Collect all candidates from all targets
  const allCandidates: Array<{ target: SnapCabinetInstance; candidate: SnapCandidate }> = [];

  for (const target of targetCabinets) {
    const candidates = findAllSnapCandidates(movingCabinet, [target], constants);
    for (const candidate of candidates) {
      allCandidates.push({ target, candidate });
    }
  }

  if (allCandidates.length === 0) {
    return {
      candidates: [],
      selectedIndex: 0,
      preview: null,
      hasCollision: false,
    };
  }

  // Sort by score (descending)
  allCandidates.sort((a, b) => b.candidate.score - a.candidate.score);

  // Filter by collision
  const validEntries: typeof allCandidates = [];

  for (const entry of allCandidates) {
    const result = solveRigidSnap(
      entry.target,
      movingCabinet,
      entry.candidate,
      constants,
      alignment
    );

    if (!result.isValid) continue;

    const movedShape = translateCollisionShape(movingBodyShape, result.delta);
    const ctxNear = buildCollisionContextNear(
      movedShape.obbs,
      registry.getSpatialRegistries(),
      registry.getShapeRegistries(),
      SPATIAL_CONFIG.nearPaddingMm
    );

    if (!hasAnyCollision(movingCabinet.id, movedShape, ctxNear)) {
      validEntries.push(entry);
    }
  }

  if (validEntries.length === 0) {
    // All candidates cause collision
    const first = allCandidates[0];
    const result = solveRigidSnap(
      first.target,
      movingCabinet,
      first.candidate,
      constants,
      alignment
    );

    return {
      candidates: allCandidates.map(e => e.candidate),
      selectedIndex: 0,
      preview: result,
      hasCollision: true,
    };
  }

  // Select by index
  const idx = activeIndex % validEntries.length;
  const selected = validEntries[idx];

  const result = solveRigidSnap(
    selected.target,
    movingCabinet,
    selected.candidate,
    constants,
    alignment
  );

  const validated = validateSnapResult(
    selected.target,
    movingCabinet,
    result,
    constants
  );

  return {
    candidates: validEntries.map(e => e.candidate),
    selectedIndex: idx,
    preview: validated,
    hasCollision: false,
  };
}
