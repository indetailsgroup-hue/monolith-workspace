/**
 * decideDrillParams.ts - Drill Policy Decision Helper
 *
 * Centralized helper for deciding drill parameters using the policy engine.
 * Called by dialect emitters to get G81/G82/G83 selection and feed/speed.
 *
 * @version 1.0.0 - Phase D5-B
 */

import { CONSERVATIVE_DRILL_POLICY } from '../policy';
import type {
  DrillPolicy,
  DrillParameters,
  HoleSpec,
  MaterialClass,
} from '../policy';
import type { MachineProfile, ToolCapability } from '../machine/machineProfile';
import { getTool } from '../machine/machineProfile';
import type { Operation, DrillOperation, BoreOperation } from '../operation/operationTypes';
import { isDrillOperation, isBoreOperation } from '../operation/operationTypes';
import type { CncPolicyOptions } from './types';

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

  // Resolve panel thickness (for through-hole detection)
  const panelThickness = input.panelThickness ?? 18; // Default 18mm if unknown

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

  return {
    params,
    holeSpec,
    materialClass,
    tool,
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
