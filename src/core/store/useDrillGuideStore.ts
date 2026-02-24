/**
 * Drill Guide Store — State management for Red Drill Guide Lines tool
 *
 * Mode state machine:
 *   idle → (activate) → selectJoint → (selectJoint) → active
 *   active → (clearSelection) → selectJoint
 *   any → (deactivate) → idle
 *
 * Joint grouping is derived from DrillMapPoint.pairId corner keys.
 * v0.1 — initial implementation
 */

import { create } from 'zustand';
import type { DrillMap, DrillMapPoint } from '../manufacturing/drillMap/types';
import { buildJointMap, type JointHotspot } from '../drillGuide/buildJointMap';
import { useDrillMapStore } from './useDrillMapStore';

// ============================================
// TYPES
// ============================================

export type DrillGuideMode = 'idle' | 'selectJoint' | 'active';

export interface DrillGuideState {
  /** Current tool mode */
  mode: DrillGuideMode;

  /** Joint key being hovered (for ghost preview) */
  hoveredJointKey: string | null;

  /** Joint key that was clicked (shows full guide lines) */
  selectedJointKey: string | null;

  /** Map from jointKey → DrillMapPoints belonging to that joint */
  jointMap: Map<string, DrillMapPoint[]>;

  /** Hotspot metadata for rendering joint selection spheres */
  hotspots: JointHotspot[];

  // Actions
  activate: () => void;
  deactivate: () => void;
  setHovered: (key: string | null) => void;
  selectJoint: (key: string) => void;
  clearSelection: () => void;
  rebuildFromDrillMap: (drillMap: DrillMap) => void;
}

// ============================================
// STORE
// ============================================

export const useDrillGuideStore = create<DrillGuideState>((set, get) => ({
  mode: 'idle',
  hoveredJointKey: null,
  selectedJointKey: null,
  jointMap: new Map(),
  hotspots: [],

  /**
   * Activate the drill guide tool.
   * Rebuilds joint map from current DrillMap data.
   * idle → selectJoint
   */
  activate: () => {
    const drillMap = useDrillMapStore.getState().drillMap as DrillMap | null;

    if (drillMap) {
      const { jointMap, hotspots } = buildJointMap(drillMap);
      set({
        mode: 'selectJoint',
        hoveredJointKey: null,
        selectedJointKey: null,
        jointMap,
        hotspots,
      });
    } else {
      // No drill map available — still enter mode but empty
      set({
        mode: 'selectJoint',
        hoveredJointKey: null,
        selectedJointKey: null,
        jointMap: new Map(),
        hotspots: [],
      });
    }
  },

  /**
   * Deactivate the drill guide tool.
   * any → idle, clear all state
   */
  deactivate: () => {
    set({
      mode: 'idle',
      hoveredJointKey: null,
      selectedJointKey: null,
      jointMap: new Map(),
      hotspots: [],
    });
  },

  /**
   * Set hovered joint key (for ghost preview).
   */
  setHovered: (key: string | null) => {
    set({ hoveredJointKey: key });
  },

  /**
   * Select a joint by clicking its hotspot.
   * selectJoint → active (or re-select in active mode)
   */
  selectJoint: (key: string) => {
    const state = get();
    if (state.mode === 'idle') return;

    // Toggle: clicking same joint deselects
    if (state.selectedJointKey === key) {
      set({
        mode: 'selectJoint',
        selectedJointKey: null,
      });
    } else {
      set({
        mode: 'active',
        selectedJointKey: key,
      });
    }
  },

  /**
   * Clear current joint selection.
   * active → selectJoint
   */
  clearSelection: () => {
    const state = get();
    if (state.mode !== 'active') return;

    set({
      mode: 'selectJoint',
      selectedJointKey: null,
    });
  },

  /**
   * Rebuild joint map from a DrillMap (e.g., when drill map changes).
   */
  rebuildFromDrillMap: (drillMap: DrillMap) => {
    const state = get();
    if (state.mode === 'idle') return;

    const { jointMap, hotspots } = buildJointMap(drillMap);
    set({ jointMap, hotspots });

    // If selected joint no longer exists, clear selection
    if (state.selectedJointKey && !jointMap.has(state.selectedJointKey)) {
      set({
        mode: 'selectJoint',
        selectedJointKey: null,
      });
    }
  },
}));
