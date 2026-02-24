/**
 * shadowRunner.ts - Shadow Simulation Runner
 *
 * PURPOSE:
 * - Run simulation comparing base vs trial configurations
 * - Collect metrics without affecting runtime state
 * - Generate comparison report with verdict
 *
 * SAFETY:
 * - Uses local copies of cabinet transforms
 * - Does NOT commit any state to store
 * - Read-only collision context
 * - Safe to run in production (behind debug flag)
 *
 * ALGORITHM:
 * 1. Take snapshot of current drag state
 * 2. Run simulation loop for specified duration
 * 3. For each tick:
 *    a. Apply velocity delta to preview position
 *    b. Evaluate candidates and collision for BASE config
 *    c. Evaluate candidates and collision for TRIAL config
 *    d. Aggregate metrics separately
 * 4. Build and return comparison report
 *
 * USAGE:
 * const report = await runShadowComparison({
 *   input: currentDragState,
 *   trial: { nearPaddingMm: 120, cellSizeMm: 600 },
 * });
 *
 * if (report.verdict === 'IMPROVES') {
 *   // Safe to apply suggested changes
 * }
 */

import { nowMs } from './timer';
import {
  createAgg,
  addSampleAgg,
  buildReport,
  type ShadowAgg,
  type ShadowReport,
  type ShadowSample,
} from './shadowMetrics';
import {
  type ShadowOverrides,
  listOverrideChanges,
  validateOverrides,
} from './shadowOverrides';

// ============================================
// INPUT TYPES
// ============================================

/**
 * Snapshot of current drag/snap state for shadow simulation
 *
 * This should be captured from the actual drag controller
 * when the user triggers a simulation.
 */
export interface ShadowRunInput {
  /** Unique simulation ID */
  id: string;

  /** Simulation duration (seconds) */
  durationSec: number;

  // Current configuration values (base)
  config: {
    nearPaddingMm: number;
    cellSizeMm: number;
    snapThresholdMm: number;
    engageThresholdMm: number;
    disengageThresholdMm: number;
    stickyScoreMargin: number;
    lookaheadMinMs: number;
    lookaheadMaxMs: number;
    maxLookaheadMm: number;
    fixedStepHz: number;
  };

  // Current kinematics
  velocityWorld: { x: number; y: number; z: number };
  speed: number;

  // Current snap state
  engaged: boolean;
  candidateCount: number;

  // Frame timing
  dtSec: number;

  // Optional: recent collision stats (if available)
  lastCollisionMs?: number;
  lastSatPairs?: number;
  lastNearItems?: number;
}

// ============================================
// RUNNER CONFIG
// ============================================

export interface ShadowRunnerConfig {
  /** Max simulation duration (safety limit) */
  maxDurationSec: number;

  /** Target simulation FPS */
  targetFps: number;

  /** Min samples required for valid report */
  minSamples: number;

  /** Yield interval to avoid blocking UI (ms) */
  yieldIntervalMs: number;
}

export const DEFAULT_RUNNER_CONFIG: ShadowRunnerConfig = {
  maxDurationSec: 3.0,
  targetFps: 60,
  minSamples: 30,
  yieldIntervalMs: 16,
};

// ============================================
// SIMULATION EVALUATOR (Abstract)
// ============================================

/**
 * Evaluation function for a single tick
 *
 * This is abstracted to allow injection of real collision/snap logic
 * from the actual application code.
 *
 * For testing or standalone use, use the built-in simulator.
 */
export type TickEvaluator = (args: {
  config: ShadowRunInput['config'];
  velocityWorld: { x: number; y: number; z: number };
  speed: number;
  dtSec: number;
  tickIndex: number;
}) => ShadowSample;

// ============================================
// BUILT-IN SIMULATOR (Estimation Mode)
// ============================================

/**
 * Built-in tick evaluator using estimation formulas
 *
 * This provides reasonable estimates without needing full collision logic.
 * For accurate results, inject real evaluator from application.
 */
export function createEstimationEvaluator(baseStats: {
  avgCollisionMs: number;
  avgSatPairs: number;
  avgNearItems: number;
  avgCandidates: number;
}): TickEvaluator {
  return ({ config, speed, dtSec, tickIndex }) => {
    // Estimate how config changes affect metrics
    // These are rough heuristics based on typical behavior

    // nearPaddingMm affects nearItems and satPairs
    const nearItemsScale = config.nearPaddingMm / 150; // baseline 150mm
    const nearItems = Math.round(baseStats.avgNearItems * nearItemsScale * nearItemsScale);

    // satPairs roughly scales with nearItems squared
    const satPairsScale = nearItemsScale * nearItemsScale;
    const satPairs = Math.round(baseStats.avgSatPairs * satPairsScale);

    // collisionMs scales with satPairs
    const collisionMs = baseStats.avgCollisionMs * (satPairs / Math.max(1, baseStats.avgSatPairs));

    // candidates scale with snapThresholdMm
    const candidateScale = config.snapThresholdMm / 300; // baseline 300mm
    const candidateCount = Math.round(baseStats.avgCandidates * candidateScale * candidateScale);

    // Engagement fluctuates based on speed and threshold
    // Higher threshold = more likely engaged, but also more flip-flop risk
    const engageProbability = Math.min(1, (config.snapThresholdMm / 300) * 0.7);
    const engaged = Math.random() < engageProbability;

    return {
      collisionMs,
      satPairs,
      nearItems,
      candidateCount,
      engaged,
      dtSec,
    };
  };
}

// ============================================
// FIXED-STEP SPLITTING
// ============================================

/**
 * Split dt into fixed-step intervals
 */
function splitDt(dtSec: number, hz: number, maxSubSteps = 5): number[] {
  const step = 1 / hz;
  const n = Math.min(maxSubSteps, Math.max(1, Math.floor(dtSec / step)));
  const steps: number[] = [];
  const each = dtSec / n;

  for (let i = 0; i < n; i++) {
    steps.push(each);
  }

  return steps;
}

// ============================================
// MAIN RUNNER FUNCTION
// ============================================

export interface ShadowComparisonArgs {
  /** Input snapshot from drag state */
  input: ShadowRunInput;

  /** Trial configuration overrides */
  trial: ShadowOverrides;

  /** Optional: Custom tick evaluator */
  evaluator?: TickEvaluator;

  /** Optional: Runner configuration */
  config?: Partial<ShadowRunnerConfig>;
}

/**
 * Run shadow comparison simulation
 *
 * Compares base configuration against trial overrides
 * and returns report with verdict.
 */
export async function runShadowComparison(
  args: ShadowComparisonArgs
): Promise<ShadowReport> {
  const cfg = { ...DEFAULT_RUNNER_CONFIG, ...args.config };
  const { input, trial } = args;

  // Validate overrides
  const validationErrors = validateOverrides(trial);
  if (validationErrors.length > 0) {
    console.warn('[ShadowRunner] Override validation warnings:', validationErrors);
  }

  // Clamp duration for safety
  const durationSec = Math.min(input.durationSec, cfg.maxDurationSec);

  // Create base config from input
  const baseConfig = { ...input.config };

  // Create trial config with overrides applied
  const trialConfig = {
    ...baseConfig,
    nearPaddingMm: trial.nearPaddingMm ?? baseConfig.nearPaddingMm,
    cellSizeMm: trial.cellSizeMm ?? baseConfig.cellSizeMm,
    snapThresholdMm: trial.snapThresholdMm ?? baseConfig.snapThresholdMm,
    engageThresholdMm: trial.engageThresholdMm ?? baseConfig.engageThresholdMm,
    disengageThresholdMm: trial.disengageThresholdMm ?? baseConfig.disengageThresholdMm,
    stickyScoreMargin: trial.stickyScoreMargin ?? baseConfig.stickyScoreMargin,
    lookaheadMinMs: trial.lookaheadMinMs ?? baseConfig.lookaheadMinMs,
    lookaheadMaxMs: trial.lookaheadMaxMs ?? baseConfig.lookaheadMaxMs,
    maxLookaheadMm: trial.maxLookaheadMm ?? baseConfig.maxLookaheadMm,
    fixedStepHz: trial.fixedStepHz ?? baseConfig.fixedStepHz,
  };

  // Create or use provided evaluator
  const evaluator = args.evaluator ?? createEstimationEvaluator({
    avgCollisionMs: input.lastCollisionMs ?? 2.0,
    avgSatPairs: input.lastSatPairs ?? 15,
    avgNearItems: input.lastNearItems ?? 25,
    avgCandidates: input.candidateCount,
  });

  // Initialize aggregations
  let baseAgg = createAgg();
  let trialAgg = createAgg();

  // Track engaged states for flip-flop detection
  let prevEngagedBase: boolean | null = input.engaged;
  let prevEngagedTrial: boolean | null = input.engaged;

  // Simulation timing
  const tStart = nowMs();
  const tEnd = tStart + durationSec * 1000;
  let tickIndex = 0;
  let lastYield = tStart;

  // Simulation loop
  while (nowMs() < tEnd) {
    // Base evaluation
    const baseHz = baseConfig.fixedStepHz;
    const baseSteps = splitDt(input.dtSec, baseHz);

    for (const dt of baseSteps) {
      const sample = evaluator({
        config: baseConfig,
        velocityWorld: input.velocityWorld,
        speed: input.speed,
        dtSec: dt,
        tickIndex,
      });

      const result = addSampleAgg(baseAgg, sample, prevEngagedBase);
      baseAgg = result.agg;
      prevEngagedBase = result.engagedNow ?? prevEngagedBase;
      tickIndex++;
    }

    // Trial evaluation
    const trialHz = trialConfig.fixedStepHz;
    const trialSteps = splitDt(input.dtSec, trialHz);

    for (const dt of trialSteps) {
      const sample = evaluator({
        config: trialConfig,
        velocityWorld: input.velocityWorld,
        speed: input.speed,
        dtSec: dt,
        tickIndex,
      });

      const result = addSampleAgg(trialAgg, sample, prevEngagedTrial);
      trialAgg = result.agg;
      prevEngagedTrial = result.engagedNow ?? prevEngagedTrial;
    }

    // Yield to UI periodically
    const now = nowMs();
    if (now - lastYield > cfg.yieldIntervalMs) {
      await new Promise(resolve => setTimeout(resolve, 0));
      lastYield = now;
    }
  }

  // Build report
  const report = buildReport({
    id: input.id,
    durationSec,
    base: baseAgg,
    trial: trialAgg,
  });

  // Add override information to notes
  const changes = listOverrideChanges(baseConfig as unknown as Record<string, number>, trial);
  if (changes.length > 0) {
    report.notes.unshift(`Trial overrides: ${changes.join(', ')}`);
  }

  // Add sample counts
  report.notes.push(`Samples: base=${baseAgg.samples}, trial=${trialAgg.samples}`);

  return report;
}

// ============================================
// QUICK SIMULATION (Synchronous)
// ============================================

/**
 * Run quick synchronous simulation (for UI preview)
 *
 * Shorter duration, no yielding.
 */
export function runQuickSimulation(args: {
  input: ShadowRunInput;
  trial: ShadowOverrides;
  sampleCount?: number;
}): ShadowReport {
  const sampleCount = args.sampleCount ?? 50;
  const { input, trial } = args;

  const baseConfig = { ...input.config };
  const trialConfig = {
    ...baseConfig,
    nearPaddingMm: trial.nearPaddingMm ?? baseConfig.nearPaddingMm,
    cellSizeMm: trial.cellSizeMm ?? baseConfig.cellSizeMm,
    snapThresholdMm: trial.snapThresholdMm ?? baseConfig.snapThresholdMm,
    stickyScoreMargin: trial.stickyScoreMargin ?? baseConfig.stickyScoreMargin,
    fixedStepHz: trial.fixedStepHz ?? baseConfig.fixedStepHz,
  };

  const evaluator = createEstimationEvaluator({
    avgCollisionMs: input.lastCollisionMs ?? 2.0,
    avgSatPairs: input.lastSatPairs ?? 15,
    avgNearItems: input.lastNearItems ?? 25,
    avgCandidates: input.candidateCount,
  });

  let baseAgg = createAgg();
  let trialAgg = createAgg();

  let prevEngagedBase: boolean | null = input.engaged;
  let prevEngagedTrial: boolean | null = input.engaged;

  for (let i = 0; i < sampleCount; i++) {
    // Base
    const baseSample = evaluator({
      config: baseConfig,
      velocityWorld: input.velocityWorld,
      speed: input.speed,
      dtSec: input.dtSec,
      tickIndex: i,
    });
    const baseResult = addSampleAgg(baseAgg, baseSample, prevEngagedBase);
    baseAgg = baseResult.agg;
    prevEngagedBase = baseResult.engagedNow ?? prevEngagedBase;

    // Trial
    const trialSample = evaluator({
      config: trialConfig,
      velocityWorld: input.velocityWorld,
      speed: input.speed,
      dtSec: input.dtSec,
      tickIndex: i,
    });
    const trialResult = addSampleAgg(trialAgg, trialSample, prevEngagedTrial);
    trialAgg = trialResult.agg;
    prevEngagedTrial = trialResult.engagedNow ?? prevEngagedTrial;
  }

  const report = buildReport({
    id: input.id,
    durationSec: input.durationSec,
    base: baseAgg,
    trial: trialAgg,
  });

  const changes = listOverrideChanges(baseConfig as unknown as Record<string, number>, trial);
  if (changes.length > 0) {
    report.notes.unshift(`Trial overrides: ${changes.join(', ')}`);
  }

  return report;
}

// ============================================
// CREATE INPUT FROM CURRENT STATE
// ============================================

/**
 * Create ShadowRunInput from current application state
 *
 * Helper to capture snapshot for simulation.
 */
export function createShadowInput(args: {
  config: ShadowRunInput['config'];
  velocityWorld: { x: number; y: number; z: number };
  speed: number;
  engaged: boolean;
  candidateCount: number;
  dtSec: number;
  lastCollisionMs?: number;
  lastSatPairs?: number;
  lastNearItems?: number;
  durationSec?: number;
}): ShadowRunInput {
  return {
    id: `shadow-${Date.now()}`,
    durationSec: args.durationSec ?? 1.5,
    config: args.config,
    velocityWorld: args.velocityWorld,
    speed: args.speed,
    engaged: args.engaged,
    candidateCount: args.candidateCount,
    dtSec: args.dtSec,
    lastCollisionMs: args.lastCollisionMs,
    lastSatPairs: args.lastSatPairs,
    lastNearItems: args.lastNearItems,
  };
}
