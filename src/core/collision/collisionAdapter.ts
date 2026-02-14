/**
 * collisionAdapter.ts - Engine-Agnostic Collision Adapter Interface
 *
 * ARCHITECTURE:
 * - Defines interface that collision engines must implement
 * - Allows swapping collision algorithms without changing business logic
 * - Used by selectionCollision for multi-select checks
 *
 * IMPLEMENTATION NOTE:
 * - Your OBB/SAT engine needs to implement this interface
 * - testPair returns both penetration and gap
 * - queryNearby provides broadphase optimization
 */

import type { Vec3 } from '../types/SnapTypes';

// ============================================
// CABINET INSTANCE (minimal interface)
// ============================================

/**
 * Minimal cabinet instance for collision testing
 * (Your actual Cabinet type likely has more fields)
 */
export interface CabinetInstanceMinimal {
  id: string;
  /** Position in mm (world space) */
  position: Vec3;
  /** Rotation in radians [x, y, z] */
  rotation?: [number, number, number];
  /** Dimensions in mm */
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
}

// ============================================
// TEST RESULT
// ============================================

/**
 * Result of collision test between two objects
 */
export interface PairTestResult {
  /**
   * Penetration depth in mm
   * - > 0: overlap (objects intersect)
   * - = 0: touching
   * - < 0: separated (negative = gap)
   */
  penetrationMm: number;
  /**
   * Gap distance in mm
   * - >= 0: separation distance
   * - 0: touching
   * For overlap cases, gap is typically 0 and penetration > 0
   */
  gapMm: number;
}

// ============================================
// ADAPTER INTERFACE
// ============================================

/**
 * Collision adapter interface
 * Implement this to connect your collision engine
 */
export interface CollisionAdapter {
  /**
   * Test collision between two cabinet instances
   *
   * @param args.a - First cabinet
   * @param args.b - Second cabinet
   * @returns Penetration and gap measurements
   */
  testPair(args: { a: CabinetInstanceMinimal; b: CabinetInstanceMinimal }): PairTestResult;

  /**
   * Query nearby cabinets for broadphase optimization
   *
   * @param args.cab - Cabinet to query around
   * @param args.radiusMm - Search radius in mm
   * @returns Array of nearby cabinet instances
   *
   * NOTE: If you don't have broadphase, return all cabinets
   */
  queryNearby(args: {
    cab: CabinetInstanceMinimal;
    radiusMm: number;
  }): CabinetInstanceMinimal[];
}

// ============================================
// STUB ADAPTER (for testing)
// ============================================

/**
 * Stub adapter that reports no collisions
 * Use this for testing or when collision is disabled
 */
export const STUB_COLLISION_ADAPTER: CollisionAdapter = {
  testPair: () => ({ penetrationMm: 0, gapMm: 999999 }),
  queryNearby: () => [],
};

// ============================================
// AABB-BASED SIMPLE ADAPTER
// ============================================

/**
 * Simple AABB-based collision adapter
 * Fast but less accurate than OBB for rotated objects
 */
export function createSimpleAabbAdapter(
  allCabinets: () => CabinetInstanceMinimal[]
): CollisionAdapter {
  return {
    testPair({ a, b }) {
      // Compute AABBs
      const aMin = {
        x: a.position.x - a.dimensions.width / 2,
        y: a.position.y,
        z: a.position.z - a.dimensions.depth / 2,
      };
      const aMax = {
        x: a.position.x + a.dimensions.width / 2,
        y: a.position.y + a.dimensions.height,
        z: a.position.z + a.dimensions.depth / 2,
      };

      const bMin = {
        x: b.position.x - b.dimensions.width / 2,
        y: b.position.y,
        z: b.position.z - b.dimensions.depth / 2,
      };
      const bMax = {
        x: b.position.x + b.dimensions.width / 2,
        y: b.position.y + b.dimensions.height,
        z: b.position.z + b.dimensions.depth / 2,
      };

      // Check overlap on each axis
      const overlapX = Math.min(aMax.x, bMax.x) - Math.max(aMin.x, bMin.x);
      const overlapY = Math.min(aMax.y, bMax.y) - Math.max(aMin.y, bMin.y);
      const overlapZ = Math.min(aMax.z, bMax.z) - Math.max(aMin.z, bMin.z);

      // If all overlaps positive, boxes intersect
      if (overlapX > 0 && overlapY > 0 && overlapZ > 0) {
        // Penetration = minimum overlap (SAT)
        const penetration = Math.min(overlapX, overlapY, overlapZ);
        return { penetrationMm: penetration, gapMm: 0 };
      }

      // No intersection, calculate gap
      const gapX = overlapX <= 0 ? -overlapX : 0;
      const gapY = overlapY <= 0 ? -overlapY : 0;
      const gapZ = overlapZ <= 0 ? -overlapZ : 0;

      // Gap = distance along separating axis (simplified: max of gaps)
      // For accurate gap, would need GJK or closest point calculation
      const gap = Math.max(gapX, gapY, gapZ);

      return { penetrationMm: 0, gapMm: gap };
    },

    queryNearby({ cab, radiusMm }) {
      const all = allCabinets();
      return all.filter(c => {
        if (c.id === cab.id) return false;

        // Simple distance check (center to center)
        const dx = c.position.x - cab.position.x;
        const dy = c.position.y - cab.position.y;
        const dz = c.position.z - cab.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        return dist < radiusMm;
      });
    },
  };
}
