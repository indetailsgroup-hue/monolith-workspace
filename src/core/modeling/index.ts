/**
 * Modeling Module - Plasticity-Style UX Layer
 *
 * "Designer thinks in shapes → System records as Manufacturing Intent"
 *
 * Features:
 * - Command Palette (Space/Cmd+K)
 * - Context-sensitive selection tools
 * - Profile library with CAM validation
 * - Design intent recording (not mesh hacking)
 *
 * v1.0: Initial modeling layer
 */

// Types
export type {
  SelectionType,
  SelectionTarget,
  ModelingCommand,
  CommandDefinition,
  DesignIntentType,
  DesignIntentBase,
  EdgeProfileIntent,
  EdgeBandIntent,
  GrooveIntent,
  DadoIntent,
  RabbetIntent,
  RevealIntent,
  ShadowGapIntent,
  KerfBendIntent,
  HolePatternIntent,
  SurfacePatternIntent,
  DesignIntent,
  Point2D,
  BezierSegment,
  ProfileAsset,
  ActiveToolMode,
  ToolState,
  ImportSourceType,
  ImportAsType,
  ImportedGeometry,
} from './types';

// Constants
export { MODELING_COMMANDS, BUILT_IN_PROFILES } from './types';

// Store
export {
  useModelingStore,
  useSelectionType,
  useToolMode,
  useCommandPaletteOpen,
  useAvailableCommands,
  usePreflightResult,
} from './useModelingStore';

// Drag Interaction
export type {
  DragAxis,
  DragState,
  DragConfig,
  DualAxisDragState,
  DualAxisConfig,
  CursorHUDData,
} from './dragInteraction';
export {
  createDragState,
  updateDragState,
  endDrag,
  createDragHandlers,
  debounceUpdate,
  createDualAxisDragState,
  updateDualAxisDragState,
  createDualAxisDragHandlers,
} from './dragInteraction';

// Preflight Validation
export type {
  ValidationSeverity,
  ValidationError,
  PreflightResult,
  PanelContext,
  ToolContext,
  AutoFixAction,
} from './preflight';
export {
  validateIntent,
  validateAllIntents,
  getSeverityColor,
  getSeverityIcon,
} from './preflight';

// Modifier Keys
export {
  useModKeysStore,
  useShiftKey,
  useAltKey,
  useCtrlKey,
  installModKeysListeners,
} from './modKeysStore';

// Snap Utilities
export type { SnapConfig } from './snap';
export {
  SNAP_PRESETS,
  snapValue,
  snapClamp,
  formatSnapValue,
  getSnapConfig,
} from './snap';

// Numeric Entry (CAD-style)
export type { NumericField } from './numericEntryStore';
export {
  useNumericEntryStore,
  useNumericEntryActive,
  useNumericEntryField,
  useNumericEntryBuffer,
  useNumericEntryValue,
} from './numericEntryStore';
export type { NumericEntryOptions } from './numericEntryKeys';
export {
  installNumericEntryKeys,
  createToolApplyHandler,
} from './numericEntryKeys';
