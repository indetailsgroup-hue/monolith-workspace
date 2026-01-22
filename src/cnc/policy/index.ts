/**
 * CNC Policy Module
 *
 * Deterministic drilling policy system for production-safe CNC operations.
 *
 * @version 1.1.0 - Phase D5-C.0: Added drill tuning options
 * @module cnc/policy
 */

// ============================================
// MATERIAL TYPES
// ============================================

export type {
  MaterialClass,
  MaterialHint,
  PanelMaterialContext,
  MaterialMachinability,
} from './materialTypes';

export {
  MATERIAL_MACHINABILITY,
  isKnownMaterial,
  getMachinability,
} from './materialTypes';

// ============================================
// MATERIAL RESOLVER
// ============================================

export {
  resolveMaterialClassFromName,
  resolveMaterialClassForPanel,
  resolveMaterialClassForPanels,
  getSupportedMaterialPatterns,
} from './materialResolver';

// ============================================
// DRILL POLICY TYPES
// ============================================

export type {
  HoleKind,
  CycleType,
  HoleSpec,
  DrillParameters,
  CycleSelectionResult,
  DrillPolicy,
  ToolFeedSpeed,
  CycleRules,
  DrillPolicyConfig,
} from './drillPolicyTypes';

export {
  classifyHoleKind,
  isDeepHole,
} from './drillPolicyTypes';

// ============================================
// CONSERVATIVE POLICY
// ============================================

export {
  CONSERVATIVE_DRILL_POLICY,
  getConservativePolicyConfig,
  createCustomPolicy,
} from './conservativePolicy';

// ============================================
// DRILL TUNING (D5-C.0)
// ============================================

export type {
  RetractMode,
  PeckMode,
  DrillTuningOptions,
  PeckEntry,
} from './drillTuningTypes';

export {
  DEFAULT_RETRACT_MODE,
  DEFAULT_PECK_MODE,
  DEFAULT_DRILL_TUNING,
  PARTIAL_RETRACT_CLEARANCE,
  TAPER_PECK_RATIO,
  TAPER_START_PERCENT,
  calculatePeckSchedule,
  getEffectivePeckDepth,
  needsExplicitPeckSchedule,
} from './drillTuningTypes';
