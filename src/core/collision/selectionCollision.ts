/**
 * selectionCollision.ts - Collision Detection for Multi-Select
 *
 * FEATURES:
 * - Internal collision: selection vs selection (prevent overlap within group)
 * - External collision: selection vs non-selected (prevent overlap with environment)
 * - Configurable minGap enforcement
 * - Returns comprehensive CollisionReport
 *
 * DETERMINISTIC:
 * - Same selection + positions always produces same report
 * - Iteration order is fixed (i < j for internal, deterministic for external)
 */

import type { CabinetInstanceMinimal, CollisionAdapter, PairTestResult } from './collisionAdapter';
import type {
  CollisionReport,
  CollisionPair,
  CollisionSeverity,
  CollisionReason,
  CollisionSource,
} from './collisionReport';

// ============================================
// CONFIGURATION
// ============================================

export interface SelectionCollisionConfig {
  /** Minimum required gap between objects in mm (default: 1) */
  minGapMm: number;
  /** Epsilon for overlap detection (default: 0.05) */
  overlapEpsMm: number;
  /** Radius for broadphase query in mm (default: 2000) */
  nearbyRadiusMm: number;
  /** Enable internal collision checks (default: true) */
  checkInternal: boolean;
  /** Enable external collision checks (default: true) */
  checkExternal: boolean;
}

export const DEFAULT_SELECTION_COLLISION_CONFIG: SelectionCollisionConfig = {
  minGapMm: 1,
  overlapEpsMm: 0.05,
  nearbyRadiusMm: 2000,
  checkInternal: true,
  checkExternal: true,
};

// ============================================
// PROVIDER TYPES
// ============================================

/**
 * Function to get non-selected candidates for external collision
 */
export type NonSelectedProvider = (cab: CabinetInstanceMinimal) => CabinetInstanceMinimal[];

/**
 * Create a non-selected provider from adapter
 */
export function makeNonSelectedProvider(args: {
  adapter: CollisionAdapter;
  selectedIds: Set<string>;
  nearbyRadiusMm: number;
}): NonSelectedProvider {
  return (cab: CabinetInstanceMinimal): CabinetInstanceMinimal[] => {
    const nearby = args.adapter.queryNearby({ cab, radiusMm: args.nearbyRadiusMm });
    return nearby.filter(x => !args.selectedIds.has(x.id));
  };
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Check collision for entire selection
 *
 * @param args.selection - Preview positions of selected cabinets
 * @param args.nonSelectedProvider - Function to get external candidates
 * @param args.adapter - Collision adapter for pair testing
 * @param args.config - Collision configuration
 * @returns CollisionReport with all detected pairs
 *
 * @example
 * const selectedIds = new Set(selection.map(s => s.id));
 * const nonSelectedProvider = makeNonSelectedProvider({
 *   adapter,
 *   selectedIds,
 *   nearbyRadiusMm: 2000,
 * });
 *
 * const report = checkSelectionCollision({
 *   selection: previewPositions,
 *   nonSelectedProvider,
 *   adapter,
 *   config: DEFAULT_SELECTION_COLLISION_CONFIG,
 * });
 *
 * if (report.blocked) {
 *   // Show error in UI
 * }
 */
export function checkSelectionCollision(args: {
  selection: CabinetInstanceMinimal[];
  nonSelectedProvider: NonSelectedProvider;
  adapter: CollisionAdapter;
  config?: Partial<SelectionCollisionConfig>;
}): CollisionReport {
  const config = { ...DEFAULT_SELECTION_COLLISION_CONFIG, ...args.config };
  const startTime = performance.now();

  const pairs: CollisionPair[] = [];
  let checkedPairs = 0;

  // ---- INTERNAL: selection vs selection (i < j to avoid duplicates)
  if (config.checkInternal) {
    for (let i = 0; i < args.selection.length; i++) {
      for (let j = i + 1; j < args.selection.length; j++) {
        const a = args.selection[i];
        const b = args.selection[j];
        checkedPairs++;

        const result = args.adapter.testPair({ a, b });
        const pair = evaluatePairResult(result, a.id, b.id, config, 'INTERNAL');

        if (pair) {
          pairs.push(pair);
        }
      }
    }
  }

  // ---- EXTERNAL: selection vs non-selected candidates
  if (config.checkExternal) {
    // Track checked pairs to avoid duplicates
    const checkedExternal = new Set<string>();

    for (const a of args.selection) {
      const candidates = args.nonSelectedProvider(a);

      for (const b of candidates) {
        // Skip self (should not happen but be safe)
        if (a.id === b.id) continue;

        // Avoid checking same pair twice
        const pairKey = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        if (checkedExternal.has(pairKey)) continue;
        checkedExternal.add(pairKey);

        checkedPairs++;

        const result = args.adapter.testPair({ a, b });
        const pair = evaluatePairResult(result, a.id, b.id, config, 'EXTERNAL');

        if (pair) {
          pairs.push(pair);
        }
      }
    }
  }

  const blocked = pairs.some(p => p.severity === 'ERROR');
  const durationMs = performance.now() - startTime;

  return { blocked, pairs, checkedPairs, durationMs };
}

// ============================================
// HELPERS
// ============================================

/**
 * Evaluate pair test result and create CollisionPair if needed
 */
function evaluatePairResult(
  result: PairTestResult,
  aId: string,
  bId: string,
  config: SelectionCollisionConfig,
  source: CollisionSource
): CollisionPair | null {
  const isOverlap = result.penetrationMm > config.overlapEpsMm;
  const isTooClose = !isOverlap && result.gapMm < config.minGapMm;

  if (!isOverlap && !isTooClose) {
    return null; // No issue
  }

  const severity: CollisionSeverity = 'ERROR';
  const reason: CollisionReason = isOverlap ? 'OVERLAP' : 'MIN_GAP_VIOLATION';

  return {
    aId,
    bId,
    penetrationMm: result.penetrationMm,
    gapMm: result.gapMm,
    severity,
    reason,
    source,
  };
}

/**
 * Quick check if selection has any collisions
 * (Faster than full report when you only need boolean)
 */
export function hasSelectionCollision(args: {
  selection: CabinetInstanceMinimal[];
  nonSelectedProvider: NonSelectedProvider;
  adapter: CollisionAdapter;
  config?: Partial<SelectionCollisionConfig>;
}): boolean {
  const config = { ...DEFAULT_SELECTION_COLLISION_CONFIG, ...args.config };

  // Internal check
  if (config.checkInternal) {
    for (let i = 0; i < args.selection.length; i++) {
      for (let j = i + 1; j < args.selection.length; j++) {
        const result = args.adapter.testPair({
          a: args.selection[i],
          b: args.selection[j],
        });

        if (result.penetrationMm > config.overlapEpsMm) return true;
        if (result.gapMm < config.minGapMm) return true;
      }
    }
  }

  // External check
  if (config.checkExternal) {
    for (const a of args.selection) {
      const candidates = args.nonSelectedProvider(a);

      for (const b of candidates) {
        if (a.id === b.id) continue;

        const result = args.adapter.testPair({ a, b });

        if (result.penetrationMm > config.overlapEpsMm) return true;
        if (result.gapMm < config.minGapMm) return true;
      }
    }
  }

  return false;
}

/**
 * Get collision report for a single cabinet against others
 * (Useful for single-select mode)
 */
export function checkSingleCabinetCollision(args: {
  cabinet: CabinetInstanceMinimal;
  others: CabinetInstanceMinimal[];
  adapter: CollisionAdapter;
  config?: Partial<SelectionCollisionConfig>;
}): CollisionReport {
  const config = { ...DEFAULT_SELECTION_COLLISION_CONFIG, ...args.config };
  const startTime = performance.now();

  const pairs: CollisionPair[] = [];
  let checkedPairs = 0;

  for (const other of args.others) {
    if (other.id === args.cabinet.id) continue;

    checkedPairs++;
    const result = args.adapter.testPair({ a: args.cabinet, b: other });
    const pair = evaluatePairResult(
      result,
      args.cabinet.id,
      other.id,
      config,
      'EXTERNAL'
    );

    if (pair) {
      pairs.push(pair);
    }
  }

  const blocked = pairs.some(p => p.severity === 'ERROR');
  const durationMs = performance.now() - startTime;

  return { blocked, pairs, checkedPairs, durationMs };
}
