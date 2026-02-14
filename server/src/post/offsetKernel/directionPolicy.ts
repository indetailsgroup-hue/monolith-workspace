/**
 * Climb / Conventional Policy Engine
 *
 * Step 10.6.4: Material-aware, deterministic cut direction decisions.
 *
 * This module determines the milling direction (CLIMB/CONVENTIONAL) and
 * corresponding loop winding (CW/CCW) based on:
 * - Cut intent (OUTSIDE/INSIDE)
 * - Loop role (PERIMETER/HOLE)
 * - Material type (HPL, Melamine, Plywood, etc.)
 * - Tool class (Compression, Downcut, Upcut, etc.)
 * - Machine preferences
 *
 * Convention (Standard CNC Router):
 * - Spindle: CW (clockwise from above)
 * - Coordinate: +Z up
 * - CLIMB milling:
 *   - OUTSIDE contour: CW
 *   - INSIDE contour: CCW
 * - CONVENTIONAL milling: opposite
 *
 * All decisions are deterministic with stable fingerprints for Gate audit.
 */

import type { LoopInfo, CutSidePlan, Winding } from './cutSidePlan.js';
import { normalizeLoopWinding } from './cutSidePlan.js';

// ============================================================================
// Types
// ============================================================================

/** Material classification for CNC routing */
export type MaterialKind =
  | 'HPL'           // High Pressure Laminate
  | 'MELAMINE'      // Melamine-faced board
  | 'PLYWOOD'       // Plywood (birch, marine, etc.)
  | 'MDF'           // Medium Density Fiberboard
  | 'PARTICLE'      // Particleboard
  | 'SOLID_WOOD'    // Solid wood
  | 'ACRYLIC'       // Acrylic/Plastic
  | 'ALUMINUM'      // Aluminum (light machining)
  | 'OTHER';        // Generic/unknown

/** Tool geometry classification */
export type ToolKind =
  | 'COMPRESSION'   // Compression spiral (best for laminates)
  | 'DOWNCUT'       // Downcut spiral (clean top surface)
  | 'UPCUT'         // Upcut spiral (good chip evacuation)
  | 'O_FLUTE'       // O-flute (plastics, aluminum)
  | 'STRAIGHT'      // Straight flute (general purpose)
  | 'BALL_NOSE'     // Ball nose (3D surfacing)
  | 'V_BIT';        // V-bit (engraving, chamfers)

/** Cut intent */
export type CutIntent = 'OUTSIDE' | 'INSIDE';

/** Loop role in machining */
export type LoopRole = 'PERIMETER' | 'HOLE';

/** Milling direction mode */
export type MillingMode = 'CLIMB' | 'CONVENTIONAL';

/**
 * Decision output for cut direction.
 */
export interface CutDirectionDecision {
  /** Chosen milling mode */
  milling: MillingMode;
  /** Desired winding for the loop */
  desiredWinding: Winding;
  /** Stable reason code for audit */
  reasonCode: string;
  /** Human-readable explanation */
  detail: string;
  /** Stable fingerprint for Gate deduplication */
  fingerprint: string;
}

/**
 * Configuration for direction policy engine.
 */
export interface DirectionPolicyConfig {
  /** Machine baseline milling preference */
  defaultMilling: MillingMode;
  /** Prefer climb for finish cuts (usually true) */
  preferClimbForFinish: boolean;
  /** Area threshold for small part stability override (mm²) */
  smallPartAreaMm2: number;
  /** Thin web threshold for stability override (mm) */
  thinWebMm?: number;
  /** Force conventional for all cuts (safety mode) */
  forceConventional?: boolean;
}

/**
 * Loop with applied direction decision.
 */
export interface DirectionAppliedLoop {
  /** Loop with normalized winding */
  loop: LoopInfo;
  /** Direction decision that was applied */
  decision: CutDirectionDecision;
}

/**
 * Report item for direction policy.
 */
export interface DirectionReportItem {
  /** Issue code */
  code: string;
  /** Human-readable detail */
  detail: string;
  /** Stable fingerprint */
  fingerprint: string;
  /** Severity level */
  severity: 'INFO' | 'WARN' | 'BLOCK';
}

/**
 * Result of applying direction policy to a plan.
 */
export interface DirectionAppliedPlan {
  /** Perimeters with direction applied */
  perimeter: DirectionAppliedLoop[];
  /** Holes with direction applied */
  holes: DirectionAppliedLoop[];
  /** Processing report */
  report: DirectionReportItem[];
  /** Whether plan is valid */
  valid: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Default configuration */
export const DEFAULT_DIRECTION_CONFIG: DirectionPolicyConfig = {
  defaultMilling: 'CLIMB',
  preferClimbForFinish: true,
  smallPartAreaMm2: 100, // 10mm x 10mm
  thinWebMm: 3,
};

// Reason codes (stable for audit)
export const REASON_CODES = {
  SMALL_PART_STABILITY: 'RULE_SMALL_PART_STABILITY',
  HPL_EDGE_QUALITY: 'RULE_HPL_EDGE_QUALITY',
  MELAMINE_CHIPOUT_CONTROL: 'RULE_MELAMINE_CHIPOUT_CONTROL',
  PLYWOOD_GENERAL: 'RULE_PLYWOOD_GENERAL',
  MDF_GENERAL: 'RULE_MDF_GENERAL',
  COMPRESSION_DEFAULT_CLIMB: 'RULE_COMPRESSION_DEFAULT_CLIMB',
  DOWNCUT_TOP_SURFACE: 'RULE_DOWNCUT_TOP_SURFACE',
  UPCUT_CHIP_EVACUATION: 'RULE_UPCUT_CHIP_EVACUATION',
  ACRYLIC_HEAT_CONTROL: 'RULE_ACRYLIC_HEAT_CONTROL',
  FORCE_CONVENTIONAL: 'RULE_FORCE_CONVENTIONAL',
  FALLBACK_DEFAULT: 'RULE_FALLBACK_DEFAULT',
} as const;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Map milling mode to desired winding based on cut intent.
 *
 * Convention (standard CNC router, spindle CW, +Z up):
 * - CLIMB + OUTSIDE = CW
 * - CLIMB + INSIDE = CCW
 * - CONVENTIONAL + OUTSIDE = CCW
 * - CONVENTIONAL + INSIDE = CW
 *
 * @param milling - Milling mode (CLIMB/CONVENTIONAL)
 * @param intent - Cut intent (OUTSIDE/INSIDE)
 * @returns Desired winding (CW/CCW)
 */
export function windingForMilling(milling: MillingMode, intent: CutIntent): Winding {
  if (milling === 'CLIMB') {
    return intent === 'OUTSIDE' ? 'CW' : 'CCW';
  }
  // CONVENTIONAL
  return intent === 'OUTSIDE' ? 'CCW' : 'CW';
}

/**
 * Generate stable fingerprint for a decision.
 */
function generateDecisionFingerprint(
  milling: MillingMode,
  winding: Winding,
  reasonCode: string
): string {
  return `${milling}|${winding}|${reasonCode}`;
}

/**
 * Create a decision object with fingerprint.
 */
function makeDecision(
  milling: MillingMode,
  intent: CutIntent,
  reasonCode: string,
  detail: string
): CutDirectionDecision {
  const desiredWinding = windingForMilling(milling, intent);
  return {
    milling,
    desiredWinding,
    reasonCode,
    detail,
    fingerprint: generateDecisionFingerprint(milling, desiredWinding, reasonCode),
  };
}

// ============================================================================
// Decision Engine
// ============================================================================

/**
 * Decide cut direction based on material, tool, intent, and configuration.
 *
 * Rule ladder (deterministic priority):
 * 1. Force conventional override (safety mode)
 * 2. Small part stability override
 * 3. Material-specific surface protection rules
 * 4. Tool-specific rules
 * 5. Machine default fallback
 *
 * @param material - Material being cut
 * @param tool - Tool being used
 * @param intent - Cut intent (OUTSIDE/INSIDE)
 * @param role - Loop role (PERIMETER/HOLE)
 * @param loopAreaMm2 - Loop area in mm² (for small part detection)
 * @param config - Policy configuration
 * @returns Cut direction decision
 */
export function decideCutDirection(
  material: MaterialKind,
  tool: ToolKind,
  intent: CutIntent,
  role: LoopRole,
  loopAreaMm2: number,
  config: DirectionPolicyConfig
): CutDirectionDecision {
  // Normalize role to effective intent
  // HOLE implies INSIDE unless explicitly overridden upstream
  const effIntent: CutIntent = role === 'HOLE' ? 'INSIDE' : intent;

  // Rule 0: Force conventional override (safety mode)
  if (config.forceConventional) {
    return makeDecision(
      'CONVENTIONAL',
      effIntent,
      REASON_CODES.FORCE_CONVENTIONAL,
      'Force conventional mode enabled for safety.'
    );
  }

  // Rule 1: Small part stability override
  if (loopAreaMm2 > 0 && loopAreaMm2 < config.smallPartAreaMm2) {
    return makeDecision(
      'CONVENTIONAL',
      effIntent,
      REASON_CODES.SMALL_PART_STABILITY,
      `Small loop area ${loopAreaMm2.toFixed(1)}mm² < threshold ${config.smallPartAreaMm2}mm²; prefer CONVENTIONAL for stability.`
    );
  }

  // Rule 2: Material-specific surface protection rules
  switch (material) {
    case 'HPL':
      // HPL is chip-out sensitive; prefer climb for finish edges
      return makeDecision(
        config.preferClimbForFinish ? 'CLIMB' : config.defaultMilling,
        effIntent,
        REASON_CODES.HPL_EDGE_QUALITY,
        `HPL: prefer ${config.preferClimbForFinish ? 'CLIMB' : config.defaultMilling} for edge quality.`
      );

    case 'MELAMINE':
      // Melamine chips easily; climb generally better with compression/downcut
      return makeDecision(
        'CLIMB',
        effIntent,
        REASON_CODES.MELAMINE_CHIPOUT_CONTROL,
        'Melamine: default CLIMB to reduce chip-out.'
      );

    case 'ACRYLIC':
      // Acrylic needs careful heat management; climb can cause melting
      return makeDecision(
        'CONVENTIONAL',
        effIntent,
        REASON_CODES.ACRYLIC_HEAT_CONTROL,
        'Acrylic: prefer CONVENTIONAL to reduce heat buildup and melting.'
      );

    default:
      // Continue to tool-based rules
      break;
  }

  // Rule 3: Tool-specific rules (for non-laminate materials)
  switch (tool) {
    case 'COMPRESSION':
      // Compression bits work best with climb for balanced top/bottom finish
      return makeDecision(
        'CLIMB',
        effIntent,
        REASON_CODES.COMPRESSION_DEFAULT_CLIMB,
        'Compression bit: default CLIMB for balanced top/bottom finish.'
      );

    case 'DOWNCUT':
      // Downcut pushes chips down; climb for clean top surface
      return makeDecision(
        'CLIMB',
        effIntent,
        REASON_CODES.DOWNCUT_TOP_SURFACE,
        'Downcut bit: prefer CLIMB for clean top surface.'
      );

    case 'UPCUT':
      // Upcut evacuates chips well; climb still typical for edge quality
      return makeDecision(
        'CLIMB',
        effIntent,
        REASON_CODES.UPCUT_CHIP_EVACUATION,
        'Upcut bit: prefer CLIMB; good chip evacuation.'
      );

    default:
      // Continue to material-based fallback
      break;
  }

  // Rule 4: General material rules
  switch (material) {
    case 'PLYWOOD':
      return makeDecision(
        config.defaultMilling,
        effIntent,
        REASON_CODES.PLYWOOD_GENERAL,
        `Plywood: use machine default milling = ${config.defaultMilling}.`
      );

    case 'MDF':
      return makeDecision(
        config.defaultMilling,
        effIntent,
        REASON_CODES.MDF_GENERAL,
        `MDF: use machine default milling = ${config.defaultMilling}.`
      );

    case 'PARTICLE':
    case 'SOLID_WOOD':
    case 'ALUMINUM':
    case 'OTHER':
      return makeDecision(
        config.defaultMilling,
        effIntent,
        REASON_CODES.FALLBACK_DEFAULT,
        `${material}: fallback to machine default milling = ${config.defaultMilling}.`
      );
  }

  // Final fallback
  return makeDecision(
    config.defaultMilling,
    effIntent,
    REASON_CODES.FALLBACK_DEFAULT,
    `Fallback to machine default milling = ${config.defaultMilling}.`
  );
}

// ============================================================================
// Plan Integration
// ============================================================================

/**
 * Apply direction policy to a cut side plan.
 *
 * For each loop:
 * 1. Decide cut direction based on material, tool, role
 * 2. Normalize winding to match decision
 * 3. Record decision in audit report
 *
 * @param plan - Cut side plan from 10.6.3
 * @param material - Material being cut
 * @param tool - Tool being used
 * @param config - Direction policy configuration
 * @returns Plan with direction decisions applied
 */
export function applyDirectionPolicyToPlan(
  plan: CutSidePlan,
  material: MaterialKind,
  tool: ToolKind,
  config: DirectionPolicyConfig = DEFAULT_DIRECTION_CONFIG
): DirectionAppliedPlan {
  const report: DirectionReportItem[] = [];
  let valid = true;

  // Helper to apply direction to a single loop
  function applyToLoop(
    loop: LoopInfo,
    role: LoopRole,
    intent: CutIntent
  ): DirectionAppliedLoop {
    const decision = decideCutDirection(
      material,
      tool,
      intent,
      role,
      loop.areaAbs,
      config
    );

    // Normalize winding to desired
    let normalizedLoop = loop;
    if (loop.winding !== decision.desiredWinding) {
      normalizedLoop = normalizeLoopWinding(loop, decision.desiredWinding);

      // Safety check: if normalization failed
      if (normalizedLoop.winding !== decision.desiredWinding) {
        report.push({
          code: 'WINDING_NORMALIZE_FAILED',
          detail: `Loop ${loop.id}: failed to normalize winding to ${decision.desiredWinding}`,
          fingerprint: `10.6.4:WINDING_FAIL:${loop.id}`,
          severity: 'BLOCK',
        });
        valid = false;
      }
    }

    // Record decision in audit
    report.push({
      code: 'DIRECTION_DECISION',
      detail: `Loop ${loop.id} role=${role} intent=${intent} milling=${decision.milling} winding=${decision.desiredWinding} reason=${decision.reasonCode}`,
      fingerprint: `10.6.4:DECISION:${loop.id}:${decision.fingerprint}`,
      severity: 'INFO',
    });

    return { loop: normalizedLoop, decision };
  }

  // Apply to perimeters (OUTSIDE intent)
  const perimeter = plan.perimeter.map((loop) =>
    applyToLoop(loop, 'PERIMETER', 'OUTSIDE')
  );

  // Apply to holes (INSIDE intent)
  const holes = plan.holes.map((loop) =>
    applyToLoop(loop, 'HOLE', 'INSIDE')
  );

  // Summary report
  report.push({
    code: 'DIRECTION_POLICY_COMPLETE',
    detail: `Applied direction policy: ${perimeter.length} perimeter(s), ${holes.length} hole(s)`,
    fingerprint: `10.6.4:COMPLETE:${perimeter.length}:${holes.length}`,
    severity: 'INFO',
  });

  return { perimeter, holes, report, valid };
}

// ============================================================================
// Safety Checks
// ============================================================================

/**
 * Perform safety checks on direction decisions.
 *
 * Checks:
 * - Tool/material compatibility warnings
 * - Risky combinations that may cause chip-out
 *
 * @param material - Material being cut
 * @param tool - Tool being used
 * @param applied - Applied direction plan
 * @returns Safety check result
 */
export function directionSafetyChecks(
  material: MaterialKind,
  tool: ToolKind,
  _applied: DirectionAppliedPlan
): { severity: 'OK' | 'WARN' | 'BLOCK'; issues: DirectionReportItem[] } {
  const issues: DirectionReportItem[] = [];

  // Check: HPL/Melamine with upcut or straight bit on perimeter
  if (
    (material === 'HPL' || material === 'MELAMINE') &&
    (tool === 'UPCUT' || tool === 'STRAIGHT')
  ) {
    issues.push({
      code: 'TOOL_MATERIAL_CHIPOUT_RISK',
      detail: `Tool ${tool} on ${material} perimeter is chip-out risky; prefer COMPRESSION or DOWNCUT.`,
      fingerprint: `10.6.4:CHIPOUT_RISK:${material}:${tool}`,
      severity: 'WARN',
    });
  }

  // Check: Acrylic with high-speed upcut (melting risk)
  if (material === 'ACRYLIC' && tool === 'UPCUT') {
    issues.push({
      code: 'TOOL_MATERIAL_HEAT_RISK',
      detail: `Tool ${tool} on ${material} may cause melting; consider O_FLUTE or reduce speed.`,
      fingerprint: `10.6.4:HEAT_RISK:${material}:${tool}`,
      severity: 'WARN',
    });
  }

  // Determine overall severity
  const hasBlock = issues.some((i) => i.severity === 'BLOCK');
  const hasWarn = issues.some((i) => i.severity === 'WARN');

  return {
    severity: hasBlock ? 'BLOCK' : hasWarn ? 'WARN' : 'OK',
    issues,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick decision for HPL with compression bit (common cabinet case).
 */
export function decideForHPLCompression(
  intent: CutIntent,
  role: LoopRole,
  loopAreaMm2: number
): CutDirectionDecision {
  return decideCutDirection(
    'HPL',
    'COMPRESSION',
    intent,
    role,
    loopAreaMm2,
    DEFAULT_DIRECTION_CONFIG
  );
}

/**
 * Quick decision for melamine with compression bit.
 */
export function decideForMelamineCompression(
  intent: CutIntent,
  role: LoopRole,
  loopAreaMm2: number
): CutDirectionDecision {
  return decideCutDirection(
    'MELAMINE',
    'COMPRESSION',
    intent,
    role,
    loopAreaMm2,
    DEFAULT_DIRECTION_CONFIG
  );
}

/**
 * Quick decision for plywood with downcut bit.
 */
export function decideForPlywoodDowncut(
  intent: CutIntent,
  role: LoopRole,
  loopAreaMm2: number
): CutDirectionDecision {
  return decideCutDirection(
    'PLYWOOD',
    'DOWNCUT',
    intent,
    role,
    loopAreaMm2,
    DEFAULT_DIRECTION_CONFIG
  );
}

/**
 * Get all blocking issues from an applied plan.
 */
export function getDirectionBlockingIssues(
  plan: DirectionAppliedPlan
): DirectionReportItem[] {
  return plan.report.filter((r) => r.severity === 'BLOCK');
}

/**
 * Check if applied plan is valid for machining.
 */
export function isDirectionPlanValid(plan: DirectionAppliedPlan): boolean {
  return plan.valid && getDirectionBlockingIssues(plan).length === 0;
}
