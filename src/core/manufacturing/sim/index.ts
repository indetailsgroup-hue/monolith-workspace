// src/core/manufacturing/sim/index.ts
/**
 * Simulation Module.
 *
 * IR program simulation and verification for factory safety.
 *
 * v0.10.7.3 - Simulation Kernel
 */

// Report types
export {
  // Types
  type SimSeverity,
  type SimIssueCode,
  type SimIssue,
  type SimStats,
  type SheetBounds,
  type ForbiddenZoneKind,
  type ForbiddenZone,
  type SimVerdict,
  type SimAudit,
  type SimulationReport,

  // Helpers
  createEmptyStats,
  createDefaultSheetBounds,
  isInRect,
  isInBounds,
  getErrorIssues,
  getWarningIssues,
  formatSimulationReport,
} from "./simReport.v1";

// Rules
export {
  // Types
  type SimRule,
  type SimThresholds,
  type RuleOverride,
  type SimConfig,

  // Constants
  SIM_RULES,
  DEFAULT_THRESHOLDS,
  DEFAULT_SIM_CONFIG,
  RULES_VERSION,

  // Functions
  getEffectiveSeverity,
  shouldApplyRule,
  getRulesVersion,
} from "./simRules";

// Arc utilities
export {
  // Types
  type Point2D,
  type Point3D,
  type ArcGeometry,

  // Distance
  dist2D,
  dist3D,
  distOptional,

  // Arc calculations
  calculateArcGeometry,
  arcLength,
  isArcRadiusConsistent,
  getArcCenter,

  // Interpolation
  interpolateArc,
  sampleArc,

  // Validation
  validateArc,
} from "./arcUtils";

// Simulator
export {
  // Types
  type SimulationRequest,

  // Main simulator
  simulateIrProgram,

  // Quick helpers
  quickSimulate,
  getSimulationStats,

  // Factory helpers
  createSimRequestFromProfile,
  createClampZone,
  createVacuumPodZone,
} from "./simulateIrProgram";
