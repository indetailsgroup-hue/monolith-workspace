// src/core/manufacturing/z/buildZPlan.ts
/**
 * Z Plan Builder.
 *
 * Builds deterministic Z schedules for CNC operations:
 * - Stepdown splitting by maxStepdownMm
 * - Onion skin support (stop before through)
 * - Finish modes (SKIM_LAST_ONLY, EACH_STEP)
 * - Through stage (final cut-through)
 *
 * Algorithm:
 * 1. Calculate zOnion = -(T - onionSkin)
 * 2. Calculate zThrough = -(T + spoilExtra)
 * 3. Split rough passes from topZ to roughTarget
 * 4. Generate finish passes based on finishMode
 * 5. Generate through passes if onionSkin > 0
 *
 * v0.10.6.8 - Z-aware Path Planning
 */

import {
  ZPlan,
  ZPlanRequest,
  ZContext,
  ZToolLimits,
  ZPass,
  ZPassKind,
  FinishMode,
  round3,
  calculateZOnion,
  calculateZThrough,
  DEFAULT_FINISH_MODE,
} from "./zPlan.v1";

// =============================================================================
// CONSTANTS
// =============================================================================

const Z_PLAN_VERSION = "0.10.6.8";

// =============================================================================
// STEPDOWN SPLITTING
// =============================================================================

/**
 * Split depth into multiple passes.
 *
 * Deterministic algorithm:
 * 1. Start from zTop, step down by maxStepdown
 * 2. Continue until reaching or passing zTarget
 * 3. Last pass may be smaller than maxStepdown
 *
 * @param zTop Starting Z (usually 0 or previous stage bottom)
 * @param zTarget Target Z (negative, the final depth)
 * @param maxStepdown Maximum stepdown per pass (mm)
 * @param kind Pass kind (ROUGH/FINISH/THROUGH)
 * @returns Array of ZPass objects
 */
export function splitDepth(
  zTop: number,
  zTarget: number,
  maxStepdown: number,
  kind: ZPassKind
): ZPass[] {
  // Validate inputs
  if (zTarget > zTop) {
    // Target is above start - no passes needed
    return [];
  }

  if (maxStepdown <= 0) {
    // Invalid stepdown
    return [];
  }

  const passes: ZPass[] = [];
  let currentZ = zTop;
  let passIndex = 0;
  const stepdown = Math.abs(maxStepdown);

  while (true) {
    const nextZ = currentZ - stepdown;

    if (nextZ <= zTarget) {
      // Final pass - may be smaller than stepdown
      const actualStepdown = Math.abs(zTarget - currentZ);

      // Only add if there's actual depth to cut
      if (actualStepdown > 0.001) {
        passes.push({
          passIndex,
          zTop: round3(currentZ),
          zBottom: round3(zTarget),
          kind,
          stepdownMm: round3(actualStepdown),
          isFinalPass: true,
        });
      }
      break;
    }

    // Normal pass
    passes.push({
      passIndex,
      zTop: round3(currentZ),
      zBottom: round3(nextZ),
      kind,
      stepdownMm: round3(stepdown),
      isFinalPass: false,
    });

    currentZ = nextZ;
    passIndex++;

    // Safety limit
    if (passIndex > 100) {
      console.warn("splitDepth: exceeded 100 passes, breaking");
      break;
    }
  }

  // Mark final pass
  if (passes.length > 0) {
    passes[passes.length - 1].isFinalPass = true;
  }

  return passes;
}

/**
 * Calculate equal stepdown for N passes.
 *
 * Used when you want to distribute depth evenly.
 *
 * @param totalDepth Total depth to cut (positive value)
 * @param maxStepdown Maximum stepdown per pass
 * @returns Optimal stepdown and pass count
 */
export function calculateEqualStepdown(
  totalDepth: number,
  maxStepdown: number
): { stepdown: number; passCount: number } {
  if (totalDepth <= 0 || maxStepdown <= 0) {
    return { stepdown: 0, passCount: 0 };
  }

  const passCount = Math.ceil(totalDepth / maxStepdown);
  const stepdown = round3(totalDepth / passCount);

  return { stepdown, passCount };
}

// =============================================================================
// FINISH PASS GENERATION
// =============================================================================

/**
 * Generate finish passes based on finish mode.
 *
 * SKIM_LAST_ONLY: Single pass at roughTarget (best surface)
 * EACH_STEP: Follow rough passes (more cutting, rougher surface)
 *
 * @param zTop Starting Z
 * @param roughTarget Target Z (onion or through level)
 * @param finishTool Finish tool limits
 * @param finishMode Finish mode configuration
 * @param roughPasses Rough passes for reference (EACH_STEP mode)
 * @returns Array of finish passes
 */
export function generateFinishPasses(
  zTop: number,
  roughTarget: number,
  finishTool: ZToolLimits,
  finishMode: FinishMode,
  roughPasses?: ZPass[]
): ZPass[] {
  const stepdown = finishTool.finishStepdownMm ?? finishTool.maxStepdownMm;

  if (finishMode.mode === "SKIM_LAST_ONLY") {
    // Single pass at final depth (wall-only finish)
    const skimTop = finishMode.skimDepthFromTopMm
      ? round3(zTop - finishMode.skimDepthFromTopMm)
      : zTop;

    // If skimTop is already at or below target, use target
    const effectiveTop = Math.max(skimTop, roughTarget);

    return [
      {
        passIndex: 0,
        zTop: round3(effectiveTop),
        zBottom: round3(roughTarget),
        kind: "FINISH",
        stepdownMm: round3(Math.abs(roughTarget - effectiveTop)),
        isFinalPass: true,
        feedMultiplier: 0.8, // Slower for finish quality
      },
    ];
  }

  // EACH_STEP mode: Follow rough passes
  return splitDepth(zTop, roughTarget, stepdown, "FINISH").map((p) => ({
    ...p,
    feedMultiplier: 0.8,
  }));
}

/**
 * Generate spring pass (optional re-finish after through).
 *
 * @param zTarget Target Z for spring pass
 * @returns Single spring pass
 */
export function generateSpringPass(zTarget: number): ZPass {
  return {
    passIndex: 0,
    zTop: round3(zTarget),
    zBottom: round3(zTarget),
    kind: "FINISH",
    stepdownMm: 0,
    isFinalPass: true,
    feedMultiplier: 0.5, // Very slow for best finish
  };
}

// =============================================================================
// THROUGH PASS GENERATION
// =============================================================================

/**
 * Generate through passes.
 *
 * Through cuts from onion level to spoilboard.
 *
 * @param zOnion Onion skin Z level
 * @param zThrough Through cut Z level
 * @param finishTool Tool limits for through cutting
 * @returns Array of through passes
 */
export function generateThroughPasses(
  zOnion: number,
  zThrough: number,
  finishTool: ZToolLimits
): ZPass[] {
  const stepdown = finishTool.finishStepdownMm ?? finishTool.maxStepdownMm;
  const depth = Math.abs(zThrough - zOnion);

  // If depth is small, single pass
  if (depth <= stepdown) {
    return [
      {
        passIndex: 0,
        zTop: round3(zOnion),
        zBottom: round3(zThrough),
        kind: "THROUGH",
        stepdownMm: round3(depth),
        isFinalPass: true,
      },
    ];
  }

  // Multi-pass through
  return splitDepth(zOnion, zThrough, stepdown, "THROUGH");
}

// =============================================================================
// MAIN BUILDER
// =============================================================================

/**
 * Build Z plan for a PROFILE operation.
 *
 * This is the main entry point for Z scheduling.
 *
 * Algorithm:
 * 1. Calculate zOnion = -(T - onionSkin)
 * 2. Calculate zThrough = -(T + spoilExtra)
 * 3. Rough target = zOnion (if onion) or zThrough (if no onion)
 * 4. Generate rough passes to rough target
 * 5. Generate finish passes based on finish mode
 * 6. Generate through passes if onion > 0
 *
 * @param req Z plan request
 * @returns Complete Z plan
 */
export function buildProfileZPlan(req: ZPlanRequest): ZPlan {
  const {
    opId,
    context,
    roughTool,
    finishTool,
    finishMode = DEFAULT_FINISH_MODE,
  } = req;

  const T = context.finishedThicknessMm;
  const zOnion = calculateZOnion(T, context.onionSkinMm);
  const zThrough = calculateZThrough(T, context.spoilExtraMm);

  // Determine rough target
  const hasOnion = context.onionSkinMm > 0;
  const roughTarget = hasOnion ? zOnion : zThrough;

  // Generate rough passes
  const roughPasses = splitDepth(
    context.topZ,
    roughTarget,
    roughTool.maxStepdownMm,
    "ROUGH"
  );

  // Generate finish passes
  const finishPasses = generateFinishPasses(
    context.topZ,
    roughTarget,
    finishTool,
    finishMode,
    roughPasses
  );

  // Generate through passes (only if onion skin is used)
  const throughPasses = hasOnion
    ? generateThroughPasses(zOnion, zThrough, finishTool)
    : undefined;

  // Add spring pass if requested
  if (finishMode.springPass && throughPasses && throughPasses.length > 0) {
    const springPass = generateSpringPass(zThrough);
    springPass.passIndex = throughPasses.length;
    throughPasses.push(springPass);
  }

  // Build Z list for audit
  const zList = [
    ...roughPasses.map((p) => p.zBottom),
    ...finishPasses.map((p) => p.zBottom),
    ...(throughPasses ?? []).map((p) => p.zBottom),
  ];

  // Build audit
  const audit = {
    formula: hasOnion
      ? `zOnion=-(T-onion)=${zOnion}, zThrough=-(T+spoil)=${zThrough}, split by maxStepdown`
      : `zThrough=-(T+spoil)=${zThrough}, no onion, split by maxStepdown`,
    zList,
    totalPasses:
      roughPasses.length +
      finishPasses.length +
      (throughPasses?.length ?? 0),
    zOnion: hasOnion ? zOnion : undefined,
    zThrough,
    generatedAt: new Date().toISOString(),
  };

  return {
    version: "1.0",
    opId,
    stages: {
      rough: roughPasses,
      finish: finishPasses,
      through: throughPasses,
    },
    context,
    toolLimits: { rough: roughTool, finish: finishTool },
    finishMode,
    audit,
  };
}

/**
 * Build Z plan for a POCKET operation.
 *
 * Similar to profile but typically no through stage.
 *
 * @param req Z plan request
 * @returns Complete Z plan
 */
export function buildPocketZPlan(req: ZPlanRequest): ZPlan {
  const {
    opId,
    context,
    roughTool,
    finishTool,
    finishMode = DEFAULT_FINISH_MODE,
  } = req;

  // Pocket doesn't go through - use cutDepthMm directly
  const pocketDepth = round3(-context.cutDepthMm);

  // Generate rough passes
  const roughPasses = splitDepth(
    context.topZ,
    pocketDepth,
    roughTool.maxStepdownMm,
    "ROUGH"
  );

  // Generate finish passes (wall skim only)
  const finishPasses = generateFinishPasses(
    context.topZ,
    pocketDepth,
    finishTool,
    { ...finishMode, mode: "SKIM_LAST_ONLY" }, // Always skim for pockets
    roughPasses
  );

  // Build Z list for audit
  const zList = [
    ...roughPasses.map((p) => p.zBottom),
    ...finishPasses.map((p) => p.zBottom),
  ];

  // Build audit
  const audit = {
    formula: `pocketDepth=${pocketDepth}, split by maxStepdown, finish=SKIM_LAST_ONLY`,
    zList,
    totalPasses: roughPasses.length + finishPasses.length,
    generatedAt: new Date().toISOString(),
  };

  return {
    version: "1.0",
    opId,
    stages: {
      rough: roughPasses,
      finish: finishPasses,
      through: undefined,
    },
    context,
    toolLimits: { rough: roughTool, finish: finishTool },
    finishMode: { ...finishMode, mode: "SKIM_LAST_ONLY" },
    audit,
  };
}

/**
 * Build Z plan for a GROOVE operation.
 *
 * Grooves are typically single-depth with no through.
 *
 * @param req Z plan request
 * @returns Complete Z plan
 */
export function buildGrooveZPlan(req: ZPlanRequest): ZPlan {
  const {
    opId,
    context,
    roughTool,
    finishTool,
    finishMode = DEFAULT_FINISH_MODE,
  } = req;

  // Groove depth
  const grooveDepth = round3(-context.cutDepthMm);

  // Generate rough passes
  const roughPasses = splitDepth(
    context.topZ,
    grooveDepth,
    roughTool.maxStepdownMm,
    "ROUGH"
  );

  // Grooves typically don't need finish passes (tool-width cut)
  // But if requested, add a skim pass
  const finishPasses =
    finishMode.mode === "EACH_STEP"
      ? generateFinishPasses(context.topZ, grooveDepth, finishTool, finishMode)
      : [];

  // Build Z list for audit
  const zList = [
    ...roughPasses.map((p) => p.zBottom),
    ...finishPasses.map((p) => p.zBottom),
  ];

  // Build audit
  const audit = {
    formula: `grooveDepth=${grooveDepth}, split by maxStepdown`,
    zList,
    totalPasses: roughPasses.length + finishPasses.length,
    generatedAt: new Date().toISOString(),
  };

  return {
    version: "1.0",
    opId,
    stages: {
      rough: roughPasses,
      finish: finishPasses,
      through: undefined,
    },
    context,
    toolLimits: { rough: roughTool, finish: finishTool },
    finishMode,
    audit,
  };
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Estimate total cutting time for Z plan.
 *
 * @param plan Z plan
 * @param feedRateMmPerMin Feed rate in mm/min
 * @param pathLengthMm Path length per pass in mm
 * @returns Estimated time in seconds
 */
export function estimateZPlanTime(
  plan: ZPlan,
  feedRateMmPerMin: number,
  pathLengthMm: number
): number {
  let totalTime = 0;

  for (const pass of [...plan.stages.rough, ...plan.stages.finish, ...(plan.stages.through ?? [])]) {
    const feedMultiplier = pass.feedMultiplier ?? 1.0;
    const effectiveFeed = feedRateMmPerMin * feedMultiplier;
    const passTime = (pathLengthMm / effectiveFeed) * 60; // Convert to seconds
    totalTime += passTime;
  }

  return round3(totalTime);
}

/**
 * Generate Z plan summary for display.
 */
export function generateZPlanSummary(plan: ZPlan): Record<string, unknown> {
  return {
    opId: plan.opId,
    roughPasses: plan.stages.rough.length,
    finishPasses: plan.stages.finish.length,
    throughPasses: plan.stages.through?.length ?? 0,
    totalPasses: plan.audit.totalPasses,
    zOnion: plan.audit.zOnion,
    zThrough: plan.audit.zThrough,
    finishMode: plan.finishMode.mode,
    deepestZ: Math.min(...plan.audit.zList),
  };
}
