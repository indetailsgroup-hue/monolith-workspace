/**
 * clampDeltaByCollision.ts - Soft Clamp Delta by Collision
 *
 * FEATURES:
 * - Binary search to find maximum valid delta
 * - Prevents "drag through" by stopping at collision boundary
 * - Configurable iteration count for precision/performance tradeoff
 *
 * USAGE:
 * When collision.blocked is true during drag:
 * 1. Run clampDeltaByCollision to find maximum safe delta
 * 2. Use deltaClamped for preview position
 * 3. Result collision should be not blocked (or at k=0)
 */

import type { Vec3 } from '../types/SnapTypes';
import type { CabinetInstanceMinimal, CollisionAdapter } from './collisionAdapter';
import type { CollisionReport } from './collisionReport';
import type { SelectionCollisionConfig } from './selectionCollision';
import {
  checkSelectionCollision,
  makeNonSelectedProvider,
  DEFAULT_SELECTION_COLLISION_CONFIG,
} from './selectionCollision';

// ============================================
// TYPES
// ============================================

export interface ClampDeltaConfig extends SelectionCollisionConfig {
  /** Number of binary search iterations (default: 12) */
  iterations: number;
}

export const DEFAULT_CLAMP_CONFIG: ClampDeltaConfig = {
  ...DEFAULT_SELECTION_COLLISION_CONFIG,
  iterations: 12,
};

export interface ClampDeltaResult {
  /** Clamped delta (scaled down to avoid collision) */
  deltaClamped: Vec3;
  /** Scale factor applied (0..1) */
  scaleFactor: number;
  /** Collision report at clamped position */
  collision: CollisionReport;
  /** Whether original delta was blocked */
  wasBlocked: boolean;
}

// ============================================
// HELPERS
// ============================================

/**
 * Multiply vector by scalar
 */
function mulVec3(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/**
 * Apply delta to selection (create preview positions)
 */
function applyDeltaToSelection(
  selection: CabinetInstanceMinimal[],
  delta: Vec3
): CabinetInstanceMinimal[] {
  return selection.map(cab => ({
    ...cab,
    position: {
      x: cab.position.x + delta.x,
      y: cab.position.y + delta.y,
      z: cab.position.z + delta.z,
    },
  }));
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Clamp delta using binary search to find maximum safe value
 *
 * @param args.selStart - Original positions of selected cabinets
 * @param args.deltaWorld - Desired delta in world space (mm)
 * @param args.adapter - Collision adapter
 * @param args.selectedIds - Set of selected cabinet IDs
 * @param args.config - Clamp configuration
 * @returns Clamped delta and collision result
 *
 * @example
 * if (collision.blocked) {
 *   const clamped = clampDeltaByCollision({
 *     selStart: originalPositions,
 *     deltaWorld: desiredDelta,
 *     adapter,
 *     selectedIds,
 *   });
 *
 *   // Use clamped.deltaClamped for preview
 *   // clamped.collision.blocked should be false
 * }
 */
export function clampDeltaByCollision(args: {
  selStart: CabinetInstanceMinimal[];
  deltaWorld: Vec3;
  adapter: CollisionAdapter;
  selectedIds: Set<string>;
  config?: Partial<ClampDeltaConfig>;
}): ClampDeltaResult {
  const config = { ...DEFAULT_CLAMP_CONFIG, ...args.config };

  // Provider for non-selected candidates
  const nonSelectedProvider = makeNonSelectedProvider({
    adapter: args.adapter,
    selectedIds: args.selectedIds,
    nearbyRadiusMm: config.nearbyRadiusMm,
  });

  // Test function at scale k
  const testAtScale = (k: number): CollisionReport => {
    const delta = mulVec3(args.deltaWorld, k);
    const selPreview = applyDeltaToSelection(args.selStart, delta);

    return checkSelectionCollision({
      selection: selPreview,
      nonSelectedProvider,
      adapter: args.adapter,
      config,
    });
  };

  // First, test at k=1 (full delta)
  const col1 = testAtScale(1);
  if (!col1.blocked) {
    // No collision at full delta, return as-is
    return {
      deltaClamped: args.deltaWorld,
      scaleFactor: 1,
      collision: col1,
      wasBlocked: false,
    };
  }

  // Binary search for maximum safe k
  let lo = 0;
  let hi = 1;
  let best = 0;
  let bestCol = testAtScale(0);

  for (let i = 0; i < config.iterations; i++) {
    const mid = (lo + hi) * 0.5;
    const col = testAtScale(mid);

    if (!col.blocked) {
      // Safe at mid, try higher
      best = mid;
      bestCol = col;
      lo = mid;
    } else {
      // Blocked at mid, try lower
      hi = mid;
    }
  }

  return {
    deltaClamped: mulVec3(args.deltaWorld, best),
    scaleFactor: best,
    collision: bestCol,
    wasBlocked: true,
  };
}

/**
 * Clamp delta along a single axis (useful for axis-constrained dragging)
 */
export function clampDeltaAlongAxis(args: {
  selStart: CabinetInstanceMinimal[];
  axis: 'X' | 'Y' | 'Z';
  deltaMm: number;
  adapter: CollisionAdapter;
  selectedIds: Set<string>;
  config?: Partial<ClampDeltaConfig>;
}): ClampDeltaResult {
  const deltaWorld: Vec3 = {
    x: args.axis === 'X' ? args.deltaMm : 0,
    y: args.axis === 'Y' ? args.deltaMm : 0,
    z: args.axis === 'Z' ? args.deltaMm : 0,
  };

  return clampDeltaByCollision({
    selStart: args.selStart,
    deltaWorld,
    adapter: args.adapter,
    selectedIds: args.selectedIds,
    config: args.config,
  });
}

/**
 * Quick clamp without full binary search (just stop if blocked)
 * Faster but less smooth UX
 */
export function quickClampDelta(args: {
  selStart: CabinetInstanceMinimal[];
  deltaWorld: Vec3;
  adapter: CollisionAdapter;
  selectedIds: Set<string>;
  config?: Partial<SelectionCollisionConfig>;
}): { deltaClamped: Vec3; blocked: boolean } {
  const config = { ...DEFAULT_SELECTION_COLLISION_CONFIG, ...args.config };

  const nonSelectedProvider = makeNonSelectedProvider({
    adapter: args.adapter,
    selectedIds: args.selectedIds,
    nearbyRadiusMm: config.nearbyRadiusMm,
  });

  const selPreview = applyDeltaToSelection(args.selStart, args.deltaWorld);
  const collision = checkSelectionCollision({
    selection: selPreview,
    nonSelectedProvider,
    adapter: args.adapter,
    config,
  });

  if (collision.blocked) {
    // Return zero delta
    return {
      deltaClamped: { x: 0, y: 0, z: 0 },
      blocked: true,
    };
  }

  return {
    deltaClamped: args.deltaWorld,
    blocked: false,
  };
}
