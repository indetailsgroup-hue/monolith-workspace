/**
 * Gate UI Module
 *
 * Exports all Gate UI integration components and utilities.
 *
 * @version 1.1.0 - Phase B1: Gate Enforcement
 */

// Types
export * from './gateTypes';

// Store
export { useGateStore, useGatePassed, useSelectedFinding } from './gateStore';
export type { GateUIState, GateUIActions } from './gateTypes';

// Utilities
export { resolveSelectionToEntityIds, getEntityPositions, calculateBoundingBox, getEntitiesByIds, getPanelForEntity } from './selectionResolvers';
export { focusOnEntityIds, focusOnEntity, focusAndSelectFinding, clearEntityFocus } from './focusEntity';
export { applyGatePatches, applyFindingFix, previewGatePatches } from './applyGatePatch';

// Export Gate Hook (Phase B1)
export {
  useExportGate,
  getExportGateStatus,
  isExportAllowed,
  isFreezeAllowed,
  isReleaseAllowed,
} from './useExportGate';
export type { ExportGateStatus, ExportGateActions } from './useExportGate';

// UI Components
export { GateStatusIndicator } from './GateStatusIndicator';
export { SafetyPanel } from './SafetyPanel';
export { RightInspectorSafetySection } from './RightInspectorSafetySection';
export { GateSceneHighlights } from './GateSceneHighlights';
export { GateBlockerModal } from './GateBlockerModal';
