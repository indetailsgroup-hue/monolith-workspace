/**
 * collisionEngine.ts - High-level Collision Detection Engine
 *
 * FEATURES:
 * - Detects collision between moving cabinet and world
 * - Uses OBB-OBB SAT for accurate detection
 * - Supports both body collision and use envelope checks
 */

import type { CabinetCollisionShape, WorldObstacleShape, CollisionResult } from './obbTypes';
import { obbSetsCollide } from './obbCollision';

// ============================================
// COLLISION CONTEXT
// ============================================

/**
 * Context containing all potential collision targets
 */
export interface CollisionContextOBB {
  obstacles: WorldObstacleShape[];
  cabinets: Array<{ id: string; shape: CabinetCollisionShape }>;
}

// ============================================
// COLLISION DETECTION
// ============================================

export interface CollisionHit {
  type: 'OBSTACLE' | 'CABINET';
  targetId: string;
  targetKind?: string;
  reason: string;
}

/**
 * Detect collision for a moved cabinet against the collision context
 *
 * @param movedCabId - ID of the cabinet being moved (excluded from checks)
 * @param movedShape - Collision shape of the moved cabinet
 * @param ctx - Collision context (obstacles + other cabinets)
 * @returns CollisionHit if collision detected, null otherwise
 */
export function detectCollisionForMovedCabinet(
  movedCabId: string,
  movedShape: CabinetCollisionShape,
  ctx: CollisionContextOBB
): CollisionHit | null {
  // Check against obstacles
  for (const obs of ctx.obstacles) {
    const result = obbSetsCollide(movedShape.obbs, obs.obbs);
    if (result.collides) {
      return {
        type: 'OBSTACLE',
        targetId: obs.id,
        targetKind: obs.kind,
        reason: `Collision with ${obs.kind}: ${obs.id}`,
      };
    }
  }

  // Check against other cabinets
  for (const cab of ctx.cabinets) {
    // Skip self
    if (cab.id === movedCabId) continue;

    const result = obbSetsCollide(movedShape.obbs, cab.shape.obbs);
    if (result.collides) {
      return {
        type: 'CABINET',
        targetId: cab.id,
        reason: `Collision with cabinet: ${cab.id}`,
      };
    }
  }

  return null;
}

/**
 * Detect all collisions (returns all hits, not just first)
 */
export function detectAllCollisions(
  movedCabId: string,
  movedShape: CabinetCollisionShape,
  ctx: CollisionContextOBB
): CollisionHit[] {
  const hits: CollisionHit[] = [];

  // Check against obstacles
  for (const obs of ctx.obstacles) {
    const result = obbSetsCollide(movedShape.obbs, obs.obbs);
    if (result.collides) {
      hits.push({
        type: 'OBSTACLE',
        targetId: obs.id,
        targetKind: obs.kind,
        reason: `Collision with ${obs.kind}: ${obs.id}`,
      });
    }
  }

  // Check against other cabinets
  for (const cab of ctx.cabinets) {
    if (cab.id === movedCabId) continue;

    const result = obbSetsCollide(movedShape.obbs, cab.shape.obbs);
    if (result.collides) {
      hits.push({
        type: 'CABINET',
        targetId: cab.id,
        reason: `Collision with cabinet: ${cab.id}`,
      });
    }
  }

  return hits;
}

/**
 * Quick check if ANY collision exists
 */
export function hasAnyCollision(
  movedCabId: string,
  movedShape: CabinetCollisionShape,
  ctx: CollisionContextOBB
): boolean {
  return detectCollisionForMovedCabinet(movedCabId, movedShape, ctx) !== null;
}
