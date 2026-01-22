/**
 * decideDrillParams.ts - Drill Policy Decision Helper
 *
 * Centralized helper for deciding drill parameters using the policy engine.
 * Called by dialect emitters to get G81/G82/G83 selection and feed/speed.
 *
 * @version 1.3.0 - Phase D5-C.1B: Added feed-down near exit
 */

import {
  CONSERVATIVE_DRILL_POLICY,
  DEFAULT_DRILL_TUNING,
  getEffectivePeckDepth,
} from '../policy';
import type {
  DrillPolicy,
  DrillParameters,
  HoleSpec,
  MaterialClass,
  DrillTuningOptions,
} from '../policy';
import type { MachineProfile, ToolCapability } from '../machine/machineProfile';
import { getTool } from '../machine/machineProfile';
import type { Operation, DrillOperation, BoreOperation } from '../operation/operationTypes';
import { isDrillOperation, isBoreOperation } from '../operation/operationTypes';
import type { CncPolicyOptions, ThroughHoleSensitiveMaterial, ThroughHoleTuning } from './types';

// ============================================
// TYPES
// ============================================

/**
 * Input for deciding drill parameters.
 */
export interface DecideDrillParamsInput {
  /** Operation to process */
  op: Operation;
  /** Machine profile for tool lookup */
  machine: MachineProfile;
  /** Policy options (optional - uses conservative defaults) */
  policyOptions?: CncPolicyOptions;
  /** Panel thickness if known (for through-hole detection) */
  panelThickness?: number;
}

/**
 * Through-hole decision result.
 * @since D5-C.1A
 * @since D5-C.1B: Added feed-down near exit fields
 */
export interface ThroughHoleDecision {
  /** Whether this is detected as a through-hole */
  isThroughHole: boolean;
  /** Resolved panel thickness (mm) */
  panelThicknessMm: number;
  /** Whether thickness came from panelFrames (true) or fallback (false) */
  thicknessResolved: boolean;
  /** Extra dwell time (seconds) for breakout mitigation, 0 if none */
  exitDwellSec: number;
  /** Whether material is sensitive to through-hole breakout */
  isSensitiveMaterial: boolean;

  // D5-C.1B: Feed-down near exit
  /** Feed reduction percentage in exit zone (0-50), 0 if none */
  exitFeedReductionPercent: number;
  /** Depth of exit zone in mm (from panel bottom), 0 if none */
  exitZoneDepthMm: number;
  /** Depth where exit zone starts (from panel top), 0 if none */
  exitZoneStartMm: number;
  /** Calculated exit feed rate in mm/min, 0 if no reduction */
  exitFeedRateMmMin: number;
}

/**
 * Result of drill parameter decision.
 */
export interface DecideDrillParamsResult {
  /** Resolved drill parameters */
  params: DrillParameters;
  /** Resolved hole spec used for decision */
  holeSpec: HoleSpec;
  /** Resolved material class */
  materialClass: MaterialClass;
  /** Resolved tool info (if found) */
  tool?: ToolCapability;
  /** Resolved tuning options @since D5-C.0 */
  tuning: Required<DrillTuningOptions>;
  /** Effective peck depth (adjusted for tuning) @since D5-C.0 */
  effectivePeckDepth?: number;
  /** Through-hole decision for breakout mitigation @since D5-C.1A */
  throughHole: ThroughHoleDecision;
  /** Warnings generated during resolution */
  warnings: string[];
}

// ============================================
// MAIN DECISION FUNCTION
// ============================================

/**
 * Decide drill parameters for an operation using the policy engine.
 *
 * @param input - Operation, machine, and policy options
 * @returns Drill parameters with resolved specs and warnings
 */
export function decideDrillParams(input: DecideDrillParamsInput): DecideDrillParamsResult {
  const { op, machine, policyOptions } = input;
  const warnings: string[] = [];

  // Resolve policy (default to conservative)
  const policy: DrillPolicy = policyOptions?.drillPolicy ?? CONSERVATIVE_DRILL_POLICY;

  // Resolve tool
  const tool = getTool(machine, op.toolId);
  if (!tool) {
    warnings.push(`Unknown tool ID: ${op.toolId}`);
  }

  // Resolve diameter
  const diameter = resolveDiameter(op, tool, warnings);

  // Resolve depth
  const depth = resolveDepth(op);

  // Resolve panel thickness (D5-C.1A: use panelFrames if available)
  const panelId = op.workpieceContext?.panelId;
  const { thicknessMm: panelThickness, resolved: thicknessResolved } = resolvePanelThickness(
    panelId,
    policyOptions
  );

  // Resolve material class
  const materialClass = resolveMaterialClass(op, policyOptions, warnings);

  // Build hole spec
  const holeSpec: HoleSpec = {
    diameter,
    depth,
    panelThickness,
    throughHole: isDrillOperation(op) ? op.throughHole : false,
  };

  // Get parameters from policy
  const params = policy.getParameters(holeSpec, { class: materialClass });

  // Resolve tuning options (D5-C.0)
  const tuning: Required<DrillTuningOptions> = {
    ...DEFAULT_DRILL_TUNING,
    ...policyOptions?.drillTuning,
  };

  // Calculate effective peck depth if G83 cycle
  let effectivePeckDepth: number | undefined;
  if (params.cycle === 'G83' && params.peckDepth) {
    effectivePeckDepth = getEffectivePeckDepth(depth, params.peckDepth, tuning);
  }

  // Through-hole detection and dwell decision (D5-C.1A + D5-C.1B)
  const throughHole = decideThroughHole(
    depth,
    panelThickness,
    thicknessResolved,
    materialClass,
    params.feedRate, // D5-C.1B: Pass base feed for exit feed calculation
    policyOptions?.throughHoleTuning
  );

  return {
    params,
    holeSpec,
    materialClass,
    tool,
    tuning,
    effectivePeckDepth,
    throughHole,
    warnings,
  };
}

// ============================================
// RESOLUTION HELPERS
// ============================================

/**
 * Resolve diameter from operation and tool.
 * Priority: BoreOperation.diameter > ToolCapability.diameter > inferred from toolId
 */
function resolveDiameter(
  op: Operation,
  tool: ToolCapability | undefined,
  warnings: string[]
): number {
  // BoreOperation has explicit diameter
  if (isBoreOperation(op)) {
    return op.diameter;
  }

  // DrillOperation - get from tool
  if (tool) {
    return tool.diameter;
  }

  // Fallback: infer from toolId naming convention
  const inferred = inferDiameterFromToolId(op.toolId);
  if (inferred !== 5) { // 5 is our default fallback
    warnings.push(`Inferred diameter ${inferred}mm from toolId ${op.toolId}`);
  }
  return inferred;
}

/**
 * Infer diameter from toolId naming convention.
 * Patterns: DRILL_5, DRILL_8, BORE_35, HINGE_35, etc.
 */
function inferDiameterFromToolId(toolId: string): number {
  const normalized = toolId.toUpperCase();

  // Check for common patterns
  if (normalized.includes('HINGE') || normalized.includes('35')) {
    return 35;
  }
  if (normalized.includes('CAM') || normalized.includes('15')) {
    return 15;
  }
  if (normalized.includes('DOWEL') || normalized.includes('8')) {
    return 8;
  }

  // Try to extract number from toolId
  const match = normalized.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    // Reasonable drill diameters are 2-50mm
    if (num >= 2 && num <= 50) {
      return num;
    }
  }

  // Default to 5mm (system hole)
  return 5;
}

/**
 * Resolve depth from operation.
 */
function resolveDepth(op: Operation): number {
  if (isDrillOperation(op) || isBoreOperation(op)) {
    return op.depth;
  }
  // Fallback for other operation types
  return 10;
}

/**
 * Resolve material class from operation context and policy options.
 */
function resolveMaterialClass(
  op: Operation,
  policyOptions: CncPolicyOptions | undefined,
  warnings: string[]
): MaterialClass {
  // Try to get from panel materials map
  const panelId = op.workpieceContext?.panelId;
  if (panelId && policyOptions?.panelMaterials) {
    const panelMaterial = policyOptions.panelMaterials.get(panelId);
    if (panelMaterial) {
      return panelMaterial.materialClass;
    }
  }

  // Try to get from material class map (if we have a materialId in the context)
  // This would require extending workpieceContext to include materialId

  // Fallback to default material class
  if (policyOptions?.defaultMaterialClass) {
    return policyOptions.defaultMaterialClass;
  }

  // Ultimate fallback: UNKNOWN (conservative parameters)
  return 'UNKNOWN';
}

// ============================================
// UTILITY EXPORTS
// ============================================

/**
 * Check if an operation is a drill/bore that can use the policy.
 */
export function isHoleOperation(op: Operation): op is DrillOperation | BoreOperation {
  return isDrillOperation(op) || isBoreOperation(op);
}

/**
 * Get default dwell time for G82 if not specified.
 */
export function getDefaultDwellTime(): number {
  return 0.3; // 300ms
}

/**
 * Calculate default peck depth for G83 if not specified.
 */
export function getDefaultPeckDepth(diameter: number): number {
  return Math.round(diameter * 1.5 * 10) / 10; // 1.5 * diameter, rounded to 0.1mm
}

// ============================================
// THROUGH-HOLE DETECTION (D5-C.1A)
// ============================================

/**
 * Default through-hole tuning values.
 * Conservative defaults for production safety.
 * @since D5-C.1B: Added feed-down near exit defaults
 */
export const DEFAULT_THROUGH_HOLE_TUNING: Required<ThroughHoleTuning> = {
  enabled: true,
  breakthroughAllowanceMm: 0.5,
  dwellSecByMaterial: {
    HPL: 0.15,
    PLYWOOD: 0.15,
    MELAMINE: 0.10,
  },
  // D5-C.1B: Feed-down near exit
  feedDownEnabled: true,
  exitZoneDepthMm: 2,
  exitFeedReductionByMaterial: {
    HPL: 30,
    PLYWOOD: 30,
    MELAMINE: 25,
  },
};

/**
 * Default exit feed reduction settings.
 * Exported for test verification.
 * @since D5-C.1B
 */
export const DEFAULT_EXIT_FEED_REDUCTION = {
  feedDownEnabled: true,
  exitZoneDepthMm: 2,
  exitFeedReductionByMaterial: {
    HPL: 30,
    PLYWOOD: 30,
    MELAMINE: 25,
  },
};

/**
 * Default fallback panel thickness (mm).
 */
export const DEFAULT_FALLBACK_THICKNESS_MM = 18;

/**
 * Materials that are sensitive to through-hole breakout.
 */
const THROUGH_HOLE_SENSITIVE_MATERIALS: readonly ThroughHoleSensitiveMaterial[] = [
  'HPL',
  'PLYWOOD',
  'MELAMINE',
];

/**
 * Resolve panel thickness from panelFrames or fallback.
 */
function resolvePanelThickness(
  panelId: string | undefined,
  policyOptions: CncPolicyOptions | undefined
): { thicknessMm: number; resolved: boolean } {
  // Try to get from panelFrames
  if (panelId && policyOptions?.panelFrames) {
    const frame = policyOptions.panelFrames[panelId];
    if (frame && typeof frame.thicknessMm === 'number' && frame.thicknessMm > 0) {
      return { thicknessMm: frame.thicknessMm, resolved: true };
    }
  }

  // Use explicit fallback if provided
  if (typeof policyOptions?.fallbackThicknessMm === 'number' && policyOptions.fallbackThicknessMm > 0) {
    return { thicknessMm: policyOptions.fallbackThicknessMm, resolved: false };
  }

  // Default fallback
  return { thicknessMm: DEFAULT_FALLBACK_THICKNESS_MM, resolved: false };
}

/**
 * Check if material class is sensitive to through-hole breakout.
 */
function isThroughHoleSensitiveMaterial(
  materialClass: MaterialClass
): materialClass is ThroughHoleSensitiveMaterial {
  return (THROUGH_HOLE_SENSITIVE_MATERIALS as readonly string[]).includes(materialClass);
}

/**
 * Detect through-hole and decide exit dwell + feed reduction.
 * Pure function for deterministic decision.
 * @since D5-C.1B: Added feed-down near exit calculation
 */
function decideThroughHole(
  depthMm: number,
  panelThicknessMm: number,
  thicknessResolved: boolean,
  materialClass: MaterialClass,
  baseFeedRate: number,
  tuning?: ThroughHoleTuning
): ThroughHoleDecision {
  // Merge with defaults
  const effectiveTuning: Required<ThroughHoleTuning> = {
    ...DEFAULT_THROUGH_HOLE_TUNING,
    ...tuning,
    dwellSecByMaterial: {
      ...DEFAULT_THROUGH_HOLE_TUNING.dwellSecByMaterial,
      ...tuning?.dwellSecByMaterial,
    },
    exitFeedReductionByMaterial: {
      ...DEFAULT_THROUGH_HOLE_TUNING.exitFeedReductionByMaterial,
      ...tuning?.exitFeedReductionByMaterial,
    },
  };

  // Check if through-hole detection is enabled
  if (!effectiveTuning.enabled) {
    return {
      isThroughHole: false,
      panelThicknessMm,
      thicknessResolved,
      exitDwellSec: 0,
      isSensitiveMaterial: false,
      exitFeedReductionPercent: 0,
      exitZoneDepthMm: 0,
      exitZoneStartMm: 0,
      exitFeedRateMmMin: 0,
    };
  }

  // Detect through-hole: depth >= (thickness - allowance)
  const isThroughHole = depthMm >= (panelThicknessMm - effectiveTuning.breakthroughAllowanceMm);

  // Check if material is sensitive
  const isSensitiveMaterial = isThroughHoleSensitiveMaterial(materialClass);

  // Calculate exit dwell (D5-C.1A: only for through-hole + sensitive material)
  let exitDwellSec = 0;
  if (isThroughHole && isSensitiveMaterial) {
    exitDwellSec = effectiveTuning.dwellSecByMaterial[materialClass] ?? 0;
  }

  // D5-C.1B: Calculate feed reduction near exit
  let exitFeedReductionPercent = 0;
  let exitZoneDepthMm = 0;
  let exitZoneStartMm = 0;
  let exitFeedRateMmMin = 0;

  if (isThroughHole && isSensitiveMaterial && effectiveTuning.feedDownEnabled) {
    // Get material-specific feed reduction
    exitFeedReductionPercent = effectiveTuning.exitFeedReductionByMaterial[materialClass] ?? 0;

    if (exitFeedReductionPercent > 0) {
      // Calculate exit zone depth (clamp to max 50% of panel thickness)
      const maxExitZone = panelThicknessMm * 0.5;
      exitZoneDepthMm = Math.min(effectiveTuning.exitZoneDepthMm, maxExitZone);

      // Calculate where exit zone starts (from panel top)
      exitZoneStartMm = panelThicknessMm - exitZoneDepthMm;

      // Calculate reduced feed rate
      exitFeedRateMmMin = Math.round(baseFeedRate * (1 - exitFeedReductionPercent / 100));
    }
  }

  return {
    isThroughHole,
    panelThicknessMm,
    thicknessResolved,
    exitDwellSec,
    isSensitiveMaterial,
    exitFeedReductionPercent,
    exitZoneDepthMm,
    exitZoneStartMm,
    exitFeedRateMmMin,
  };
}

/**
 * Check if through-hole dwell should be applied.
 * Convenience function for dialects.
 */
export function shouldApplyThroughHoleDwell(decision: ThroughHoleDecision): boolean {
  return decision.isThroughHole && decision.isSensitiveMaterial && decision.exitDwellSec > 0;
}
