/**
 * shadowMetrics.ts - Shadow Run Metrics Aggregation
 *
 * PURPOSE:
 * - Aggregate metrics from shadow simulation runs
 * - Compare base vs trial configurations
 * - Generate verdict on whether trial improves performance
 *
 * METRICS TRACKED:
 * - Collision: ms, satPairs, nearItems
 * - Snap: candidateCount, flip-flop toggles
 * - Frame: dtSec
 *
 * USAGE:
 * const base = createAgg();
 * const trial = createAgg();
 *
 * // During simulation loop
 * addSampleAgg(base, sample, prevEngaged);
 * addSampleAgg(trial, sample, prevEngaged);
 *
 * // After simulation
 * const report = buildReport({ id, durationSec, base, trial });
 */

// ============================================
// AGGREGATION TYPE
// ============================================

export interface ShadowAgg {
  /** Number of samples collected */
  samples: number;

  // Collision metrics
  /** Sum of collision check times (ms) */
  collisionMsSum: number;
  /** Max collision check time (ms) */
  collisionMsMax: number;
  /** Sum of SAT pair checks */
  satPairsSum: number;
  /** Sum of near items from spatial queries */
  nearItemsSum: number;

  // Snap metrics
  /** Sum of candidate counts */
  candidateCountSum: number;
  /** Max candidate count */
  candidateCountMax: number;
  /** Number of engage/disengage toggles (flip-flop indicator) */
  flipFlopToggles: number;

  // Frame metrics
  /** Sum of dt values (for average FPS calculation) */
  dtSum: number;
}

// ============================================
// REPORT TYPE
// ============================================

export interface ShadowReportDelta {
  /** Change in average collision ms (%) */
  collisionMsAvgPct: number;
  /** Change in max collision ms (%) */
  collisionMsMaxPct: number;
  /** Change in average SAT pairs (%) */
  satPairsAvgPct: number;
  /** Change in average near items (%) */
  nearItemsAvgPct: number;
  /** Change in average candidate count (%) */
  candidateAvgPct: number;
  /** Change in max candidate count (%) */
  candidateMaxPct: number;
  /** Change in flip-flop rate (%) */
  flipFlopPct: number;
}

export type ShadowVerdict = 'IMPROVES' | 'MIXED' | 'WORSENS' | 'INCONCLUSIVE';

export interface ShadowReport {
  /** Unique report ID */
  id: string;

  /** Simulation duration (seconds) */
  durationSec: number;

  /** Base configuration aggregation */
  base: ShadowAgg;

  /** Trial configuration aggregation */
  trial: ShadowAgg;

  /** Computed deltas (trial vs base, negative = improvement) */
  delta: ShadowReportDelta;

  /** Overall verdict */
  verdict: ShadowVerdict;

  /** Human-readable notes about the simulation */
  notes: string[];

  /** Timestamp when report was generated */
  ts: number;
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create empty aggregation object
 */
export function createAgg(): ShadowAgg {
  return {
    samples: 0,
    collisionMsSum: 0,
    collisionMsMax: 0,
    satPairsSum: 0,
    nearItemsSum: 0,
    candidateCountSum: 0,
    candidateCountMax: 0,
    flipFlopToggles: 0,
    dtSum: 0,
  };
}

// ============================================
// SAMPLE INPUT TYPE
// ============================================

export interface ShadowSample {
  collisionMs?: number;
  satPairs?: number;
  nearItems?: number;
  candidateCount?: number;
  engaged?: boolean;
  dtSec?: number;
}

// ============================================
// ADD SAMPLE TO AGGREGATION
// ============================================

export interface AddSampleResult {
  agg: ShadowAgg;
  engagedNow: boolean | null;
  toggled: boolean;
}

/**
 * Add a sample to aggregation
 *
 * @param agg - Current aggregation
 * @param sample - Sample data to add
 * @param prevEngaged - Previous engaged state (for flip-flop tracking)
 * @returns New aggregation and engaged state info
 */
export function addSampleAgg(
  agg: ShadowAgg,
  sample: ShadowSample,
  prevEngaged: boolean | null
): AddSampleResult {
  const engagedNow = typeof sample.engaged === 'boolean' ? sample.engaged : null;

  // Detect flip-flop (state transition)
  let toggled = false;
  if (engagedNow !== null && prevEngaged !== null && engagedNow !== prevEngaged) {
    toggled = true;
  }

  // Create new aggregation (immutable)
  const next: ShadowAgg = { ...agg };
  next.samples++;

  // Collision metrics
  if (typeof sample.collisionMs === 'number') {
    next.collisionMsSum += sample.collisionMs;
    next.collisionMsMax = Math.max(next.collisionMsMax, sample.collisionMs);
  }
  if (typeof sample.satPairs === 'number') {
    next.satPairsSum += sample.satPairs;
  }
  if (typeof sample.nearItems === 'number') {
    next.nearItemsSum += sample.nearItems;
  }

  // Snap metrics
  if (typeof sample.candidateCount === 'number') {
    next.candidateCountSum += sample.candidateCount;
    next.candidateCountMax = Math.max(next.candidateCountMax, sample.candidateCount);
  }

  // Frame metrics
  if (typeof sample.dtSec === 'number') {
    next.dtSum += sample.dtSec;
  }

  // Flip-flop tracking
  if (toggled) {
    next.flipFlopToggles++;
  }

  return { agg: next, engagedNow, toggled };
}

// ============================================
// HELPER: SAFE AVERAGE
// ============================================

function safeAvg(sum: number, n: number): number {
  return n > 0 ? sum / n : 0;
}

// ============================================
// HELPER: PERCENT CHANGE
// ============================================

/**
 * Calculate percentage change from base to trial
 * Negative value = trial is lower (improvement for most metrics)
 */
function pctChange(trial: number, base: number): number {
  if (Math.abs(base) < 1e-9) return 0;
  return ((trial - base) / base) * 100;
}

// ============================================
// BUILD REPORT
// ============================================

export interface BuildReportArgs {
  id: string;
  durationSec: number;
  base: ShadowAgg;
  trial: ShadowAgg;
}

/**
 * Build comparison report from base and trial aggregations
 */
export function buildReport(args: BuildReportArgs): ShadowReport {
  const bN = Math.max(1, args.base.samples);
  const tN = Math.max(1, args.trial.samples);

  // Calculate averages
  const bCollisionAvg = safeAvg(args.base.collisionMsSum, bN);
  const tCollisionAvg = safeAvg(args.trial.collisionMsSum, tN);

  const bSatAvg = safeAvg(args.base.satPairsSum, bN);
  const tSatAvg = safeAvg(args.trial.satPairsSum, tN);

  const bNearAvg = safeAvg(args.base.nearItemsSum, bN);
  const tNearAvg = safeAvg(args.trial.nearItemsSum, tN);

  const bCandAvg = safeAvg(args.base.candidateCountSum, bN);
  const tCandAvg = safeAvg(args.trial.candidateCountSum, tN);

  const bFlipRate = safeAvg(args.base.flipFlopToggles, bN);
  const tFlipRate = safeAvg(args.trial.flipFlopToggles, tN);

  // Calculate deltas
  const delta: ShadowReportDelta = {
    collisionMsAvgPct: pctChange(tCollisionAvg, bCollisionAvg),
    collisionMsMaxPct: pctChange(args.trial.collisionMsMax, args.base.collisionMsMax || 1e-9),
    satPairsAvgPct: pctChange(tSatAvg, bSatAvg),
    nearItemsAvgPct: pctChange(tNearAvg, bNearAvg),
    candidateAvgPct: pctChange(tCandAvg, bCandAvg),
    candidateMaxPct: pctChange(args.trial.candidateCountMax, args.base.candidateCountMax || 1e-9),
    flipFlopPct: pctChange(tFlipRate, bFlipRate || 1e-9),
  };

  const notes: string[] = [];

  // Determine verdict based on heuristics
  // Lower is better for: collision ms, satPairs, nearItems, candidates, flipFlop
  const significantImprovement =
    delta.collisionMsAvgPct < -10 ||
    delta.satPairsAvgPct < -10 ||
    delta.candidateAvgPct < -10;

  const significantRegression =
    delta.collisionMsAvgPct > 10 ||
    delta.satPairsAvgPct > 10 ||
    delta.candidateAvgPct > 10;

  const mixedResults =
    (delta.collisionMsAvgPct < -5 && delta.candidateAvgPct > 5) ||
    (delta.collisionMsAvgPct > 5 && delta.candidateAvgPct < -5);

  let verdict: ShadowVerdict = 'MIXED';

  if (
    Math.abs(delta.collisionMsAvgPct) < 3 &&
    Math.abs(delta.satPairsAvgPct) < 3 &&
    Math.abs(delta.candidateAvgPct) < 3
  ) {
    verdict = 'INCONCLUSIVE';
    notes.push('Changes are within noise threshold; consider longer simulation.');
  } else if (significantImprovement && !significantRegression) {
    verdict = 'IMPROVES';
    if (delta.collisionMsAvgPct < -10) {
      notes.push(`Collision time improved by ${Math.abs(delta.collisionMsAvgPct).toFixed(1)}%`);
    }
    if (delta.candidateAvgPct < -10) {
      notes.push(`Candidate count reduced by ${Math.abs(delta.candidateAvgPct).toFixed(1)}%`);
    }
  } else if (significantRegression && !significantImprovement) {
    verdict = 'WORSENS';
    if (delta.collisionMsAvgPct > 10) {
      notes.push(`Warning: Collision time increased by ${delta.collisionMsAvgPct.toFixed(1)}%`);
    }
    if (delta.candidateAvgPct > 10) {
      notes.push(`Warning: Candidate count increased by ${delta.candidateAvgPct.toFixed(1)}%`);
    }
  } else if (mixedResults) {
    verdict = 'MIXED';
    notes.push('Mixed results: some metrics improved, others regressed.');
  }

  // Add sample count info if low
  if (args.trial.samples < 20) {
    notes.push(`Low sample count (${args.trial.samples}); results may not be representative.`);
  }

  return {
    id: args.id,
    durationSec: args.durationSec,
    base: args.base,
    trial: args.trial,
    delta,
    verdict,
    notes,
    ts: Date.now(),
  };
}

// ============================================
// PRETTY PRINT HELPERS
// ============================================

/**
 * Format delta value with direction indicator
 */
export function formatDelta(pct: number): string {
  const sign = pct > 0 ? '+' : '';
  const indicator = pct < -5 ? ' (better)' : pct > 5 ? ' (worse)' : '';
  return `${sign}${pct.toFixed(1)}%${indicator}`;
}

/**
 * Get color for delta value
 */
export function getDeltaColor(pct: number): string {
  if (pct < -5) return '#4ade80'; // Green - improvement
  if (pct > 5) return '#f87171'; // Red - regression
  return '#94a3b8'; // Gray - neutral
}

/**
 * Get verdict color
 */
export function getVerdictColor(verdict: ShadowVerdict): string {
  switch (verdict) {
    case 'IMPROVES':
      return '#4ade80'; // Green
    case 'WORSENS':
      return '#f87171'; // Red
    case 'MIXED':
      return '#facc15'; // Yellow
    case 'INCONCLUSIVE':
    default:
      return '#94a3b8'; // Gray
  }
}

/**
 * Get verdict icon
 */
export function getVerdictIcon(verdict: ShadowVerdict): string {
  switch (verdict) {
    case 'IMPROVES':
      return '✓';
    case 'WORSENS':
      return '✗';
    case 'MIXED':
      return '~';
    case 'INCONCLUSIVE':
    default:
      return '?';
  }
}
