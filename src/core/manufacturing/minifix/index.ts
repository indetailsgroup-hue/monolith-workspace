/**
 * SPEC-MINIFIX-JOINT-LOGIC v1.0
 * Minifix Module - Public API
 */

// Contracts
export type {
  JointStyle,
  JointPosition,
  PanelRole,
  Vec3,
  FaceRef,
  EdgeRef,
  EdgeFaceRef,
  MinifixSpec,
  MinifixPlacement,
  ValidationSeverity,
  ValidationIssue,
  ValidationResult,
  MinifixJointConfig,
  MinifixJointResolution,
  DrillOpType,
  MinifixDrillOp,
  PanelDrillOps,
} from "../../../contracts/minifixJointContracts";
export { DEFAULT_MINIFIX_SPEC } from "../../../contracts/minifixJointContracts";

// Guards
export {
  dot,
  magnitude,
  normalize,
  isPerpendicular,
  isParallel,
  isSameDirection,
  distance,
  isFaceRef,
  isEdgeRef,
  isEdgeFaceRef,
  isMinifixPlacement,
  validateCamAxis,
  validateBoltAxis,
  validateAlignment,
  validateSpec,
  validatePanelRoles,
  validatePlacement,
  validatePlacements,
} from "../../../contracts/minifixJointGuards";

// Placement Resolution
export type {
  MinifixTopologyApi,
  PanelBounds,
  PanelOrientation,
} from "./resolveMinifixPlacement";
export {
  resolveMinifixPlacement,
  resolveAllMinifixPlacements,
  autoDetectMinifixJoints,
} from "./resolveMinifixPlacement";

// Operations Compiler
export type { DrillCycleParams } from "./compileMinifixToOps";
export {
  compileMinifixToOps,
  compileAllMinifixToOps,
  opToGCodeComment,
  getDrillCycleParams,
  sortOperationsForMachining,
  estimateMachiningTime,
} from "./compileMinifixToOps";

// Cabinet Topology
export {
  createCabinetTopologyApi,
  detectCabinetMinifixJoints,
  getCabinetPanelIds,
} from "./cabinetTopologyApi";
