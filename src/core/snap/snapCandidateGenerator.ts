/**
 * snapCandidateGenerator.ts - Candidate Generator for SnapSessionV5
 *
 * Wraps cabinetSnap.ts functions to implement CandidateGenerator interface
 * expected by SnapSessionV5. Integrates with snapPreviewOrchestrator for
 * collision-aware filtering.
 *
 * @version 1.1.0
 */

import type {
  SnapCabinetInstance,
  SnapCandidate,
  SnapResult,
  SnapConstants,
  SnapAlignment,
  DEFAULT_SNAP_CONSTANTS,
} from '../types/SnapTypes';

import {
  findAllSnapCandidates,
  solveRigidSnap,
  validateSnapResult,
} from '../utils/cabinetSnap';

import type { CandidateGenerator } from './snapSessionV5';

import type { CabinetCollisionShape } from '../collision/obbTypes';
import { translateCollisionShape } from '../collision/obbTypes';
import { buildCollisionContextNear } from '../collision/collisionContextBuilder';
import { hasAnyCollision } from '../collision/collisionEngine';
import type { WorldCollisionRegistry } from '../world/worldCollisionRegistry';
import { SPATIAL_CONFIG } from '../config/snapClearanceConfig';

// ============================================
// CANDIDATE GENERATOR IMPLEMENTATION
// ============================================

/**
 * Create a CandidateGenerator that wraps cabinetSnap.ts functions
 */
export function createCabinetSnapGenerator(): CandidateGenerator {
  return {
    /**
     * Generate candidates for cabinet pair
     * Uses findAllSnapCandidates from cabinetSnap.ts
     */
    generateCandidates(
      a: SnapCabinetInstance,
      b: SnapCabinetInstance,
      constants: SnapConstants
    ): SnapCandidate[] {
      // findAllSnapCandidates expects moving cabinet first, then array of targets
      // For single pair, we pass target array with just cabinet A
      return findAllSnapCandidates(b, [a], constants);
    },

    /**
     * Solve preview result for a candidate
     * Uses solveRigidSnap and validateSnapResult from cabinetSnap.ts
     */
    solvePreview(
      a: SnapCabinetInstance,
      b: SnapCabinetInstance,
      candidate: SnapCandidate,
      alignment: SnapAlignment,
      constants: SnapConstants
    ): SnapResult | null {
      // Solve the snap transform
      const result = solveRigidSnap(a, b, candidate, constants, alignment);

      // Validate for collisions
      const validated = validateSnapResult(a, b, result, constants);

      return validated;
    },

    /**
     * Filter candidates by collision using snapPreviewOrchestrator patterns.
     * Removes candidates whose solved positions would cause collisions.
     *
     * @param candidates - Raw snap candidates to filter
     * @param bodyShape - Moving cabinet's collision shape (CabinetCollisionShape)
     * @param collisionContext - Collision context containing registry and cabinet info
     */
    filterByCollision(
      candidates: SnapCandidate[],
      bodyShape: unknown,
      collisionContext: unknown
    ): SnapCandidate[] {
      // Type guard for collision context
      const ctx = collisionContext as {
        registry?: WorldCollisionRegistry;
        movingCabinet?: SnapCabinetInstance;
        targetCabinet?: SnapCabinetInstance;
        alignment?: SnapAlignment;
        constants?: SnapConstants;
      } | undefined;

      // If no collision context provided, return all candidates (fallback behavior)
      if (!ctx?.registry || !ctx.movingCabinet || !ctx.targetCabinet || !bodyShape) {
        return candidates;
      }

      const movingShape = bodyShape as CabinetCollisionShape;
      const { registry, movingCabinet, targetCabinet, alignment, constants } = ctx;
      const snapConstants = constants || ({} as SnapConstants);
      const snapAlignment = alignment || { alignBottom: true, alignFrontFlush: true };

      const validCandidates: SnapCandidate[] = [];

      for (const candidate of candidates) {
        // Solve snap transform for this candidate
        const result = solveRigidSnap(
          targetCabinet,
          movingCabinet,
          candidate,
          snapConstants,
          snapAlignment
        );

        if (!result.isValid) {
          continue;
        }

        // Translate body shape to solved position
        const movedShape = translateCollisionShape(movingShape, result.delta);

        // Build near-field collision context
        const ctxNear = buildCollisionContextNear(
          movedShape.obbs,
          registry.getSpatialRegistries(),
          registry.getShapeRegistries(),
          SPATIAL_CONFIG.nearPaddingMm
        );

        // Check for collisions (excluding self)
        const collides = hasAnyCollision(movingCabinet.id, movedShape, ctxNear);

        if (!collides) {
          validCandidates.push(candidate);
        }
      }

      return validCandidates;
    },
  };
}

// ============================================
// MULTI-TARGET GENERATOR
// ============================================

/**
 * Generate candidates from moving cabinet to ALL other cabinets
 */
export function generateCandidatesMultiTarget(
  movingCabinet: SnapCabinetInstance,
  allOtherCabinets: SnapCabinetInstance[],
  constants: SnapConstants
): SnapCandidate[] {
  return findAllSnapCandidates(movingCabinet, allOtherCabinets, constants);
}

/**
 * Solve best snap from moving cabinet to any of the other cabinets
 */
export function solveBestSnapMultiTarget(
  movingCabinet: SnapCabinetInstance,
  allOtherCabinets: SnapCabinetInstance[],
  constants: SnapConstants,
  alignment: SnapAlignment
): SnapResult | null {
  const candidates = findAllSnapCandidates(movingCabinet, allOtherCabinets, constants);

  if (candidates.length === 0) {
    return null;
  }

  // Try candidates in order of score
  for (const candidate of candidates) {
    const targetCab = allOtherCabinets.find(c => c.id === candidate.aCabId);
    if (!targetCab) continue;

    const result = solveRigidSnap(targetCab, movingCabinet, candidate, constants, alignment);
    const validated = validateSnapResult(targetCab, movingCabinet, result, constants);

    if (validated.isValid) {
      return validated;
    }
  }

  // Return first result even if invalid (for preview with error display)
  const firstCandidate = candidates[0];
  const targetCab = allOtherCabinets.find(c => c.id === firstCandidate.aCabId);
  if (targetCab) {
    const result = solveRigidSnap(targetCab, movingCabinet, firstCandidate, constants, alignment);
    return validateSnapResult(targetCab, movingCabinet, result, constants);
  }

  return null;
}

// ============================================
// SINGLETON INSTANCE
// ============================================

/**
 * Default generator instance
 */
export const defaultSnapGenerator = createCabinetSnapGenerator();
