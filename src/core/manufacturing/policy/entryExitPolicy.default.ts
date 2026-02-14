// src/core/manufacturing/policy/entryExitPolicy.default.ts
/**
 * Default Entry/Exit Strategy Policy Implementation.
 *
 * Deterministic rules for material-aware entry/exit:
 *
 * A) Laminate (HPL/Melamine/Veneer) - "anti chip-out"
 *    - Finish pass: RAMP_ARC (micro-lead arc) if supportsArc
 *    - Rough pass: RAMP_LINE (short, reduces time)
 *    - Open span re-entry: micro RAMP_LINE (no edge plunge)
 *
 * B) Core-only (MDF/HMR/Plywood)
 *    - Rough: RAMP_LINE (longer)
 *    - Finish: RAMP_LINE or RAMP_ARC (optional)
 *
 * C) Tool overrides
 *    - COMPRESSION: aggressive ramp (stable surface)
 *    - DOWNCUT: slower ramp (chip packing risk)
 *    - UPCUT + laminate top: reduced plungeFeed (tear-out risk)
 *
 * D) Exit
 *    - Finish pass: LEAD_OUT (short)
 *    - Open span: NONE + exitLift
 *
 * v0.10.6.6 - Entry/Exit Strategy per Material
 */

import {
  EntryExitPolicy,
  EntryExitContext,
  EntryExitDecision,
  EntryExitTuning,
  EntryMode,
  ExitMode,
  MaterialSpec,
  hasLaminateSurface,
  DEFAULT_ENTRY_EXIT_TUNING,
} from "./entryExitPolicy.v1";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum plunge feed for laminates (mm/min) */
const MAX_LAMINATE_PLUNGE_FEED = 1200;

/** Maximum plunge feed for core materials (mm/min) */
const MAX_CORE_PLUNGE_FEED = 2000;

/** Feed reduction factor for downcut tools */
const DOWNCUT_FEED_FACTOR = 0.85;

/** Feed reduction factor for upcut tools on laminate */
const UPCUT_LAMINATE_FACTOR = 0.8;

/** Feed boost factor for compression tools */
const COMPRESSION_FEED_FACTOR = 1.05;

// =============================================================================
// DEFAULT POLICY
// =============================================================================

/**
 * Default entry/exit policy with material-aware rules.
 */
export class DefaultEntryExitPolicy implements EntryExitPolicy {
  readonly version = "1.0";
  readonly name = "DefaultEntryExitPolicy";

  /**
   * Make entry/exit decision for given context.
   */
  decide(ctx: EntryExitContext): EntryExitDecision {
    const lam = hasLaminateSurface(ctx.material);
    const codes: string[] = [];
    const warnings: string[] = [];

    // Calculate base feeds
    let plungeFeed = lam ? 800 : 1200;
    let cutFeed = lam ? 4500 : 6000;

    // Apply tool adjustments
    const toolAdjustment = this.applyToolAdjustments(
      ctx.toolClass,
      lam,
      ctx.material.surfaceA,
      plungeFeed,
      cutFeed,
      codes,
      warnings
    );
    plungeFeed = toolAdjustment.plungeFeed;
    cutFeed = toolAdjustment.cutFeed;

    // Clamp to machine limits if specified
    if (ctx.machine.maxPlungeFeed) {
      plungeFeed = Math.min(plungeFeed, ctx.machine.maxPlungeFeed);
    }

    // Build base tuning
    const baseTuning: EntryExitTuning = {
      leadLenMm: lam ? 8 : 15,
      leadArcRadMm: lam ? 6 : 10,
      rampAngleDeg: lam ? 2.5 : 3.5,
      rampMaxLenMm: lam ? 25 : 40,
      plungeFeed,
      cutFeed,
      exitLiftMm: lam ? 0.6 : 0.4,
    };

    // Route to specific strategy
    if (ctx.geometry.isOpenSpan) {
      return this.decideOpenSpan(ctx, baseTuning, codes, warnings);
    }

    return this.decideClosedLoop(ctx, baseTuning, lam, codes, warnings);
  }

  /**
   * Apply tool-specific feed adjustments.
   */
  private applyToolAdjustments(
    toolClass: string,
    hasLaminate: boolean,
    surfaceA: string | undefined,
    plungeFeed: number,
    cutFeed: number,
    codes: string[],
    warnings: string[]
  ): { plungeFeed: number; cutFeed: number } {
    switch (toolClass) {
      case "DOWNCUT":
        // Downcut: risk of chip packing, reduce feeds
        plungeFeed *= DOWNCUT_FEED_FACTOR;
        cutFeed *= 0.95;
        codes.push("TOOL_DOWNCUT_PACKING");
        break;

      case "UPCUT":
        // Upcut + laminate on top: tear-out risk
        if (hasLaminate && (surfaceA === "HPL" || surfaceA === "MELAMINE" || surfaceA === "VENEER")) {
          plungeFeed *= UPCUT_LAMINATE_FACTOR;
          codes.push("UPCUT_TOP_TEAROUT_RISK");
          warnings.push("Upcut tool with laminate top - reduced plunge feed");
        }
        break;

      case "COMPRESSION":
        // Compression: stable on both surfaces, can be more aggressive
        plungeFeed *= COMPRESSION_FEED_FACTOR;
        cutFeed *= COMPRESSION_FEED_FACTOR;
        codes.push("COMPRESSION_TOOL_STABLE");
        break;

      case "STRAIGHT":
        // Straight flute: conservative
        codes.push("STRAIGHT_FLUTE_CONSERVATIVE");
        break;

      default:
        // Unknown tool: use base values
        codes.push("UNKNOWN_TOOL_DEFAULT");
        break;
    }

    return { plungeFeed, cutFeed };
  }

  /**
   * Decide strategy for open span (tabs mode re-entry).
   *
   * Open spans need micro lead-in after rapid across gap.
   * Use RAMP_LINE for predictable behavior at arbitrary points.
   */
  private decideOpenSpan(
    ctx: EntryExitContext,
    baseTuning: EntryExitTuning,
    codes: string[],
    warnings: string[]
  ): EntryExitDecision {
    const lam = hasLaminateSurface(ctx.material);
    codes.push("OPEN_SPAN_REENTRY");

    // Micro lead for re-entry
    const tuning: EntryExitTuning = {
      ...baseTuning,
      leadLenMm: lam ? 5 : 10,
      rampMaxLenMm: lam ? 18 : 30,
      plungeFeed: baseTuning.plungeFeed * 0.9, // Slightly slower for re-entry
    };

    // Always use RAMP_LINE for open spans (more predictable)
    const entryMode: EntryMode = "RAMP_LINE";

    // Open span exit: no lead-out, just lift
    const exitMode: ExitMode = "NONE";

    return {
      entry: { mode: entryMode, tuning },
      exit: {
        mode: exitMode,
        tuning: { leadLenMm: 0, exitLiftMm: tuning.exitLiftMm },
      },
      reasonCodes: codes,
      confidence: "HIGH",
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Decide strategy for closed loop (standard profile).
   */
  private decideClosedLoop(
    ctx: EntryExitContext,
    baseTuning: EntryExitTuning,
    hasLaminate: boolean,
    codes: string[],
    warnings: string[]
  ): EntryExitDecision {
    let entryMode: EntryMode;
    let exitMode: ExitMode;

    // Laminate + finish + arc support = RAMP_ARC
    if (
      hasLaminate &&
      ctx.pass === "FINISH" &&
      ctx.machine.supportsArc
    ) {
      entryMode = "RAMP_ARC";
      exitMode = "LEAD_OUT";
      codes.push("LAMINATE_FINISH_ARC_RAMP");
    }
    // Laminate + rough or no arc = RAMP_LINE
    else if (hasLaminate) {
      entryMode = "RAMP_LINE";
      exitMode = ctx.pass === "FINISH" ? "LEAD_OUT" : "NONE";
      codes.push("LAMINATE_RAMP_LINE");
    }
    // Core material + finish = RAMP_LINE with lead-out
    else if (ctx.pass === "FINISH") {
      entryMode = "RAMP_LINE";
      exitMode = "LEAD_OUT";
      codes.push("CORE_FINISH_RAMP_LINE");
    }
    // Core material + rough = RAMP_LINE, no lead-out
    else {
      entryMode = "RAMP_LINE";
      exitMode = "NONE";
      codes.push("CORE_ROUGH_RAMP_LINE");
    }

    return {
      entry: { mode: entryMode, tuning: baseTuning },
      exit: {
        mode: exitMode,
        tuning: {
          leadLenMm: baseTuning.leadLenMm,
          exitLiftMm: baseTuning.exitLiftMm,
        },
      },
      reasonCodes: codes,
      confidence: "HIGH",
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Check if policy supports given material.
   */
  supportsMaterial(material: MaterialSpec): boolean {
    const supportedCores = [
      "MDF",
      "HMR",
      "HPL",
      "MELAMINE",
      "PLYWOOD",
      "SOLID_WOOD",
      "PARTICLE",
    ];
    return supportedCores.includes(material.core);
  }

  /**
   * Get default entry mode for unknown contexts.
   */
  getDefaultEntryMode(): EntryMode {
    return "RAMP_LINE";
  }
}

// =============================================================================
// CONSERVATIVE POLICY
// =============================================================================

/**
 * Conservative entry/exit policy for safe operations.
 *
 * Always uses slow plunge with minimal leads.
 * Use when:
 * - Unknown material
 * - Testing new setups
 * - Machine not calibrated for ramping
 */
export class ConservativeEntryExitPolicy implements EntryExitPolicy {
  readonly version = "1.0";
  readonly name = "ConservativeEntryExitPolicy";

  decide(ctx: EntryExitContext): EntryExitDecision {
    const tuning: EntryExitTuning = {
      ...DEFAULT_ENTRY_EXIT_TUNING,
      plungeFeed: 600, // Very slow
      leadLenMm: 5,
      rampAngleDeg: 2.0,
      rampMaxLenMm: 15,
    };

    return {
      entry: { mode: "PLUNGE_SOFT", tuning },
      exit: {
        mode: "NONE",
        tuning: { leadLenMm: 0, exitLiftMm: tuning.exitLiftMm },
      },
      reasonCodes: ["CONSERVATIVE_PLUNGE_SOFT"],
      confidence: "HIGH",
    };
  }

  supportsMaterial(_material: MaterialSpec): boolean {
    return true; // Supports all materials conservatively
  }

  getDefaultEntryMode(): EntryMode {
    return "PLUNGE_SOFT";
  }
}

// =============================================================================
// SINGLETON INSTANCES
// =============================================================================

/**
 * Default entry/exit policy instance.
 */
export const defaultEntryExitPolicy = new DefaultEntryExitPolicy();

/**
 * Conservative entry/exit policy instance.
 */
export const conservativeEntryExitPolicy = new ConservativeEntryExitPolicy();

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate entry/exit decision for gate checks.
 *
 * @param decision Decision to validate
 * @param ctx Original context
 * @returns Array of issues
 */
export function validateEntryExitDecision(
  decision: EntryExitDecision,
  ctx: EntryExitContext
): Array<{ code: string; severity: "BLOCK" | "WARN" | "INFO"; message: string }> {
  const issues: Array<{ code: string; severity: "BLOCK" | "WARN" | "INFO"; message: string }> = [];

  // Check plunge feed for laminates
  if (
    hasLaminateSurface(ctx.material) &&
    ctx.pass === "FINISH" &&
    decision.entry.tuning.plungeFeed > MAX_LAMINATE_PLUNGE_FEED
  ) {
    issues.push({
      code: "ENTRY_FEED_TOO_HIGH_FOR_LAMINATE",
      severity: "WARN",
      message: `Plunge feed ${decision.entry.tuning.plungeFeed} exceeds recommended ${MAX_LAMINATE_PLUNGE_FEED} for laminate finish`,
    });
  }

  // Check ramp angle
  if (decision.entry.tuning.rampAngleDeg > 5) {
    issues.push({
      code: "RAMP_ANGLE_TOO_STEEP",
      severity: "WARN",
      message: `Ramp angle ${decision.entry.tuning.rampAngleDeg}° is steep - consider reducing`,
    });
  }

  // Check machine limits
  if (
    ctx.machine.maxPlungeFeed &&
    decision.entry.tuning.plungeFeed > ctx.machine.maxPlungeFeed
  ) {
    issues.push({
      code: "PLUNGE_FEED_EXCEEDS_LIMIT",
      severity: "BLOCK",
      message: `Plunge feed ${decision.entry.tuning.plungeFeed} exceeds machine limit ${ctx.machine.maxPlungeFeed}`,
    });
  }

  return issues;
}
