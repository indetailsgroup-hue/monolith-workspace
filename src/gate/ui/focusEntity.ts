/**
 * Focus Entity Utility
 *
 * Provides camera focus functionality for Gate findings.
 * Integrates with useViewStore to animate camera to entity positions.
 *
 * @version 1.0.0 - Phase A: Gate → UI Integration
 */

import { useViewStore } from '../../core/store/useViewStore';
import { useDrillMapStore } from '../../core/store/useDrillMapStore';
import { useGateStore } from './gateStore';
import {
  getEntityPositions,
  calculateBoundingBox,
} from './selectionResolvers';

// ============================================
// FOCUS ON ENTITY IDS
// ============================================

/**
 * Focus the camera on a set of entity IDs.
 * Calculates the bounding box of all entities and positions the camera
 * to view them all.
 *
 * @param entityIds - Array of DrillMapPoint IDs to focus on
 */
export function focusOnEntityIds(entityIds: string[]): void {
  if (entityIds.length === 0) {
    console.log('[FocusEntity] No entities to focus on');
    return;
  }

  const drillMap = useDrillMapStore.getState().drillMap;
  const positions = getEntityPositions(drillMap, entityIds);

  if (positions.size === 0) {
    console.log('[FocusEntity] No positions found for entities:', entityIds);
    return;
  }

  // Convert Map to array
  const posArray = Array.from(positions.values());
  const { center, size } = calculateBoundingBox(posArray);

  // Use view store to focus on the bounding box
  useViewStore.getState().focusOnTarget({
    position: center,
    size,
  });

  console.log(
    `[FocusEntity] Focused on ${entityIds.length} entities at ` +
    `[${center.map(n => n.toFixed(0)).join(', ')}]`
  );
}

// ============================================
// FOCUS ON SINGLE ENTITY
// ============================================

/**
 * Focus on a single entity with tighter framing.
 *
 * @param entityId - Single DrillMapPoint ID to focus on
 */
export function focusOnEntity(entityId: string): void {
  focusOnEntityIds([entityId]);
}

// ============================================
// FOCUS + SELECT
// ============================================

/**
 * Focus on entities and update Gate selection state.
 * This is the main action called from UI when user clicks "Focus" button.
 *
 * @param findingKey - The finding key being focused
 * @param entityIds - Entity IDs from the finding
 */
export function focusAndSelectFinding(findingKey: string, entityIds: string[]): void {
  // Import here to avoid circular dependency
  // Update selection state
  useGateStore.getState().selectFinding(findingKey, entityIds);

  // Focus camera on entities
  focusOnEntityIds(entityIds);

  // Enable X-Ray mode for better visibility of drill points
  useViewStore.getState().setXRayMode(true);

  // Make drill map visible if not already
  const drillMapStore = useDrillMapStore.getState();
  if (!drillMapStore.visible) {
    drillMapStore.setVisible(true);
  }
}

// ============================================
// CLEAR FOCUS
// ============================================

/**
 * Clear entity focus and return to normal view.
 */
export function clearEntityFocus(): void {
  // Clear selection
  useGateStore.getState().clearSelection();

  // Clear camera override (return to preset view)
  useViewStore.getState().clearCameraOverride();

  // Optionally disable X-Ray mode
  // useViewStore.getState().setXRayMode(false);
}
