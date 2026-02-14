/**
 * Gizmo Module Index
 *
 * Exports all gizmo-related types, functions, and utilities
 */

// Types
export type { GizmoSpace, GizmoOp, GizmoAxis, GizmoPlane, GizmoHandleKind, GizmoPlaneMode, GizmoHandle, GizmoSettings } from './gizmoTypes';
export { DEFAULT_GIZMO_SETTINGS, GIZMO_HOTKEYS, GIZMO_STEP_SIZES, getPlaneMode, isPlaneHandle } from './gizmoTypes';

// Axis utilities
export type { LocalAxes } from './gizmoAxis';
export {
  WORLD_AXIS_X,
  WORLD_AXIS_Y,
  WORLD_AXIS_Z,
  IDENTITY_LOCAL_AXES,
  getAxisUnit,
  localAxesFromYRotation,
  localAxesFromEuler,
  getMostAlignedAxis,
  isNearAxisHandle,
} from './gizmoAxis';

// Translate drag
export type { Ray, AxisDragState, RayPlaneResult } from './translateAxisDrag';
export {
  computeAxisDragPlane,
  computeFallbackPlaneNormal,
  intersectRayPlane,
  intersectRayPlaneEx,
  beginAxisDrag,
  updateAxisDrag,
  updateAxisDragStable,
  calculateDragPosition,
  createRayFromCamera,
  getViewDirection,
  quantizeDeltaAlongAxis,
  applyFineFactor,
  applyDeadzone as applyDragDeadzone,
  clampDeltaMagnitude,
} from './translateAxisDrag';

// Session state machine
export type { GizmoPhase, GizmoDragKind, GizmoSession, GizmoDragContext, GizmoDragInput } from './gizmoSession';
export {
  createGizmoSession,
  beginGizmoDrag,
  beginGizmoPlainDrag,
  beginGizmoHandleDrag,
  updateGizmoDrag,
  endGizmoDrag,
  cancelGizmoDrag,
  toggleGizmoSpace,
  setGizmoSpace,
  setGizmoStepSize,
  isDragging,
  isDraggingAxis,
  isDraggingPlane,
  getDragDistance,
  getDragDistanceAlongAxis,
  getPlaneDragDelta2D,
  getDragKind,
} from './gizmoSession';

// Orchestrator (snap + gate integration)
export type {
  OrchestratedDragResult,
  DragTelemetry,
  SnapQueryFn,
  GateCheckFn,
  TelemetryFn,
  OrchestratorState,
} from './gizmoOrchestrator';
export {
  createOrchestratorState,
  beginOrchestratedDrag,
  updateOrchestratedDrag,
  endOrchestratedDrag,
  cancelOrchestratedDrag,
  calculateSnapOffset,
  isWithinSnapThreshold,
  blendGizmoAndSnap,
  getEffectiveStepSize,
} from './gizmoOrchestrator';

// Stability utilities
export type { StabilityFilterState } from './gizmoStability';
export {
  MIN_AXIS_VIEW_DOT,
  DEADZONE_MM,
  MAX_VELOCITY_MM,
  DELTA_SMOOTHING,
  isAxisUnstable,
  getFallbackPlaneNormal,
  hasFlipped,
  preventFlip,
  applyDeadzone,
  calculateVelocity,
  clampVelocity,
  smoothDelta,
  createStabilityFilterState,
  applyStabilityFilters,
  getAxisStability,
} from './gizmoStability';

// Snap blending (jitter prevention)
export {
  engageStrength,
  engageStrengthWithHysteresis,
  blendFreeDeltaNearSnap,
  blendDeltasWithStrength,
  applyEngagedDeadzone,
  smoothDeltaChange,
  analyzeSnapCandidates,
  SNAP_BLEND_DEFAULTS,
} from './snapBlend';

// Axis picker (screen-space picking)
export type {
  ScreenPoint,
  AxisPickResult,
  AxisPickerConfig,
  AxisHoverState,
} from './axisPicker';
export {
  DEFAULT_PICKER_CONFIG,
  projectToScreen,
  distPointToSegment,
  axisParallelFactor,
  pickGizmoAxis,
  calculateDynamicAxisLength,
  updateAxisHover,
} from './axisPicker';

// Plane drag (two-axis movement)
export type {
  PlaneAxisLock,
  PlaneDelta2D,
  PlaneDragState,
  PlaneDragResult,
} from './translatePlaneDrag';
export {
  getPlaneNormal,
  getPlaneBasis,
  getPlaneBasisLocal,
  beginPlaneDrag,
  updatePlaneDrag,
  updatePlaneDragStable,
  updatePlaneDragConstrained,
  calculatePlaneDragPosition,
  quantizePlaneDelta2D,
  planeDelta2DToWorld,
  quantizePlaneDragResult,
  getPlaneAxisLabels,
  getPlaneLockedAxis,
  applyPlaneFine,
  lockDeltaToAxis,
  getLockLabel,
  isPlaneAxisLocked,
  setPlaneAxisLock,
} from './translatePlaneDrag';

// Plane picker (screen-space picking)
export type {
  PlanePickResult,
  PlanePickerConfig,
  PlaneHoverState,
  UnifiedPickResult,
} from './planePicker';
export {
  DEFAULT_PLANE_PICKER_CONFIG,
  getPlaneHandleCorners,
  getPlaneHandleCenter,
  pickGizmoPlane,
  pickGizmoHandle,
  updatePlaneHover,
} from './planePicker';

// Plane picker V2 (DCC-grade with center + edge handles)
export type {
  PlanePickV2Result,
  PlanePickV2Config,
} from './planePickerV2';
export {
  DEFAULT_PLANE_PICK_V2_CONFIG,
  pickPlaneHandleV2,
  planePickV2ToHandle,
  pickHandleV2,
} from './planePickerV2';

// Constant screen size (production-grade gizmo scaling)
export type {
  UseConstantScreenSizeOptions,
  ConstantScreenSizeResult,
} from './useConstantScreenSize';
export {
  useConstantScreenSize,
  useConstantScreenSizeReactive,
  calculateConstantScale,
} from './useConstantScreenSize';

// Grid origin (quantized grid alignment)
export type {
  GridOriginOptions,
  GridOriginResult,
} from './gridOriginOnPlane';
export {
  gridOriginOnPlane,
  calculateGridExtent,
  isOnGridLine,
} from './gridOriginOnPlane';

// Render layers and flags (gizmo overlay rendering)
export type {
  GizmoLayerKey,
  GizmoLayerValue,
  RenderOrderKey,
  RenderOrderValue,
  GizmoMaterialFlags,
} from './gizmoLayers';
export {
  GIZMO_LAYERS,
  RENDER_ORDER,
  GIZMO_MATERIAL_FLAGS,
  createLayerMask,
  setObjectLayers,
  addObjectToLayers,
  isObjectOnLayer,
  setupCameraLayers,
  setupGizmoCamera,
  applyGizmoFlags,
  createOverlayMaterial,
  createOverlayLineMaterial,
} from './gizmoLayers';
