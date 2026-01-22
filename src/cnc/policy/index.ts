/**
 * CNC Policy Module
 *
 * Deterministic drilling policy system for production-safe CNC operations.
 *
 * @version 1.0.0 - Phase D5-A
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
