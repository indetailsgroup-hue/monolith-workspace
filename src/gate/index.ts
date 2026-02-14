/**
 * Gate v0.1 Module
 *
 * Deterministic manufacturing validation
 * "โรงงานก่อน ความสวยทีหลัง"
 */

// Types
export type {
  RuleId,
  GateIssue,
  GateMetrics,
  GatePolicy,
  EdgeSide,
  EdgeSpec,
  MaterialSpec,
  PartSpec,
  DrillOp,
  FittingIntent,
  GateInput,
  GateOutput,
} from './types';

// Policy
export { DEFAULT_GATE_POLICY_V1 } from './policy';

// Compute
export { compositeThicknessMm } from './compute/composite';
export { computeCutW, computeCutH, computeCutSize } from './compute/cutSize';

// Runner
export { runGateV01, canReleaseFromGate, getBlockers, getWarnings } from './runGate';

// Rules (for advanced usage / testing)
export {
  ruleCutSizeNonNegative,
  ruleEdgeAllowance,
  ruleMinMargins,
  ruleClearanceBackPanel,
  ruleDrillDepthSafety,
  ruleFittingSpacing,
} from './rules';

// Builders (from Part Breakdown)
export type {
  BreakdownEdgeColumns,
  BreakdownMaterialColumns,
  PartBreakdownRow,
  BuildGateInputOptions,
} from './builders';

export {
  buildPartsFromBreakdown,
  buildGateInputFromBreakdown,
  createDefaultEdgeConfig,
  createNoEdgeConfig,
} from './builders';
