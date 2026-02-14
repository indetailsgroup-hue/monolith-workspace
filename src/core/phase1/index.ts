/**
 * Phase 1: Designer + Factory Core
 *
 * NORTH STAR: "Spec → OperationGraph → Validation/Gate → Export"
 *
 * Tri-Persona Experience:
 * - Designer (ลื่น): Fast, flexible editing with smart defaults
 * - Factory (เชื่อ): Validated data with trust chain
 * - Sales (อธิบายได้): Clear specs for customer communication
 *
 * @version 1.0.0 - Phase 1
 */

// ============================================
// TYPES
// ============================================

export type {
  // Common types
  PanelFace,
  EdgeSide,
  GateSeverity,
  GateEntityType,
  GateIssueCode,

  // Gate types
  GateIssue,
  GateSnapshot,

  // Edit types
  EditChange,
  EditResult,
  CabinetSpecPatch,
  PanelSpecPatch,

  // Placement types
  AssetKind,
  PlacementTarget,
  PlacementAlign,
  SeamAlign,
  PlacementOptions,
  PlaceAssetRequest,
  PlacementResolution,
  CreatedEntity,
  PlaceAssetResult,
  PlacementError,

  // Factory Truth types
  OverlayOpKind,
  FactoryTruthPoint,
  FactoryTruthFilters,
  FactoryTruthStats,
  FactoryTruthSnapshot,

  // Edge types
  EdgePolicy,
  EdgePolicyMode,
  PanelEdgeState,
  EdgeAdjacency,
  EdgeRuleContext,
  ApplyEdgeRulesInput,
  ApplyEdgeRulesResult,
  SetPanelEdgePolicyInput,
} from './types';

export { GATE_ISSUE_CODES, DEFAULT_EDGE_POLICY, EMPTY_GATE_SNAPSHOT } from './types';

// ============================================
// A1: SMART EDIT API
// ============================================

export {
  editCabinetSpec,
  editPanelSpec,
  applyMaterialToPanel,
  applyMaterialToCabinet,
  setGrainDirection,
} from './smartEdit';

// ============================================
// A2: DRAG & DROP PLACEMENT API
// ============================================

export {
  // Main function
  placeAsset,
  previewPlacement,

  // Snap utilities
  snapToSystem32,
  getSystem32Positions,

  // Collision detection
  checkCollision,

  // Compartment calculations
  calculateCompartments,

  // Position helpers
  getValidShelfPositions,
  resolvePlacement,
} from './placement';

// ============================================
// B1: FACTORY TRUTH MODE API
// ============================================

export {
  buildFactoryTruthSnapshot,
  getPanelFactoryTruth,
  getRiskPoints,
  hasFailRisks,
} from './factoryTruth';

// ============================================
// B2: EDGE RULE ENGINE API
// ============================================

export {
  // Edge context
  getEdgeRuleContext,
  getPanelEdgeStates,
  getEdgesNeedingPolicy,

  // Edge operations
  applyEdgeRules,
  setPanelEdgePolicy,
  getRecommendedPolicy,

  // Bulk operations
  getPanelsWithMissingEdgePolicies,
  clearPanelEdgePolicies,
  copyEdgePolicies,
} from './edgeRule';

// ============================================
// GATE (Validation)
// ============================================

export {
  runPhase1Gate,
  getCurrentGateSnapshot,
  canExport,
  getBlockingIssues,
} from './gate';
